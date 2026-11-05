import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Fuel, CheckCircle2, XCircle, Check, X } from 'lucide-react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { isStoreForeman } from '../../lib/foremanFlags';

const TABLES = {
  equipment: { table: 'equipment_entries', label: 'Equipment' },
  flushing: { table: 'flushing_entries', label: 'Flushing' },
} as const;

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

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editedQuantity, setEditedQuantity] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);

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

      const [eq, fl] = await Promise.all([
        supabase
          .from('equipment_entries')
          .select('id, entry_date, vehicle_number, foreman_name, fuel_quantity, fuel_unit, equipment_master:equipment_master_id (equipment_name), jobs:job_id (job_name)')
          .eq('fuel_approval_status', 'PENDING')
          .order('entry_date', { ascending: false }),
        supabase
          .from('flushing_entries')
          .select('id, entry_date, vehicle_number, foreman_name, fuel_quantity, fuel_unit, equipment_master:equipment_master_id (equipment_name), jobs:job_id (job_name)')
          .eq('fuel_approval_status', 'PENDING')
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
      });

      const all = [...(eq.data || []).map(toRow('equipment')), ...(fl.data || []).map(toRow('flushing'))];
      all.sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));
      setRequests(all);
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
      setRequests(prev => prev.filter(r => r.id !== req.id));
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
      setRequests(prev => prev.filter(r => r.id !== req.id));
      setExpandedId(null);
    } catch (err: any) {
      console.error('Error rejecting fuel request', err);
    } finally {
      setActingId(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar barStyle="dark-content" />

      <View className="flex-row items-center px-6 py-4 border-b border-slate-200 bg-white">
        <TouchableOpacity onPress={() => router.replace('/(app)/home')} className="p-2 -ml-2 rounded-full active:opacity-60">
          <ArrowLeft size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-slate-900 text-2xl font-black tracking-tight ml-3">Fuel Approvals</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {loading ? (
          <View className="py-20 items-center">
            <ActivityIndicator size="large" color="#1e3a8a" />
          </View>
        ) : requests.length === 0 ? (
          <View className="py-20 items-center bg-white rounded-3xl border border-slate-100">
            <View className="bg-green-50 p-4 rounded-full mb-4">
              <CheckCircle2 size={32} color="#16a34a" />
            </View>
            <Text className="text-slate-900 text-lg font-black">All caught up</Text>
            <Text className="text-slate-500 mt-1 text-center">No fuel requests waiting on confirmation.</Text>
          </View>
        ) : (
          <>
            <Text className="text-slate-500 font-medium mb-4">
              Check each request against your fuel-issue register, correct the liters if needed, then Approve -- or Reject with a reason if no fuel was actually given.
            </Text>
            {requests.map(req => {
              const isExpanded = expandedId === req.id;
              const isActing = actingId === req.id;
              return (
                <View key={`${req.type}-${req.id}`} className="bg-white rounded-2xl border border-slate-200 mb-3 shadow-sm overflow-hidden">
                  <TouchableOpacity onPress={() => openRequest(req)} className="p-4 active:bg-slate-50">
                    <View className="flex-row justify-between items-start mb-1">
                      <View className={`px-2.5 py-1 rounded-full ${req.type === 'equipment' ? 'bg-blue-100' : 'bg-cyan-100'}`}>
                        <Text className={`text-[10px] font-bold uppercase ${req.type === 'equipment' ? 'text-blue-700' : 'text-cyan-700'}`}>
                          {TABLES[req.type].label}
                        </Text>
                      </View>
                      <View className="flex-row items-center bg-amber-50 px-2.5 py-1 rounded-full">
                        <Fuel size={12} color="#d97706" />
                        <Text className="text-amber-800 font-bold text-xs ml-1">{req.fuel_quantity} {req.fuel_unit}</Text>
                      </View>
                    </View>
                    <Text className="text-slate-900 font-bold text-base mt-2">{req.equipment_name} · {req.vehicle_number}</Text>
                    <Text className="text-slate-500 text-sm mt-0.5">{req.job_name}</Text>
                    <Text className="text-slate-400 text-xs mt-1">{req.foreman_name} · {req.entry_date}</Text>
                  </TouchableOpacity>

                  {isExpanded && (
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
                              onPress={() => setRejecting(true)}
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
                          <TextInput
                            value={rejectionReason}
                            onChangeText={setRejectionReason}
                            placeholder="e.g. No diesel issued that day"
                            placeholderTextColor="#94a3b8"
                            multiline
                            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium mb-3 min-h-[70px]"
                            style={{ outlineStyle: 'none', textAlignVertical: 'top' } as any}
                          />
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
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
