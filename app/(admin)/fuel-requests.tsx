import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Modal, useWindowDimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Fuel, Search, X, Check, XCircle } from 'lucide-react-native';
import { FadeInUp } from '../../components/Animations';
import ExportCSVButton from '../../components/ExportCSVButton';
import ConfirmModal from '../../components/ConfirmModal';
import MessageModal, { MessageModalContent } from '../../components/MessageModal';

type StatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';

type FuelRequest = {
  id: string;
  entry_date: string;
  company: string | null;
  vehicle_number: string;
  foreman_name: string;
  requested_quantity: number;
  quantity: number;
  unit: string;
  remarks: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  job_name: string;
};

const StatusPill = ({ status }: { status: string }) => {
  if (status === 'APPROVED') return <View className="bg-green-100 px-3 py-1 rounded-full"><Text className="text-green-700 font-bold text-[10px] uppercase">Approved</Text></View>;
  if (status === 'REJECTED') return <View className="bg-red-100 px-3 py-1 rounded-full"><Text className="text-red-700 font-bold text-[10px] uppercase">Rejected</Text></View>;
  return <View className="bg-amber-100 px-3 py-1 rounded-full"><Text className="text-amber-700 font-bold text-[10px] uppercase">Pending</Text></View>;
};

export default function FuelRequestsScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<FuelRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');
  const [messageModal, setMessageModal] = useState<MessageModalContent | null>(null);

  const [approveTarget, setApproveTarget] = useState<FuelRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<FuelRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('fuel_topup_requests')
        .select('*, jobs:job_id (job_name)')
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRequests((data || []).map((r: any) => ({ ...r, job_name: r.jobs?.job_name || 'Unknown Job' })));
    } catch (err) {
      console.error('Error loading fuel requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const counts = {
    ALL: requests.length,
    PENDING: requests.filter(r => r.status === 'PENDING').length,
    APPROVED: requests.filter(r => r.status === 'APPROVED').length,
    REJECTED: requests.filter(r => r.status === 'REJECTED').length,
  };

  const q = searchQuery.trim().toLowerCase();
  const filtered = requests.filter(r => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (!q) return true;
    return (r.vehicle_number || '').toLowerCase().includes(q)
      || (r.foreman_name || '').toLowerCase().includes(q)
      || (r.job_name || '').toLowerCase().includes(q);
  });

  const csvData = filtered.map(r => ({
    Date: r.entry_date,
    Company: r.company || '',
    Job: r.job_name,
    Vehicle: r.vehicle_number,
    Foreman: r.foreman_name,
    'Requested Quantity': r.requested_quantity,
    'Confirmed Quantity': r.quantity,
    Unit: r.unit,
    Status: r.status,
    'Approved/Rejected By': r.approved_by || '',
    'Rejection Reason': r.rejection_reason || '',
  }));

  const confirmApprove = async () => {
    if (!approveTarget) return;
    setActing(true);
    try {
      const { error } = await supabase
        .from('fuel_topup_requests')
        .update({ status: 'APPROVED', approved_by: 'Admin', approved_at: new Date().toISOString(), rejection_reason: null })
        .eq('id', approveTarget.id);
      if (error) throw error;
      setRequests(prev => prev.map(r => r.id === approveTarget.id ? { ...r, status: 'APPROVED', approved_by: 'Admin', approved_at: new Date().toISOString(), rejection_reason: null } : r));
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
      const { error } = await supabase
        .from('fuel_topup_requests')
        .update({ status: 'REJECTED', approved_by: 'Admin', approved_at: new Date().toISOString(), rejection_reason: rejectReason.trim() })
        .eq('id', rejectTarget.id);
      if (error) throw error;
      setRequests(prev => prev.map(r => r.id === rejectTarget.id ? { ...r, status: 'REJECTED', approved_by: 'Admin', approved_at: new Date().toISOString(), rejection_reason: rejectReason.trim() } : r));
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
        <View className="mb-6 flex-row justify-between items-end flex-wrap">
          <View>
            <Text className="text-3xl font-black text-slate-900 tracking-tight mb-1">Fuel Top-Up Requests</Text>
            <Text className="text-slate-500 font-medium">What Foremen have asked Store to send out, and Store's decision on each.</Text>
          </View>
          <ExportCSVButton data={csvData} filename="fuel_topup_requests" label="Export CSV" />
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
            placeholder="Search by vehicle, foreman, or job..."
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
              {searchQuery ? `Nothing matches "${searchQuery}".` : 'No fuel top-up requests in this filter.'}
            </Text>
          </View>
        ) : (
          filtered.map(req => (
            <View key={req.id} className="bg-white rounded-2xl border border-slate-200 mb-3 shadow-sm p-4">
              <View className="flex-row justify-between items-start mb-2">
                <View className="flex-1 pr-2">
                  <Text className="text-slate-900 font-bold text-base">{req.vehicle_number}</Text>
                  <Text className="text-slate-500 text-sm mt-0.5">{req.job_name}{req.company ? ` · ${req.company}` : ''}</Text>
                  <Text className="text-slate-400 text-xs mt-1">{req.foreman_name} · {req.entry_date}</Text>
                </View>
                <View className="items-end">
                  <StatusPill status={req.status} />
                  <View className="flex-row items-center bg-amber-50 px-2.5 py-1 rounded-full mt-2">
                    <Fuel size={12} color="#d97706" />
                    <Text className="text-amber-800 font-bold text-xs ml-1">{req.quantity} {req.unit}</Text>
                  </View>
                </View>
              </View>

              {!!req.remarks && (
                <Text className="text-slate-500 text-xs italic mb-2">"{req.remarks}"</Text>
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

      <ConfirmModal
        visible={!!approveTarget}
        title="Approve Fuel Request?"
        message={approveTarget ? `Confirms ${approveTarget.quantity} ${approveTarget.unit} for ${approveTarget.vehicle_number} was issued.` : ''}
        confirmText={acting ? 'Approving...' : 'Approve'}
        onConfirm={confirmApprove}
        onCancel={() => setApproveTarget(null)}
      />

      <Modal visible={!!rejectTarget} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-black/50 justify-center px-6">
          <View className="bg-white rounded-[32px] p-6 shadow-2xl">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-black text-slate-900">Reject Request</Text>
              <TouchableOpacity onPress={() => setRejectTarget(null)} className="bg-slate-100 p-2 rounded-full">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text className="text-slate-600 mb-4 font-medium">Why is this fuel request being rejected? This will be visible to Store and recorded on the request.</Text>
            <TextInput
              className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-900 text-base mb-6"
              placeholder="e.g. Already fueled recently, wrong vehicle..."
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
