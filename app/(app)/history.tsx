import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Truck, Users, Calendar, Clock, Edit2, ChevronLeft, ChevronRight, ArrowRightLeft } from 'lucide-react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { getLocalDateString } from '../../lib/dateUtils';
import { getQueuedEntries, QueuedEntryType } from '../../lib/offlineQueue';

export default function HistoryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { date, type, status } = useLocalSearchParams<{ date?: string, type?: string, status?: string }>();
  
  const [activeTab, setActiveTab] = useState(type || 'EQUIPMENT');
  const [statusFilter, setStatusFilter] = useState(status || 'ALL');
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  
  // Initialize date from URL param if available, otherwise today
  const initialDate = date ? new Date(date) : new Date();
  const [selectedDate, setSelectedDate] = useState(initialDate);

  useEffect(() => {
    fetchHistory();
  }, [activeTab, selectedDate]);

  const fetchHistory = async () => {
    setLoading(true);
    const dateStr = getLocalDateString(selectedDate);

    try {
      let serverEntries: any[] = [];

      if (activeTab === 'EQUIPMENT') {
        const { data, error } = await supabase
          .from('equipment_entries')
          .select(`
            id,
            entry_date,
            working_hours,
            status,
            rejection_reason,
            remarks,
            equipment_master:equipment_master_id (equipment_name),
            jobs:job_id (job_name)
          `)
          .eq('entry_date', dateStr)
          .eq('created_by', user?.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        serverEntries = data || [];
      } else if (activeTab === 'LABOUR') {
        const { data, error } = await supabase
          .from('labour_entries')
          .select(`
            id,
            entry_date,
            employee_name,
            total_working_hours,
            status,
            rejection_reason,
            remarks,
            jobs:job_id (job_name),
            labour_designations:designation_id (designation_name)
          `)
          .eq('entry_date', dateStr)
          .eq('created_by', user?.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        serverEntries = data || [];
      } else if (activeTab === 'MATERIAL') {
        const { data, error } = await supabase
          .from('material_transfers')
          .select(`
            id,
            entry_date,
            material_description,
            quantity,
            unit,
            status,
            rejection_reason,
            remarks,
            from_job:from_job_id (job_name),
            to_job:to_job_id (job_name)
          `)
          .eq('entry_date', dateStr)
          .eq('created_by', user?.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        serverEntries = data || [];
      }

      // Entries saved locally while offline haven't reached Supabase yet, so they
      // can't come back from the queries above -- merge them in from the on-device
      // queue instead, using their pre-resolved `display` fields (built at submit
      // time) so they render with the same shape as a real row, fully offline.
      const queueTypeByTab: Record<string, QueuedEntryType> = { EQUIPMENT: 'equipment', LABOUR: 'labour', MATERIAL: 'material' };
      const queued = await getQueuedEntries();
      const queuedForTab = queued
        .filter(q => q.type === queueTypeByTab[activeTab] && q.displayDate === dateStr)
        .map(q => ({
          id: q.id,
          entry_date: q.displayDate,
          status: 'QUEUED',
          rejection_reason: null,
          remarks: null,
          ...q.display,
        }));

      setEntries([...queuedForTab, ...serverEntries]);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoading(false);
    }
  };

  const goToPrevDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(prev);
  };

  const goToNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    const today = new Date();
    if (next <= today) setSelectedDate(next);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const isToday = getLocalDateString(selectedDate) === getLocalDateString(new Date());

  const formatDate = (d: Date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'APPROVED': return 'text-green-500';
      case 'REJECTED': return 'text-red-500';
      case 'QUEUED': return 'text-orange-500';
      default: return 'text-amber-500';
    }
  };

  const getStatusBg = (status) => {
    switch(status) {
      case 'APPROVED': return 'bg-green-50 border-green-200';
      case 'REJECTED': return 'bg-red-50 border-red-200';
      case 'QUEUED': return 'bg-orange-50 border-orange-200';
      default: return 'bg-yellow-50 border-yellow-200';
    }
  };

  const getStatusLabel = (status) => status === 'QUEUED' ? 'Pending Upload' : (status || 'SUBMITTED');

  const counts = {
    ALL: entries.length,
    SUBMITTED: entries.filter(e => e.status === 'SUBMITTED').length,
    APPROVED: entries.filter(e => e.status === 'APPROVED').length,
    REJECTED: entries.filter(e => e.status === 'REJECTED').length
  };

  const filteredEntries = entries.filter(e => statusFilter === 'ALL' || e.status === statusFilter);

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View className="flex-row items-center px-6 py-4 border-b border-slate-200 bg-white">
        <TouchableOpacity 
          onPress={() => router.replace('/(app)/home')}
          className="p-2 -ml-2 rounded-full active:opacity-60"
        >
          <ArrowLeft size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-slate-900 text-2xl font-black tracking-tight ml-3">Entry History</Text>
      </View>

      {/* Date Navigator */}
      <View className="px-4 pt-4 pb-2">
        <View className="flex-row items-center justify-between bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
          <TouchableOpacity onPress={goToPrevDay} className="p-2 bg-slate-100 rounded-xl active:bg-slate-200">
            <ChevronLeft size={20} color="#334155" />
          </TouchableOpacity>
          <TouchableOpacity onPress={goToToday} className="items-center px-4">
            <Text className="text-slate-900 font-black text-base tracking-tight">{formatDate(selectedDate)}</Text>
            {!isToday && (
              <Text className="text-blue-600 font-bold text-xs mt-1">Tap to go to Today</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={goToNextDay} 
            className={`p-2 rounded-xl ${isToday ? 'bg-slate-50' : 'bg-slate-100 active:bg-slate-200'}`}
            disabled={isToday}
          >
            <ChevronRight size={20} color={isToday ? '#cbd5e1' : '#334155'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Custom Segmented Control */}
      <View className="px-4 mb-4">
        <View className="flex-row bg-slate-100 p-1 rounded-xl">
          <TouchableOpacity 
            onPress={() => setActiveTab('EQUIPMENT')}
            className={`flex-1 flex-row items-center justify-center py-3 rounded-lg ${activeTab === 'EQUIPMENT' ? 'bg-white shadow-sm' : ''}`}
          >
            <Truck size={16} color={activeTab === 'EQUIPMENT' ? '#1e3a8a' : '#64748b'} />
            <Text className={`ml-2 font-bold ${activeTab === 'EQUIPMENT' ? 'text-blue-900' : 'text-slate-500'}`}>
              Equipment
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setActiveTab('LABOUR')}
            className={`flex-1 flex-row items-center justify-center py-3 rounded-lg ${activeTab === 'LABOUR' ? 'bg-white shadow-sm' : ''}`}
          >
            <Users size={16} color={activeTab === 'LABOUR' ? '#1e3a8a' : '#64748b'} />
            <Text className={`ml-2 font-bold ${activeTab === 'LABOUR' ? 'text-blue-900' : 'text-slate-500'}`}>
              Labour
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setActiveTab('MATERIAL')}
            className={`flex-1 flex-row items-center justify-center py-3 rounded-lg ${activeTab === 'MATERIAL' ? 'bg-white shadow-sm' : ''}`}
          >
            <ArrowRightLeft size={16} color={activeTab === 'MATERIAL' ? '#1e3a8a' : '#64748b'} />
            <Text className={`ml-2 font-bold ${activeTab === 'MATERIAL' ? 'text-blue-900' : 'text-slate-500'}`}>
              Material
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Status Filters */}
      <View className="px-4 mb-2">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
          <TouchableOpacity 
            onPress={() => setStatusFilter('ALL')}
            className={`px-4 py-2 rounded-full border mr-2 flex-row items-center ${statusFilter === 'ALL' ? 'bg-slate-800 border-slate-800' : 'bg-white border-slate-200'}`}
          >
            <Text className={`font-bold ${statusFilter === 'ALL' ? 'text-white' : 'text-slate-600'}`}>All</Text>
            <View className={`ml-2 px-1.5 py-0.5 rounded-full ${statusFilter === 'ALL' ? 'bg-white/20' : 'bg-slate-100'}`}>
              <Text className={`text-[10px] font-black ${statusFilter === 'ALL' ? 'text-white' : 'text-slate-500'}`}>{counts.ALL}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => setStatusFilter('SUBMITTED')}
            className={`px-4 py-2 rounded-full border mr-2 flex-row items-center ${statusFilter === 'SUBMITTED' ? 'bg-amber-100 border-amber-200' : 'bg-white border-slate-200'}`}
          >
            <Text className={`font-bold ${statusFilter === 'SUBMITTED' ? 'text-amber-700' : 'text-slate-600'}`}>Pending</Text>
            <View className={`ml-2 px-1.5 py-0.5 rounded-full ${statusFilter === 'SUBMITTED' ? 'bg-amber-200/50' : 'bg-slate-100'}`}>
              <Text className={`text-[10px] font-black ${statusFilter === 'SUBMITTED' ? 'text-amber-800' : 'text-slate-500'}`}>{counts.SUBMITTED}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => setStatusFilter('APPROVED')}
            className={`px-4 py-2 rounded-full border mr-2 flex-row items-center ${statusFilter === 'APPROVED' ? 'bg-green-100 border-green-200' : 'bg-white border-slate-200'}`}
          >
            <Text className={`font-bold ${statusFilter === 'APPROVED' ? 'text-green-700' : 'text-slate-600'}`}>Approved</Text>
            <View className={`ml-2 px-1.5 py-0.5 rounded-full ${statusFilter === 'APPROVED' ? 'bg-green-200/50' : 'bg-slate-100'}`}>
              <Text className={`text-[10px] font-black ${statusFilter === 'APPROVED' ? 'text-green-800' : 'text-slate-500'}`}>{counts.APPROVED}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => setStatusFilter('REJECTED')}
            className={`px-4 py-2 rounded-full border flex-row items-center ${statusFilter === 'REJECTED' ? 'bg-red-100 border-red-200' : 'bg-white border-slate-200'}`}
          >
            <Text className={`font-bold ${statusFilter === 'REJECTED' ? 'text-red-700' : 'text-slate-600'}`}>Rejected</Text>
            <View className={`ml-2 px-1.5 py-0.5 rounded-full ${statusFilter === 'REJECTED' ? 'bg-red-200/50' : 'bg-slate-100'}`}>
              <Text className={`text-[10px] font-black ${statusFilter === 'REJECTED' ? 'text-red-800' : 'text-slate-500'}`}>{counts.REJECTED}</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* List */}
      <ScrollView className="flex-1 px-4 mt-2" contentContainerStyle={{ paddingBottom: 120 }}>
        {loading ? (
          <View className="py-20 items-center">
            <ActivityIndicator size="large" color="#1e3a8a" />
            <Text className="text-slate-500 mt-4 font-medium">Loading history...</Text>
          </View>
        ) : filteredEntries.length === 0 ? (
          <View className="py-20 items-center">
            <View className="bg-slate-100 p-4 rounded-full mb-4">
              <Calendar size={32} color="#94a3b8" />
            </View>
            <Text className="text-slate-900 font-bold text-lg">No {statusFilter !== 'ALL' ? statusFilter.toLowerCase() : ''} entries.</Text>
            <Text className="text-slate-500 mt-1">Try changing your filters.</Text>
          </View>
        ) : (
          <View className="mb-6">
            {/* Summary Count Header */}
            <View className="flex-row items-center mb-4">
              <View className="bg-slate-800 px-3 py-1.5 rounded-lg">
                <Text className="text-white font-black text-xs tracking-wide">
                  {filteredEntries.length} {activeTab === 'EQUIPMENT' ? 'Equipment' : activeTab === 'LABOUR' ? 'Labour' : 'Material'} {filteredEntries.length === 1 ? 'Entry' : 'Entries'}
                </Text>
              </View>
              <View className="flex-1 h-px bg-slate-200 ml-3" />
            </View>

            {filteredEntries.map((entry) => (
              <TouchableOpacity 
                key={entry.id} 
                className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-3 active:bg-slate-50"
                onPress={() => {
                  // In a future update, we can show a detailed modal here if needed
                  // For now, it just gives touch feedback
                }}
              >
                <View className="flex-row justify-between items-start mb-2">
                  <Text className="font-black tracking-tight text-slate-900 flex-1 text-lg" numberOfLines={1}>
                    {activeTab === 'EQUIPMENT' 
                      ? entry.equipment_master?.equipment_name || 'Unknown Equipment' 
                      : activeTab === 'LABOUR'
                        ? entry.employee_name || 'Unknown Employee'
                        : entry.material_description || 'Unknown Material'}
                  </Text>
                  <Text className={`font-bold tracking-wide text-[10px] px-2 py-1 border rounded uppercase ${getStatusColor(entry.status)} ${getStatusBg(entry.status)}`}>
                    {getStatusLabel(entry.status)}
                  </Text>
                </View>

                <Text className="text-slate-500 font-medium mb-3 leading-relaxed">
                  {activeTab === 'EQUIPMENT' 
                    ? entry.jobs?.job_name 
                    : activeTab === 'LABOUR'
                      ? `${entry.labour_designations?.designation_name} @ ${entry.jobs?.job_name}`
                      : `${entry.from_job?.job_name} -> ${entry.to_job?.job_name}`}
                </Text>

                {entry.status === 'REJECTED' && !!entry.rejection_reason && (
                  <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                    <Text className="text-red-800 font-bold text-xs uppercase mb-1">Reason for Rejection</Text>
                    <Text className="text-red-600 text-sm">{entry.rejection_reason}</Text>
                  </View>
                )}

                {!!entry.remarks && (
                  <View className="bg-slate-50 border border-slate-100 rounded-lg p-3 mb-3">
                    <Text className="text-slate-400 font-bold text-[10px] uppercase tracking-wider mb-1">Remarks</Text>
                    <Text className="text-slate-700 text-sm leading-tight italic">"{entry.remarks}"</Text>
                  </View>
                )}

                <View className="flex-row justify-between border-t border-slate-100 pt-3">
                  <View className="flex-row items-center">
                    {activeTab === 'MATERIAL' ? (
                      <>
                        <ArrowRightLeft size={14} color="#94a3b8" />
                        <Text className="text-slate-500 text-xs font-medium ml-1.5">
                          <Text className="text-slate-900 font-bold">{entry.quantity}</Text> {entry.unit}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Clock size={14} color="#94a3b8" />
                        <Text className="text-slate-500 text-xs font-medium ml-1.5">
                          <Text className="text-slate-900 font-bold">{activeTab === 'EQUIPMENT' ? entry.working_hours : entry.total_working_hours}</Text> Hours
                        </Text>
                      </>
                    )}
                  </View>
                </View>

                {(entry.status === 'REJECTED' || entry.status === 'SUBMITTED') && (
                  <TouchableOpacity 
                    onPress={() => {
                      const route = activeTab === 'EQUIPMENT' 
                        ? '/(app)/entry/equipment' 
                        : activeTab === 'LABOUR'
                          ? '/(app)/entry/labour'
                          : '/(app)/entry/material';
                      router.push({ pathname: route as any, params: { id: entry.id } });
                    }}
                    className="mt-3 flex-row items-center justify-center bg-slate-900 py-3 rounded-xl active:bg-slate-800"
                  >
                    <Edit2 size={16} color="#ffffff" />
                    <Text className="text-white font-bold ml-2">
                      {entry.status === 'REJECTED' ? 'Edit & Resubmit' : 'Edit Entry'}
                    </Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
