import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { Wrench, Plus, Clock, CheckCircle2, XCircle, ChevronRight } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { getLocalDateString } from '../../lib/dateUtils';

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: any }> = {
  SUBMITTED: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: Clock },
  APPROVED: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', icon: CheckCircle2 },
  REJECTED: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: XCircle },
};

export default function DriverHomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState('');
  const [todayCount, setTodayCount] = useState(0);
  const [monthCount, setMonthCount] = useState(0);
  const [recentEntries, setRecentEntries] = useState<any[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      fetchDashboard();
    }, [user?.id])
  );

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const today = getLocalDateString();
      const firstOfMonth = `${today.slice(0, 7)}-01`;

      const [profileRes, todayRes, monthRes, recentRes] = await Promise.all([
        supabase.from('users').select('full_name').eq('id', user!.id).maybeSingle(),
        supabase.from('internal_vehicle_entries').select('id', { count: 'exact', head: true }).eq('created_by', user!.id).eq('entry_date', today),
        supabase.from('internal_vehicle_entries').select('id', { count: 'exact', head: true }).eq('created_by', user!.id).gte('entry_date', firstOfMonth),
        supabase.from('internal_vehicle_entries').select('id, entry_date, status, jobs(job_number, job_name)').eq('created_by', user!.id).order('entry_date', { ascending: false }).limit(5),
      ]);

      setFullName(profileRes.data?.full_name || '');
      setTodayCount(todayRes.count || 0);
      setMonthCount(monthRes.count || 0);
      setRecentEntries(recentRes.data || []);
    } catch (error) {
      console.error('Error loading driver dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const firstName = (fullName || '').split(' ')[0] || 'Driver';

  if (loading) {
    return (
      <View className="flex-1 bg-slate-50 justify-center items-center">
        <ActivityIndicator size="large" color="#6d28d9" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-slate-50">
      <View className="bg-[#6d28d9] px-6 pt-16 pb-10 rounded-b-[32px] shadow-sm">
        <Text className="text-violet-200 font-medium">Welcome back,</Text>
        <Text className="text-white text-2xl font-black mt-1">{firstName}</Text>
      </View>

      <View className="px-6 -mt-6">
        <View className="flex-row" style={{ gap: 12 }}>
          <View className="flex-1 bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <Text className="text-slate-400 text-xs font-bold uppercase mb-1">Today</Text>
            <Text className="text-slate-900 text-2xl font-black">{todayCount}</Text>
            <Text className="text-slate-500 text-xs">{todayCount === 1 ? 'Entry' : 'Entries'}</Text>
          </View>
          <View className="flex-1 bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <Text className="text-slate-400 text-xs font-bold uppercase mb-1">This Month</Text>
            <Text className="text-slate-900 text-2xl font-black">{monthCount}</Text>
            <Text className="text-slate-500 text-xs">{monthCount === 1 ? 'Entry' : 'Entries'}</Text>
          </View>
        </View>
      </View>

      <View className="px-6 mt-6">
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/(app)/entry/internal-vehicles', params: { id: undefined } })}
          className="bg-[#6d28d9] rounded-2xl p-5 flex-row items-center justify-between active:opacity-90 shadow-sm"
        >
          <View className="flex-row items-center">
            <View className="bg-white/20 p-3 rounded-xl mr-4">
              <Wrench size={22} color="#fff" />
            </View>
            <View>
              <Text className="text-white font-black text-base">New Vehicle Entry</Text>
              <Text className="text-violet-200 text-xs mt-0.5">Log today's trip</Text>
            </View>
          </View>
          <Plus size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View className="px-6 mt-8 mb-24">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-slate-900 font-black text-lg">Recent Entries</Text>
          <TouchableOpacity onPress={() => router.push('/(app)/history')} className="flex-row items-center">
            <Text className="text-[#6d28d9] font-bold text-sm mr-0.5">View all</Text>
            <ChevronRight size={16} color="#6d28d9" />
          </TouchableOpacity>
        </View>

        {recentEntries.length === 0 ? (
          <View className="bg-white rounded-2xl p-8 items-center border border-slate-100">
            <Text className="text-slate-500 font-medium text-center">No entries yet. Log your first trip above.</Text>
          </View>
        ) : (
          recentEntries.map((entry) => {
            const style = STATUS_STYLES[entry.status] || STATUS_STYLES.SUBMITTED;
            const StatusIcon = style.icon;
            return (
              <TouchableOpacity
                key={entry.id}
                onPress={() => router.push({ pathname: '/(app)/entry/internal-vehicles', params: { id: entry.id } })}
                className="bg-white rounded-2xl p-4 mb-3 border border-slate-100 flex-row items-center justify-between active:opacity-80"
              >
                <View className="flex-1 pr-3">
                  <Text className="text-slate-900 font-bold">{entry.entry_date}</Text>
                  <Text className="text-slate-500 text-sm mt-0.5" numberOfLines={1}>
                    {entry.jobs?.job_number ? `${entry.jobs.job_number} - ${entry.jobs.job_name}` : 'Unknown Site'}
                  </Text>
                </View>
                <View className={`flex-row items-center px-2.5 py-1 rounded-full border ${style.bg}`}>
                  <StatusIcon size={12} color={style.text.includes('amber') ? '#b45309' : style.text.includes('green') ? '#15803d' : '#b91c1c'} />
                  <Text className={`text-[10px] font-bold uppercase ml-1 ${style.text}`}>{entry.status}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
