import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Modal, useWindowDimensions, KeyboardAvoidingView, Platform, Image, Linking } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Fuel, Search, X, Check, XCircle, Calendar } from 'lucide-react-native';
import { FadeInUp } from '../../components/Animations';
import ExportCSVButton from '../../components/ExportCSVButton';
import ConfirmModal from '../../components/ConfirmModal';
import MessageModal, { MessageModalContent } from '../../components/MessageModal';
import DatePickerModal from '../../components/DatePickerModal';
import { getLocalDateString, getFirstOfMonthString } from '../../lib/dateUtils';

type StatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';
type Tab = 'confirmations' | 'topups';
type Source = 'topup' | 'equipment' | 'flushing';

// One row shape for both tabs -- Top-Up Requests come from fuel_topup_requests,
// Fuel Confirmations from the fuel_* columns on equipment_entries/flushing_entries.
type FuelRow = {
  id: string;
  source: Source;
  entry_date: string;
  company: string | null;
  vehicle_number: string;
  equipment_name: string | null;
  supplier_name?: string | null;
  photo_url?: string | null;
  foreman_name: string;
  requested_quantity: number | null;
  quantity: number;
  unit: string;
  remarks: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  job_name: string;
};

const SOURCE_TABLE: Record<Exclude<Source, 'topup'>, string> = {
  equipment: 'equipment_entries',
  flushing: 'flushing_entries',
};

const StatusPill = ({ status }: { status: string }) => {
  if (status === 'APPROVED') return <View className="bg-green-100 px-3 py-1 rounded-full"><Text className="text-green-700 font-bold text-[10px] uppercase">Approved</Text></View>;
  if (status === 'REJECTED') return <View className="bg-red-100 px-3 py-1 rounded-full"><Text className="text-red-700 font-bold text-[10px] uppercase">Rejected</Text></View>;
  return <View className="bg-amber-100 px-3 py-1 rounded-full"><Text className="text-amber-700 font-bold text-[10px] uppercase">Pending</Text></View>;
};

const SourceBadge = ({ source }: { source: Source }) => {
  if (source === 'equipment') return <View className="bg-blue-100 px-2.5 py-1 rounded-full"><Text className="text-blue-700 font-bold text-[10px] uppercase">Equipment</Text></View>;
  if (source === 'flushing') return <View className="bg-cyan-100 px-2.5 py-1 rounded-full"><Text className="text-cyan-700 font-bold text-[10px] uppercase">Flushing</Text></View>;
  return <View className="bg-indigo-100 px-2.5 py-1 rounded-full"><Text className="text-indigo-700 font-bold text-[10px] uppercase">Top-Up Request</Text></View>;
};

export default function FuelRequestsScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('confirmations');
  const [topups, setTopups] = useState<FuelRow[]>([]);
  const [confirmations, setConfirmations] = useState<FuelRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');
  const [messageModal, setMessageModal] = useState<MessageModalContent | null>(null);

  const [fromDate, setFromDate] = useState(getFirstOfMonthString());
  const [toDate, setToDate] = useState(getLocalDateString());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const [approveTarget, setApproveTarget] = useState<FuelRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<FuelRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tu, eq, fl] = await Promise.all([
        supabase
          .from('fuel_topup_requests')
          .select('*, jobs:job_id (job_name), equipment_master:equipment_master_id (equipment_name), suppliers:supplier_id (supplier_name)')
          .gte('entry_date', fromDate)
          .lte('entry_date', toDate)
          .order('entry_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('equipment_entries')
          .select('*, equipment_master:equipment_master_id (equipment_name), jobs:job_id (job_name)')
          .not('fuel_approval_status', 'is', null)
          .gte('entry_date', fromDate)
          .lte('entry_date', toDate)
          .order('entry_date', { ascending: false }),
        supabase
          .from('flushing_entries')
          .select('*, equipment_master:equipment_master_id (equipment_name), jobs:job_id (job_name)')
          .not('fuel_approval_status', 'is', null)
          .gte('entry_date', fromDate)
          .lte('entry_date', toDate)
          .order('entry_date', { ascending: false }),
      ]);
      const failed = [tu, eq, fl].find(r => r.error);
      if (failed) throw failed.error;

      setTopups((tu.data || []).map((r: any): FuelRow => ({
        id: r.id,
        source: 'topup',
        entry_date: r.entry_date,
        company: r.company || null,
        vehicle_number: r.vehicle_number || 'Unknown Vehicle',
        equipment_name: r.equipment_master?.equipment_name || null,
        supplier_name: r.suppliers?.supplier_name || null,
        photo_url: r.photo_url || null,
        foreman_name: r.foreman_name || 'Unknown Foreman',
        requested_quantity: r.requested_quantity,
        quantity: r.quantity,
        unit: r.unit || '',
        remarks: r.remarks || null,
        status: r.status || 'PENDING',
        approved_by: r.approved_by || null,
        approved_at: r.approved_at || null,
        rejection_reason: r.rejection_reason || null,
        job_name: r.jobs?.job_name || 'Unknown Job',
      })));

      const toConfirmation = (source: 'equipment' | 'flushing') => (e: any): FuelRow => ({
        id: e.id,
        source,
        entry_date: e.entry_date,
        company: e.company || null,
        vehicle_number: e.vehicle_number || 'Unknown Vehicle',
        equipment_name: e.equipment_master?.equipment_name || null,
        foreman_name: e.foreman_name || 'Unknown Foreman',
        requested_quantity: e.fuel_requested_quantity ?? null,
        quantity: e.fuel_quantity,
        unit: e.fuel_unit || '',
        remarks: e.remarks || null,
        status: e.fuel_approval_status || 'PENDING',
        approved_by: e.fuel_approved_by || null,
        approved_at: e.fuel_approved_at || null,
        rejection_reason: e.fuel_rejection_reason || null,
        job_name: e.jobs?.job_name || 'Unknown Job',
      });
      const all = [...(eq.data || []).map(toConfirmation('equipment')), ...(fl.data || []).map(toConfirmation('flushing'))];
      all.sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));
      setConfirmations(all);
    } catch (err) {
      console.error('Error loading fuel requests:', err);
      setMessageModal({ title: 'Error', message: 'Failed to load fuel requests.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [fromDate, toDate]);

  const rows = tab === 'topups' ? topups : confirmations;
  const counts = {
    ALL: rows.length,
    PENDING: rows.filter(r => r.status === 'PENDING').length,
    APPROVED: rows.filter(r => r.status === 'APPROVED').length,
    REJECTED: rows.filter(r => r.status === 'REJECTED').length,
  };
  const pendingConfirmations = confirmations.filter(r => r.status === 'PENDING').length;
  const pendingTopups = topups.filter(r => r.status === 'PENDING').length;

  const q = searchQuery.trim().toLowerCase();
  const filtered = rows.filter(r => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (!q) return true;
    return (r.vehicle_number || '').toLowerCase().includes(q)
      || (r.foreman_name || '').toLowerCase().includes(q)
      || (r.job_name || '').toLowerCase().includes(q)
      || (r.equipment_name || '').toLowerCase().includes(q);
  });

  const csvData = filtered.map(r => ({
    Date: r.entry_date,
    Type: r.source === 'topup' ? 'Top-Up Request' : r.source === 'equipment' ? 'Equipment' : 'Flushing',
    Company: r.company || '',
    Job: r.job_name,
    Supplier: r.source === 'topup' ? (r.supplier_name || 'Internal') : '',
    Equipment: r.equipment_name || '',
    Vehicle: r.vehicle_number,
    Foreman: r.foreman_name,
    'Requested Quantity': r.requested_quantity ?? '',
    'Confirmed Quantity': r.quantity,
    Unit: r.unit,
    Status: r.status,
    'Approved/Rejected By': r.approved_by || '',
    'Rejection Reason': r.rejection_reason || '',
    Photo: r.photo_url || '',
  }));

  const updateRow = (target: FuelRow, patch: Partial<FuelRow>) => {
    const apply = (prev: FuelRow[]) => prev.map(r => (r.id === target.id && r.source === target.source ? { ...r, ...patch } : r));
    if (target.source === 'topup') setTopups(apply);
    else setConfirmations(apply);
  };

  const writeDecision = async (target: FuelRow, status: 'APPROVED' | 'REJECTED', reason: string | null) => {
    const approvedAt = new Date().toISOString();
    const { error } = target.source === 'topup'
      ? await supabase
          .from('fuel_topup_requests')
          .update({ status, approved_by: 'Admin', approved_at: approvedAt, rejection_reason: reason })
          .eq('id', target.id)
      : await supabase
          .from(SOURCE_TABLE[target.source])
          .update({ fuel_approval_status: status, fuel_approved_by: 'Admin', fuel_approved_at: approvedAt, fuel_rejection_reason: reason })
          .eq('id', target.id);
    if (error) throw error;
    updateRow(target, { status, approved_by: 'Admin', approved_at: approvedAt, rejection_reason: reason });
  };

  const confirmApprove = async () => {
    if (!approveTarget) return;
    setActing(true);
    try {
      await writeDecision(approveTarget, 'APPROVED', null);
      setApproveTarget(null);
    } catch (err: any) {
      console.error('Error approving fuel request:', err);
      setMessageModal({ title: 'Error', message: 'Failed to approve this request.' });
    } finally {
      setActing(false);
    }
  };

  const confirmReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    setActing(true);
    try {
      await writeDecision(rejectTarget, 'REJECTED', rejectReason.trim());
      setRejectTarget(null);
      setRejectReason('');
    } catch (err: any) {
      console.error('Error rejecting fuel request:', err);
      setMessageModal({ title: 'Error', message: 'Failed to reject this request.' });
    } finally {
      setActing(false);
    }
  };

  return (
    <FadeInUp style={{ flex: 1 }}>
    <View className="flex-1 bg-slate-50">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: isMobile ? 16 : 32, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View className="mb-6 flex-row justify-between items-end flex-wrap" style={{ gap: 12 }}>
          <View>
            <Text className="text-3xl font-black text-slate-900 tracking-tight mb-1">Fuel Requests</Text>
            <Text className="text-slate-500 font-medium">Fuel confirmations and top-up requests, and Store's decision on each.</Text>
          </View>
          <ExportCSVButton data={csvData} filename={tab === 'topups' ? 'fuel_topup_requests' : 'fuel_confirmations'} label="Export CSV" />
        </View>

        <View className="flex-row bg-slate-100 p-1 rounded-xl mb-4 self-start">
          <TouchableOpacity
            onPress={() => setTab('confirmations')}
            className={`px-4 py-2.5 rounded-lg ${tab === 'confirmations' ? 'bg-white shadow-sm' : ''}`}
          >
            <Text className={`font-bold text-sm ${tab === 'confirmations' ? 'text-slate-900' : 'text-slate-500'}`}>
              Fuel Confirmations {pendingConfirmations > 0 ? `(${pendingConfirmations})` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab('topups')}
            className={`px-4 py-2.5 rounded-lg ${tab === 'topups' ? 'bg-white shadow-sm' : ''}`}
          >
            <Text className={`font-bold text-sm ${tab === 'topups' ? 'text-slate-900' : 'text-slate-500'}`}>
              Top-Up Requests {pendingTopups > 0 ? `(${pendingTopups})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        <View className={`${isMobile ? 'flex-col' : 'flex-row'} mb-4`} style={{ gap: 12 }}>
          <TouchableOpacity
            onPress={() => setShowFromPicker(true)}
            className={`flex-row items-center bg-white border border-slate-200 rounded-xl px-4 py-3 ${isMobile ? '' : 'flex-1'}`}
          >
            <Calendar size={18} color="#64748b" />
            <Text className="text-slate-400 text-xs font-bold uppercase ml-3 mr-2">From</Text>
            <Text className="text-slate-900 font-bold">{fromDate}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowToPicker(true)}
            className={`flex-row items-center bg-white border border-slate-200 rounded-xl px-4 py-3 ${isMobile ? '' : 'flex-1'}`}
          >
            <Calendar size={18} color="#64748b" />
            <Text className="text-slate-400 text-xs font-bold uppercase ml-3 mr-2">To</Text>
            <Text className="text-slate-900 font-bold">{toDate}</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row flex-wrap gap-2 mb-4">
          {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as StatusFilter[]).map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => setStatusFilter(f)}
              className={`px-4 py-2 rounded-full border flex-row items-center ${statusFilter === f ? 'bg-[#1e3a8a] border-[#1e3a8a]' : 'bg-white border-slate-200'}`}
            >
              <Text className={`font-bold text-sm ${statusFilter === f ? 'text-white' : 'text-slate-600'}`}>
                {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
              </Text>
              <View className={`ml-2 px-2 py-0.5 rounded-full ${statusFilter === f ? 'bg-white/20' : 'bg-slate-100'}`}>
                <Text className={`text-xs font-bold ${statusFilter === f ? 'text-white' : 'text-slate-500'}`}>{counts[f]}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View className="flex-row items-center bg-white border border-slate-200 rounded-xl px-4 h-12 mb-6">
          <Search size={18} color="#94a3b8" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by vehicle, equipment, foreman, or job..."
            placeholderTextColor="#94a3b8"
            className="flex-1 ml-3 text-slate-900"
            style={{ outlineStyle: 'none' } as any}
          />
          {!!searchQuery && (
            <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1">
              <X size={16} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View className="py-20 items-center">
            <ActivityIndicator size="large" color="#1e3a8a" />
          </View>
        ) : filtered.length === 0 ? (
          <View className="py-20 items-center bg-white rounded-3xl border border-slate-100">
            <View className="bg-slate-50 p-4 rounded-full mb-4">
              <Fuel size={32} color="#94a3b8" />
            </View>
            <Text className="text-slate-900 text-lg font-black">No Requests Found</Text>
            <Text className="text-slate-500 mt-1 text-center">
              {searchQuery ? `Nothing matches "${searchQuery}".` : 'Nothing in this filter for the selected dates.'}
            </Text>
          </View>
        ) : (
          filtered.map(req => (
            <View key={`${req.source}-${req.id}`} className="bg-white rounded-2xl border border-slate-200 mb-3 shadow-sm p-4">
              <View className="flex-row justify-between items-start mb-2">
                <View className="flex-1 pr-2">
                  <View className="flex-row items-center mb-2" style={{ gap: 6 }}>
                    <SourceBadge source={req.source} />
                    <StatusPill status={req.status} />
                  </View>
                  <Text className="text-slate-900 font-bold text-base">
                    {req.equipment_name ? `${req.equipment_name} · ${req.vehicle_number}` : req.vehicle_number}
                  </Text>
                  <Text className="text-slate-500 text-sm mt-0.5">{req.job_name}{req.company ? ` · ${req.company}` : ''}</Text>
                  {req.source === 'topup' && (
                    <Text className="text-slate-400 text-xs mt-0.5">{req.supplier_name ? `Supplier: ${req.supplier_name}` : 'Internal Vehicle'}</Text>
                  )}
                  <Text className="text-slate-400 text-xs mt-1">{req.foreman_name} · {req.entry_date}</Text>
                </View>
                <View className="flex-row items-center bg-amber-50 px-2.5 py-1 rounded-full">
                  <Fuel size={12} color="#d97706" />
                  <Text className="text-amber-800 font-bold text-xs ml-1">{req.quantity} {req.unit}</Text>
                </View>
              </View>

              {req.requested_quantity != null && req.requested_quantity !== req.quantity && (
                <Text className="text-slate-400 text-xs mb-2">Originally requested: {req.requested_quantity} {req.unit}</Text>
              )}

              {req.source === 'topup' && !!req.remarks && (
                <Text className="text-slate-500 text-xs italic mb-2">"{req.remarks}"</Text>
              )}

              {!!req.photo_url && (
                <TouchableOpacity onPress={() => Linking.openURL(req.photo_url!)} className="mb-2 self-start">
                  <Image source={{ uri: req.photo_url }} style={{ width: 120, height: 90, borderRadius: 8 }} resizeMode="cover" />
                  <Text className="text-blue-600 text-[10px] font-bold mt-1">Tap to view photo</Text>
                </TouchableOpacity>
              )}

              {req.status !== 'PENDING' && (
                <Text className="text-slate-400 text-xs mb-2">
                  {req.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {req.approved_by || 'Store'}
                  {req.approved_at ? ` on ${new Date(req.approved_at).toLocaleDateString()}` : ''}
                  {req.rejection_reason ? ` — "${req.rejection_reason}"` : ''}
                </Text>
              )}

              {req.status === 'PENDING' && (
                <View className="flex-row gap-2 mt-2 pt-3 border-t border-slate-100">
                  <TouchableOpacity
                    onPress={() => setRejectTarget(req)}
                    className="flex-1 flex-row items-center justify-center bg-red-50 border border-red-200 py-2.5 rounded-xl active:bg-red-100"
                  >
                    <XCircle size={16} color="#b91c1c" />
                    <Text className="text-red-700 font-bold ml-2">Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setApproveTarget(req)}
                    className="flex-1 flex-row items-center justify-center bg-green-600 py-2.5 rounded-xl active:bg-green-700"
                  >
                    <Check size={16} color="#ffffff" />
                    <Text className="text-white font-bold ml-2">Approve</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <DatePickerModal visible={showFromPicker} date={fromDate} onClose={() => setShowFromPicker(false)} onSelect={setFromDate} />
      <DatePickerModal visible={showToPicker} date={toDate} onClose={() => setShowToPicker(false)} onSelect={setToDate} />

      <ConfirmModal
        visible={!!approveTarget}
        title="Approve Fuel?"
        message={approveTarget ? `Confirms ${approveTarget.quantity} ${approveTarget.unit} for ${approveTarget.vehicle_number}.` : ''}
        confirmText={acting ? 'Approving...' : 'Approve'}
        onConfirm={confirmApprove}
        onCancel={() => setApproveTarget(null)}
      />

      <Modal visible={!!rejectTarget} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-black/50 justify-center px-6">
          <View className="bg-white rounded-[32px] p-6 shadow-2xl">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-black text-slate-900">Reject Fuel</Text>
              <TouchableOpacity onPress={() => setRejectTarget(null)} className="bg-slate-100 p-2 rounded-full">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text className="text-slate-600 mb-4 font-medium">Why is this being rejected? This will be visible to Store and recorded on the entry.</Text>
            <TextInput
              className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-900 text-base mb-6"
              placeholder="e.g. No fuel was actually given, wrong vehicle..."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              value={rejectReason}
              onChangeText={setRejectReason}
              style={{ minHeight: 120, outlineStyle: 'none' } as any}
            />
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => setRejectTarget(null)} className="flex-1 py-4 rounded-xl border border-slate-200 items-center">
                <Text className="text-slate-700 font-bold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmReject}
                className={`flex-1 py-4 rounded-xl items-center ${(!rejectReason.trim() || acting) ? 'bg-red-300' : 'bg-red-600'}`}
                disabled={!rejectReason.trim() || acting}
              >
                {acting ? <ActivityIndicator size="small" color="#ffffff" /> : <Text className="text-white font-bold">Confirm Reject</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <MessageModal content={messageModal} onDismiss={() => setMessageModal(null)} />
    </View>
    </FadeInUp>
  );
}
