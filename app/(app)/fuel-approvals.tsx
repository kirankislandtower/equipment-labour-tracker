import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Fuel, CheckCircle2, XCircle, Check, X } from 'lucide-react-native';
import { useAuth } from '../../lib/auth';
import { FadeInUp, AnimatedPressable } from '../../components/Animations';
import { supabase } from '../../lib/supabase';
import { isStoreForeman } from '../../lib/foremanFlags';

const TABLES = {
  equipment: { table: 'equipment_entries', label: 'Equipment' },
  flushing: { table: 'flushing_entries', label: 'Flushing' },
} as const;

// Quick-pick rejection reasons for the ones that come up over and over --
// "Other" reveals a free-text box instead for anything that doesn't fit.
const REJECTION_REASONS = [
  'Supplier responsible for fuel per PO -- not our scope',
  'No fuel was actually given',
  'Wrong equipment/vehicle selected',
  'Duplicate entry',
  'Other',
] as const;

const TOPUP_REJECTION_REASONS = [
  'Already fueled recently -- not needed',
  'Wrong vehicle/job selected',
  'Duplicate request',
  'Other',
] as const;

type PendingRequest = {
  id: string;
  type: keyof typeof TABLES;
  entry_date: string;
  vehicle_number: string;
  foreman_name: string;
  fuel_quantity: number;
  fuel_unit: string;
  equipment_name: string;
  job_name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
};

type TopupRequest = {
  id: string;
  entry_date: string;
  vehicle_number: string;
  foreman_name: string;
  quantity: number;
  unit: string;
  job_name: string;
  remarks: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
};

type StatusFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

const StatusPill = ({ status }: { status: string }) => {
  if (status === 'APPROVED') return <View className="bg-green-100 px-2.5 py-1 rounded-full"><Text className="text-green-700 font-bold text-[10px] uppercase">Approved</Text></View>;
  if (status === 'REJECTED') return <View className="bg-red-100 px-2.5 py-1 rounded-full"><Text className="text-red-700 font-bold text-[10px] uppercase">Rejected</Text></View>;
  return <View className="bg-amber-100 px-2.5 py-1 rounded-full"><Text className="text-amber-700 font-bold text-[10px] uppercase">Pending</Text></View>;
};

// Store-only screen -- the other half of the Fuel Approval workflow. A Foreman's
// fuel entry saves instantly as "PENDING" (never blocks them on-site); this is
// where Store reviews it against their own issue register and locks in the real
// figure, so admin reports end up with a number Store actually confirmed.
export default function FuelApprovalsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [storeName, setStoreName] = useState('Store');
  const [activeTab, setActiveTab] = useState<'entries' | 'topups'>('entries');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editedQuantity, setEditedQuantity] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedPresetReason, setSelectedPresetReason] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  // Top-Up Requests tab -- separate state from the Entries tab above since
  // they're two unrelated lists that just happen to share this screen.
  const [topupRequests, setTopupRequests] = useState<TopupRequest[]>([]);
  const [expandedTopupId, setExpandedTopupId] = useState<string | null>(null);
  const [editedTopupQuantity, setEditedTopupQuantity] = useState('');
  const [rejectingTopup, setRejectingTopup] = useState(false);
  const [topupRejectionReason, setTopupRejectionReason] = useState('');
  const [selectedTopupPresetReason, setSelectedTopupPresetReason] = useState<string | null>(null);
  const [actingTopupId, setActingTopupId] = useState<string | null>(null);

  const isStore = isStoreForeman(user?.email);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (user?.id) {
        const { data: userData } = await supabase.from('users').select('full_name, email').eq('id', user.id).maybeSingle();
        if (userData) {
          setStoreName(userData.full_name && userData.full_name !== 'New User' ? userData.full_name : 'Store');
        }
      }

      const [eq, fl, tu] = await Promise.all([
        supabase
          .from('equipment_entries')
          .select('id, entry_date, vehicle_number, foreman_name, fuel_quantity, fuel_unit, fuel_approval_status, fuel_approved_by, fuel_approved_at, fuel_rejection_reason, equipment_master:equipment_master_id (equipment_name), jobs:job_id (job_name)')
          .not('fuel_approval_status', 'is', null)
          .order('entry_date', { ascending: false }),
        supabase
          .from('flushing_entries')
          .select('id, entry_date, vehicle_number, foreman_name, fuel_quantity, fuel_unit, fuel_approval_status, fuel_approved_by, fuel_approved_at, fuel_rejection_reason, equipment_master:equipment_master_id (equipment_name), jobs:job_id (job_name)')
          .not('fuel_approval_status', 'is', null)
          .order('entry_date', { ascending: false }),
        supabase
          .from('fuel_topup_requests')
          .select('id, entry_date, vehicle_number, foreman_name, quantity, unit, remarks, status, approved_by, approved_at, rejection_reason, jobs:job_id (job_name)')
          .order('entry_date', { ascending: false }),
      ]);

      const toRow = (type: keyof typeof TABLES) => (e: any): PendingRequest => ({
        id: e.id,
        type,
        entry_date: e.entry_date,
        vehicle_number: e.vehicle_number || 'Unknown Vehicle',
        foreman_name: e.foreman_name || 'Unknown Foreman',
        fuel_quantity: e.fuel_quantity,
        fuel_unit: e.fuel_unit || '',
        equipment_name: e.equipment_master?.equipment_name || 'Unknown Equipment',
        job_name: e.jobs?.job_name || 'Unknown Job',
        status: e.fuel_approval_status || 'PENDING',
        approved_by: e.fuel_approved_by || null,
        approved_at: e.fuel_approved_at || null,
        rejection_reason: e.fuel_rejection_reason || null,
      });

      const all = [...(eq.data || []).map(toRow('equipment')), ...(fl.data || []).map(toRow('flushing'))];
      all.sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));
      setRequests(all);

      const topups = (tu.data || []).map((e: any): TopupRequest => ({
        id: e.id,
        entry_date: e.entry_date,
        vehicle_number: e.vehicle_number || 'Unknown Vehicle',
        foreman_name: e.foreman_name || 'Unknown Foreman',
        quantity: e.quantity,
        unit: e.unit || '',
        job_name: e.jobs?.job_name || 'Unknown Job',
        remarks: e.remarks || null,
        status: e.status || 'PENDING',
        approved_by: e.approved_by || null,
        approved_at: e.approved_at || null,
        rejection_reason: e.rejection_reason || null,
      }));
      topups.sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));
      setTopupRequests(topups);
    } catch (err) {
      console.error('Error loading fuel approvals', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Not the Store account -- nothing to do here.
  if (user && !isStore) {
    router.replace('/(app)/home');
    return null;
  }

  const openRequest = (req: PendingRequest) => {
    const isSame = expandedId === req.id;
    setExpandedId(isSame ? null : req.id);
    setEditedQuantity(isSame ? '' : (req.fuel_quantity != null ? req.fuel_quantity.toString() : ''));
    setRejecting(false);
    setRejectionReason('');
    setSelectedPresetReason(null);
  };

  const handleApprove = async (req: PendingRequest) => {
    const quantity = parseFloat(editedQuantity);
    if (!editedQuantity || isNaN(quantity) || quantity <= 0) {
      return;
    }
    setActingId(req.id);
    try {
      const { table } = TABLES[req.type];
      const { error } = await supabase
        .from(table)
        .update({
          fuel_quantity: quantity,
          fuel_approval_status: 'APPROVED',
          fuel_approved_by: storeName,
          fuel_approved_at: new Date().toISOString(),
          fuel_rejection_reason: null,
        })
        .eq('id', req.id);
      if (error) throw error;
      const approvedAt = new Date().toISOString();
      setRequests(prev => prev.map(r => r.id === req.id
        ? { ...r, fuel_quantity: quantity, status: 'APPROVED', approved_by: storeName, approved_at: approvedAt, rejection_reason: null }
        : r));
      setExpandedId(null);
    } catch (err: any) {
      console.error('Error approving fuel request', err);
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (req: PendingRequest) => {
    if (!rejectionReason.trim()) return;
    setActingId(req.id);
    try {
      const { table } = TABLES[req.type];
      const { error } = await supabase
        .from(table)
        .update({
          fuel_approval_status: 'REJECTED',
          fuel_approved_by: storeName,
          fuel_approved_at: new Date().toISOString(),
          fuel_rejection_reason: rejectionReason.trim(),
        })
        .eq('id', req.id);
      if (error) throw error;
      const approvedAt = new Date().toISOString();
      const reason = rejectionReason.trim();
      setRequests(prev => prev.map(r => r.id === req.id
        ? { ...r, status: 'REJECTED', approved_by: storeName, approved_at: approvedAt, rejection_reason: reason }
        : r));
      setExpandedId(null);
    } catch (err: any) {
      console.error('Error rejecting fuel request', err);
    } finally {
      setActingId(null);
    }
  };

  const openTopupRequest = (req: TopupRequest) => {
    const isSame = expandedTopupId === req.id;
    setExpandedTopupId(isSame ? null : req.id);
    setEditedTopupQuantity(isSame ? '' : (req.quantity != null ? req.quantity.toString() : ''));
    setRejectingTopup(false);
    setTopupRejectionReason('');
    setSelectedTopupPresetReason(null);
  };

  const handleApproveTopup = async (req: TopupRequest) => {
    const quantity = parseFloat(editedTopupQuantity);
    if (!editedTopupQuantity || isNaN(quantity) || quantity <= 0) return;
    setActingTopupId(req.id);
    try {
      const { error } = await supabase
        .from('fuel_topup_requests')
        .update({
          quantity,
          status: 'APPROVED',
          approved_by: storeName,
          approved_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq('id', req.id);
      if (error) throw error;
      const approvedAt = new Date().toISOString();
      setTopupRequests(prev => prev.map(r => r.id === req.id
        ? { ...r, quantity, status: 'APPROVED', approved_by: storeName, approved_at: approvedAt, rejection_reason: null }
        : r));
      setExpandedTopupId(null);
    } catch (err: any) {
      console.error('Error approving fuel top-up request', err);
    } finally {
      setActingTopupId(null);
    }
  };

  const handleRejectTopup = async (req: TopupRequest) => {
    if (!topupRejectionReason.trim()) return;
    setActingTopupId(req.id);
    try {
      const { error } = await supabase
        .from('fuel_topup_requests')
        .update({
          status: 'REJECTED',
          approved_by: storeName,
          approved_at: new Date().toISOString(),
          rejection_reason: topupRejectionReason.trim(),
        })
        .eq('id', req.id);
      if (error) throw error;
      const approvedAt = new Date().toISOString();
      const reason = topupRejectionReason.trim();
      setTopupRequests(prev => prev.map(r => r.id === req.id
        ? { ...r, status: 'REJECTED', approved_by: storeName, approved_at: approvedAt, rejection_reason: reason }
        : r));
      setExpandedTopupId(null);
    } catch (err: any) {
      console.error('Error rejecting fuel top-up request', err);
    } finally {
      setActingTopupId(null);
    }
  };

  // Counts and the filtered list are derived from whichever tab is active, so
  // the Pending/Approved/Rejected/All row means the same thing on both tabs.
  const activeList = activeTab === 'entries' ? requests : topupRequests;
  const filterCounts = {
    PENDING: activeList.filter(r => r.status === 'PENDING').length,
    APPROVED: activeList.filter(r => r.status === 'APPROVED').length,
    REJECTED: activeList.filter(r => r.status === 'REJECTED').length,
    ALL: activeList.length,
  };
  const matchesFilter = (status: string) => statusFilter === 'ALL' || status === statusFilter;
  const visibleRequests = requests.filter(r => matchesFilter(r.status));
  const visibleTopups = topupRequests.filter(r => matchesFilter(r.status));
  const pendingEntriesCount = requests.filter(r => r.status === 'PENDING').length;
  const pendingTopupsCount = topupRequests.filter(r => r.status === 'PENDING').length;

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar barStyle="dark-content" />

      <View className="flex-row items-center px-6 py-4 border-b border-slate-200 bg-white">
        <TouchableOpacity onPress={() => router.replace('/(app)/home')} className="p-2 -ml-2 rounded-full active:opacity-60">
          <ArrowLeft size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-slate-900 text-2xl font-black tracking-tight ml-3">Fuel Approvals</Text>
      </View>

      <View className="flex-row bg-slate-100 p-1 mx-4 mt-4 rounded-xl">
        <TouchableOpacity
          onPress={() => setActiveTab('entries')}
          className={`flex-1 py-2.5 rounded-lg items-center ${activeTab === 'entries' ? 'bg-white shadow-sm' : ''}`}
        >
          <Text className={`font-bold text-sm ${activeTab === 'entries' ? 'text-slate-900' : 'text-slate-500'}`}>
            Fuel Confirmations {pendingEntriesCount > 0 ? `(${pendingEntriesCount})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('topups')}
          className={`flex-1 py-2.5 rounded-lg items-center ${activeTab === 'topups' ? 'bg-white shadow-sm' : ''}`}
        >
          <Text className={`font-bold text-sm ${activeTab === 'topups' ? 'text-slate-900' : 'text-slate-500'}`}>
            Top-Up Requests {pendingTopupsCount > 0 ? `(${pendingTopupsCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      <View className="flex-row flex-wrap gap-2 mx-4 mt-3">
        {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as StatusFilter[]).map(f => (
          <TouchableOpacity
            key={f}
            onPress={() => setStatusFilter(f)}
            className={`px-3.5 py-2 rounded-full border flex-row items-center ${statusFilter === f ? 'bg-[#1e3a8a] border-[#1e3a8a]' : 'bg-white border-slate-200'}`}
          >
            <Text className={`font-bold text-xs ${statusFilter === f ? 'text-white' : 'text-slate-600'}`}>
              {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </Text>
            <View className={`ml-1.5 px-1.5 py-0.5 rounded-full ${statusFilter === f ? 'bg-white/20' : 'bg-slate-100'}`}>
              <Text className={`text-[10px] font-bold ${statusFilter === f ? 'text-white' : 'text-slate-500'}`}>{filterCounts[f]}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {loading ? (
          <View className="py-20 items-center">
            <ActivityIndicator size="large" color="#1e3a8a" />
          </View>
        ) : activeTab === 'entries' ? (
        visibleRequests.length === 0 ? (
          <View className="py-20 items-center bg-white rounded-3xl border border-slate-100">
            <View className="bg-green-50 p-4 rounded-full mb-4">
              <CheckCircle2 size={32} color="#16a34a" />
            </View>
            <Text className="text-slate-900 text-lg font-black">All caught up</Text>
            <Text className="text-slate-500 mt-1 text-center">
              {statusFilter === 'PENDING' ? 'No fuel requests waiting on confirmation.' : 'Nothing in this filter yet.'}
            </Text>
          </View>
        ) : (
          <>
            <Text className="text-slate-500 font-medium mb-4">
              Check each request against your fuel-issue register, correct the liters if needed, then Approve -- or Reject with a reason if no fuel was actually given.
            </Text>
            {visibleRequests.map(req => {
              const isExpanded = expandedId === req.id;
              const isActing = actingId === req.id;
              const isPending = req.status === 'PENDING';
              return (
                <View key={`${req.type}-${req.id}`} className="bg-white rounded-2xl border border-slate-200 mb-3 shadow-sm overflow-hidden">
                  <AnimatedPressable onPress={() => isPending && openRequest(req)} disabled={!isPending}>
                    <View className="p-4">
                      <View className="flex-row justify-between items-start mb-1">
                        <View className="flex-row items-center" style={{ gap: 6 }}>
                          <View className={`px-2.5 py-1 rounded-full ${req.type === 'equipment' ? 'bg-blue-100' : 'bg-cyan-100'}`}>
                            <Text className={`text-[10px] font-bold uppercase ${req.type === 'equipment' ? 'text-blue-700' : 'text-cyan-700'}`}>
                              {TABLES[req.type].label}
                            </Text>
                          </View>
                          <StatusPill status={req.status} />
                        </View>
                        <View className="flex-row items-center bg-amber-50 px-2.5 py-1 rounded-full">
                          <Fuel size={12} color="#d97706" />
                          <Text className="text-amber-800 font-bold text-xs ml-1">{req.fuel_quantity} {req.fuel_unit}</Text>
                        </View>
                      </View>
                      <Text className="text-slate-900 font-bold text-base mt-2">{req.equipment_name} · {req.vehicle_number}</Text>
                      <Text className="text-slate-500 text-sm mt-0.5">{req.job_name}</Text>
                      <Text className="text-slate-400 text-xs mt-1">{req.foreman_name} · {req.entry_date}</Text>
                      {!isPending && (
                        <Text className="text-slate-400 text-xs mt-1.5">
                          {req.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {req.approved_by || 'Store'}
                          {req.approved_at ? ` on ${new Date(req.approved_at).toLocaleDateString()}` : ''}
                          {req.rejection_reason ? ` — "${req.rejection_reason}"` : ''}
                        </Text>
                      )}
                    </View>
                  </AnimatedPressable>

                  {isExpanded && (
                    <FadeInUp>
                    <View className="px-4 pb-4 pt-1 border-t border-slate-100">
                      {!rejecting ? (
                        <>
                          <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 mt-3">Confirmed Liters</Text>
                          <TextInput
                            value={editedQuantity}
                            onChangeText={setEditedQuantity}
                            keyboardType="decimal-pad"
                            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-bold text-base mb-3"
                            style={{ outlineStyle: 'none' } as any}
                          />
                          <View className="flex-row gap-2">
                            <TouchableOpacity
                              onPress={() => { setRejecting(true); setSelectedPresetReason(null); setRejectionReason(''); }}
                              disabled={isActing}
                              className="flex-1 flex-row items-center justify-center bg-red-50 border border-red-200 py-3 rounded-xl active:bg-red-100"
                            >
                              <XCircle size={16} color="#b91c1c" />
                              <Text className="text-red-700 font-bold ml-2">Reject</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleApprove(req)}
                              disabled={isActing}
                              className={`flex-1 flex-row items-center justify-center py-3 rounded-xl ${isActing ? 'bg-green-300' : 'bg-green-600 active:bg-green-700'}`}
                            >
                              {isActing ? <ActivityIndicator color="#fff" size="small" /> : (
                                <>
                                  <Check size={16} color="#ffffff" />
                                  <Text className="text-white font-bold ml-2">Approve</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          </View>
                        </>
                      ) : (
                        <>
                          <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 mt-3">Reason for Rejection</Text>
                          <View className="mb-3">
                            {REJECTION_REASONS.map(reason => {
                              const isSelected = selectedPresetReason === reason;
                              return (
                                <TouchableOpacity
                                  key={reason}
                                  onPress={() => {
                                    setSelectedPresetReason(reason);
                                    setRejectionReason(reason === 'Other' ? '' : reason);
                                  }}
                                  className={`flex-row items-center p-3 mb-1.5 rounded-xl border ${isSelected ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}
                                >
                                  <View className={`w-4 h-4 rounded-full border-2 items-center justify-center mr-2.5 ${isSelected ? 'border-red-500' : 'border-slate-300'}`}>
                                    {isSelected && <View className="w-2 h-2 rounded-full bg-red-500" />}
                                  </View>
                                  <Text className={`flex-1 text-sm ${isSelected ? 'text-red-800 font-bold' : 'text-slate-600 font-medium'}`}>{reason}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                          {selectedPresetReason === 'Other' && (
                            <TextInput
                              value={rejectionReason}
                              onChangeText={setRejectionReason}
                              placeholder="Type the reason"
                              placeholderTextColor="#94a3b8"
                              multiline
                              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium mb-3 min-h-[70px]"
                              style={{ outlineStyle: 'none', textAlignVertical: 'top' } as any}
                            />
                          )}
                          <View className="flex-row gap-2">
                            <TouchableOpacity
                              onPress={() => setRejecting(false)}
                              disabled={isActing}
                              className="flex-1 flex-row items-center justify-center bg-slate-100 py-3 rounded-xl active:bg-slate-200"
                            >
                              <X size={16} color="#475569" />
                              <Text className="text-slate-700 font-bold ml-2">Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleReject(req)}
                              disabled={isActing || !rejectionReason.trim()}
                              className={`flex-1 flex-row items-center justify-center py-3 rounded-xl ${!rejectionReason.trim() || isActing ? 'bg-red-300' : 'bg-red-600 active:bg-red-700'}`}
                            >
                              {isActing ? <ActivityIndicator color="#fff" size="small" /> : (
                                <>
                                  <XCircle size={16} color="#ffffff" />
                                  <Text className="text-white font-bold ml-2">Confirm Reject</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          </View>
                        </>
                      )}
                    </View>
                    </FadeInUp>
                  )}
                </View>
              );
            })}
          </>
        )
        ) : (
        topupRequests.length === 0 || visibleTopups.length === 0 ? (
          <View className="py-20 items-center bg-white rounded-3xl border border-slate-100">
            <View className="bg-green-50 p-4 rounded-full mb-4">
              <CheckCircle2 size={32} color="#16a34a" />
            </View>
            <Text className="text-slate-900 text-lg font-black">All caught up</Text>
            <Text className="text-slate-500 mt-1 text-center">
              {statusFilter === 'PENDING' ? 'No fuel top-up requests waiting on you.' : 'Nothing in this filter yet.'}
            </Text>
          </View>
        ) : (
          <>
            <Text className="text-slate-500 font-medium mb-4">
              A Foreman is asking for fuel to be sent out. Confirm the liters you're actually issuing, then Approve -- or Reject with a reason if it's not needed.
            </Text>
            {visibleTopups.map(req => {
              const isExpanded = expandedTopupId === req.id;
              const isActing = actingTopupId === req.id;
              const isPending = req.status === 'PENDING';
              return (
                <View key={req.id} className="bg-white rounded-2xl border border-slate-200 mb-3 shadow-sm overflow-hidden">
                  <AnimatedPressable onPress={() => isPending && openTopupRequest(req)} disabled={!isPending}>
                    <View className="p-4">
                      <View className="flex-row justify-between items-start mb-1">
                        <View className="flex-row items-center" style={{ gap: 6 }}>
                          <View className="px-2.5 py-1 rounded-full bg-indigo-100">
                            <Text className="text-[10px] font-bold uppercase text-indigo-700">Top-Up Request</Text>
                          </View>
                          <StatusPill status={req.status} />
                        </View>
                        <View className="flex-row items-center bg-amber-50 px-2.5 py-1 rounded-full">
                          <Fuel size={12} color="#d97706" />
                          <Text className="text-amber-800 font-bold text-xs ml-1">{req.quantity} {req.unit}</Text>
                        </View>
                      </View>
                      <Text className="text-slate-900 font-bold text-base mt-2">{req.vehicle_number}</Text>
                      <Text className="text-slate-500 text-sm mt-0.5">{req.job_name}</Text>
                      <Text className="text-slate-400 text-xs mt-1">{req.foreman_name} · {req.entry_date}</Text>
                      {!!req.remarks && (
                        <Text className="text-slate-500 text-xs mt-1.5 italic">"{req.remarks}"</Text>
                      )}
                      {!isPending && (
                        <Text className="text-slate-400 text-xs mt-1.5">
                          {req.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {req.approved_by || 'Store'}
                          {req.approved_at ? ` on ${new Date(req.approved_at).toLocaleDateString()}` : ''}
                          {req.rejection_reason ? ` — "${req.rejection_reason}"` : ''}
                        </Text>
                      )}
                    </View>
                  </AnimatedPressable>

                  {isExpanded && (
                    <FadeInUp>
                    <View className="px-4 pb-4 pt-1 border-t border-slate-100">
                      {!rejectingTopup ? (
                        <>
                          <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 mt-3">Confirmed Quantity</Text>
                          <TextInput
                            value={editedTopupQuantity}
                            onChangeText={setEditedTopupQuantity}
                            keyboardType="decimal-pad"
                            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-bold text-base mb-3"
                            style={{ outlineStyle: 'none' } as any}
                          />
                          <View className="flex-row gap-2">
                            <TouchableOpacity
                              onPress={() => { setRejectingTopup(true); setSelectedTopupPresetReason(null); setTopupRejectionReason(''); }}
                              disabled={isActing}
                              className="flex-1 flex-row items-center justify-center bg-red-50 border border-red-200 py-3 rounded-xl active:bg-red-100"
                            >
                              <XCircle size={16} color="#b91c1c" />
                              <Text className="text-red-700 font-bold ml-2">Reject</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleApproveTopup(req)}
                              disabled={isActing}
                              className={`flex-1 flex-row items-center justify-center py-3 rounded-xl ${isActing ? 'bg-green-300' : 'bg-green-600 active:bg-green-700'}`}
                            >
                              {isActing ? <ActivityIndicator color="#fff" size="small" /> : (
                                <>
                                  <Check size={16} color="#ffffff" />
                                  <Text className="text-white font-bold ml-2">Approve</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          </View>
                        </>
                      ) : (
                        <>
                          <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 mt-3">Reason for Rejection</Text>
                          <View className="mb-3">
                            {TOPUP_REJECTION_REASONS.map(reason => {
                              const isSelected = selectedTopupPresetReason === reason;
                              return (
                                <TouchableOpacity
                                  key={reason}
                                  onPress={() => {
                                    setSelectedTopupPresetReason(reason);
                                    setTopupRejectionReason(reason === 'Other' ? '' : reason);
                                  }}
                                  className={`flex-row items-center p-3 mb-1.5 rounded-xl border ${isSelected ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}
                                >
                                  <View className={`w-4 h-4 rounded-full border-2 items-center justify-center mr-2.5 ${isSelected ? 'border-red-500' : 'border-slate-300'}`}>
                                    {isSelected && <View className="w-2 h-2 rounded-full bg-red-500" />}
                                  </View>
                                  <Text className={`flex-1 text-sm ${isSelected ? 'text-red-800 font-bold' : 'text-slate-600 font-medium'}`}>{reason}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                          {selectedTopupPresetReason === 'Other' && (
                            <TextInput
                              value={topupRejectionReason}
                              onChangeText={setTopupRejectionReason}
                              placeholder="Type the reason"
                              placeholderTextColor="#94a3b8"
                              multiline
                              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium mb-3 min-h-[70px]"
                              style={{ outlineStyle: 'none', textAlignVertical: 'top' } as any}
                            />
                          )}
                          <View className="flex-row gap-2">
                            <TouchableOpacity
                              onPress={() => setRejectingTopup(false)}
                              disabled={isActing}
                              className="flex-1 flex-row items-center justify-center bg-slate-100 py-3 rounded-xl active:bg-slate-200"
                            >
                              <X size={16} color="#475569" />
                              <Text className="text-slate-700 font-bold ml-2">Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleRejectTopup(req)}
                              disabled={isActing || !topupRejectionReason.trim()}
                              className={`flex-1 flex-row items-center justify-center py-3 rounded-xl ${!topupRejectionReason.trim() || isActing ? 'bg-red-300' : 'bg-red-600 active:bg-red-700'}`}
                            >
                              {isActing ? <ActivityIndicator color="#fff" size="small" /> : (
                                <>
                                  <XCircle size={16} color="#ffffff" />
                                  <Text className="text-white font-bold ml-2">Confirm Reject</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          </View>
                        </>
                      )}
                    </View>
                    </FadeInUp>
                  )}
                </View>
              );
            })}
          </>
        )
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
