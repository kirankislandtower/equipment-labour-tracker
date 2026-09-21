import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { Truck, Users, FileCheck2, Clock, Plus, ChevronLeft, ChevronRight, Camera } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { getLocalDateString } from '../../lib/dateUtils';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loadingStats, setLoadingStats] = useState(true);
  const [missingPhotoCount, setMissingPhotoCount] = useState(0);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [stats, setStats] = useState({
    equipment: 0,
    labour: 0,
    pending: 0,
    approved: 0,
    rejected: 0
  });

  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [selectedDate])
  );

  // Across all dates, not just the selected day -- an old entry missing its photo
  // still needs attention. Only Submitted/Rejected entries count since those are
  // the ones the foreman can still edit to attach it.
  useFocusEffect(
    useCallback(() => {
      const editable = ['SUBMITTED', 'REJECTED'];
      Promise.all([
        supabase.from('equipment_entries').select('id', { count: 'exact', head: true }).eq('created_by', user?.id).eq('equipment_photo_url', 'pending').in('status', editable),
        supabase.from('labour_entries').select('id', { count: 'exact', head: true }).eq('created_by', user?.id).eq('labour_photo_url', 'pending').in('status', editable),
        supabase.from('material_transfers').select('id', { count: 'exact', head: true }).eq('created_by', user?.id).eq('photo_url', 'pending').in('status', editable),
      ]).then(results => {
        setMissingPhotoCount(results.reduce((sum, r) => sum + (r.count || 0), 0));
      }).catch(err => console.error('Error counting entries missing photos:', err));
    }, [user?.id])
  );

  const fetchStats = async () => {
    try {
      setLoadingStats(true);
      const dateStr = getLocalDateString(selectedDate);
      
      const [eqRes, labRes] = await Promise.all([
        supabase.from('equipment_entries').select('status').eq('entry_date', dateStr).eq('created_by', user?.id),
        supabase.from('labour_entries').select('status').eq('entry_date', dateStr).eq('created_by', user?.id),
        new Promise(resolve => setTimeout(resolve, 300))
      ]);
      
      const eqData = eqRes.data || [];
      const labData = labRes.data || [];
      const allData = [...eqData, ...labData];
      
      setStats({
        equipment: eqData.length,
        labour: labData.length,
        pending: allData.filter(e => e.status === 'SUBMITTED').length,
        approved: allData.filter(e => e.status === 'APPROVED').length,
        rejected: allData.filter(e => e.status === 'REJECTED').length
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoadingStats(false);
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

  const username = user?.email?.split('@')[0] || 'Foreman';
  const capitalizedUsername = username.charAt(0).toUpperCase() + username.slice(1);

  if (loadingStats) {
    return (
      <View className="flex-1 bg-slate-50 justify-center items-center">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-slate-50">
      {/* Header section */}
      <View className="bg-white px-6 pt-16 pb-8 rounded-b-[32px] shadow-sm border-b border-slate-200">
        <View className="flex-row justify-between items-center">
          <View className="flex-1 pr-4">
            <Text className="text-slate-500 font-outfit-bold tracking-wider text-[10px] uppercase">Welcome back,</Text>
            <Text className="text-slate-900 text-3xl font-outfit-black tracking-tight mt-1" numberOfLines={1}>
              {capitalizedUsername}
            </Text>
            <Text className="text-slate-400 font-outfit-medium text-xs mt-1">Foreman Dashboard</Text>
          </View>
          <View className="flex-row items-center">
            <View className="w-12 h-12 bg-indigo-50 rounded-xl items-center justify-center border border-indigo-100 shadow-sm">
              <Text className="text-indigo-600 text-xl font-outfit-black">{capitalizedUsername.charAt(0)}</Text>
            </View>
          </View>
        </View>
      </View>

      <View className="px-6 pt-6 pb-32">
        {missingPhotoCount > 0 && (
          <TouchableOpacity
            onPress={() => router.push('/(app)/missing-photos')}
            className="flex-row items-center bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 active:opacity-80"
          >
            <View className="bg-amber-100 w-10 h-10 rounded-xl items-center justify-center mr-3">
              <Camera size={20} color="#d97706" />
            </View>
            <View className="flex-1">
              <Text className="text-amber-900 font-outfit-bold text-[15px]">
                {missingPhotoCount} {missingPhotoCount === 1 ? 'entry needs' : 'entries need'} a photo
              </Text>
              <Text className="text-amber-700 font-outfit-medium text-xs mt-0.5">Tap to see which ones and add them</Text>
            </View>
            <ChevronRight size={20} color="#d97706" />
          </TouchableOpacity>
        )}

        {/* Date Navigator */}
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-lg font-outfit-black text-slate-900 tracking-tight">
            {isToday ? "Today's Summary" : 'Summary'}
          </Text>
        </View>

        <View className="flex-row items-center justify-between bg-white rounded-2xl border border-slate-200 p-3 mb-6 shadow-sm">
          <TouchableOpacity onPress={goToPrevDay} className="p-2 bg-slate-50 rounded-xl border border-slate-100 active:scale-[0.95] transition-transform">
            <ChevronLeft size={20} color="#334155" />
          </TouchableOpacity>
          <TouchableOpacity onPress={goToToday} className="items-center px-4 active:opacity-70">
            <Text className="text-slate-900 font-outfit-bold text-base tracking-tight">{formatDate(selectedDate)}</Text>
            {!isToday && (
              <Text className="text-indigo-600 font-outfit-semibold text-[10px] uppercase mt-1 tracking-widest">Tap to go to Today</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={goToNextDay} 
            className={`p-2 rounded-xl border ${isToday ? 'bg-transparent border-transparent' : 'bg-slate-50 border-slate-100 active:scale-[0.95] transition-transform'}`}
            disabled={isToday}
          >
            <ChevronRight size={20} color={isToday ? '#cbd5e1' : '#334155'} />
          </TouchableOpacity>
        </View>

        {/* Stats Grid */}
        <View className="flex-row justify-between mb-3">
          <TouchableOpacity 
            onPress={() => router.push({ pathname: '/(app)/history', params: { date: getLocalDateString(selectedDate), type: 'EQUIPMENT' } })}
            className="w-[48%] bg-white p-5 rounded-2xl shadow-sm border border-slate-200 items-center active:scale-[0.98] transition-transform"
          >
            <View className="bg-indigo-50 w-10 h-10 rounded-xl items-center justify-center mb-3 border border-indigo-100">
              <Truck size={20} color="#4f46e5" />
            </View>
            <Text className="text-4xl font-mono-bold text-slate-900 tracking-tighter">{stats.equipment}</Text>
            <Text className="text-[10px] text-slate-500 font-outfit-bold uppercase tracking-widest mt-1">Equipment</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            onPress={() => router.push({ pathname: '/(app)/history', params: { date: getLocalDateString(selectedDate), type: 'LABOUR' } })}
            className="w-[48%] bg-white p-5 rounded-2xl shadow-sm border border-slate-200 items-center active:scale-[0.98] transition-transform"
          >
            <View className="bg-emerald-50 w-10 h-10 rounded-xl items-center justify-center mb-3 border border-emerald-100">
              <Users size={20} color="#10b981" />
            </View>
            <Text className="text-4xl font-mono-bold text-slate-900 tracking-tighter">{stats.labour}</Text>
            <Text className="text-[10px] text-slate-500 font-outfit-bold uppercase tracking-widest mt-1">Labour</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row justify-between mb-4">
          <TouchableOpacity 
            onPress={() => router.push({ pathname: '/(app)/history', params: { date: getLocalDateString(selectedDate), status: 'SUBMITTED' } })}
            className="w-[31%] bg-white py-4 px-2 rounded-2xl shadow-sm border border-slate-200 items-center active:scale-[0.98] transition-transform"
          >
            <View className="bg-amber-50 w-8 h-8 rounded-lg items-center justify-center mb-2 border border-amber-100">
              <Clock size={16} color="#d97706" />
            </View>
            <Text className="text-2xl font-mono-bold text-slate-900 tracking-tighter">{stats.pending}</Text>
            <Text className="text-[9px] text-slate-500 font-outfit-bold uppercase tracking-widest mt-1">Pending</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => router.push({ pathname: '/(app)/history', params: { date: getLocalDateString(selectedDate), status: 'APPROVED' } })}
            className="w-[31%] bg-white py-4 px-2 rounded-2xl shadow-sm border border-slate-200 items-center active:scale-[0.98] transition-transform"
          >
            <View className="bg-emerald-50 w-8 h-8 rounded-lg items-center justify-center mb-2 border border-emerald-100">
              <FileCheck2 size={16} color="#10b981" />
            </View>
            <Text className="text-2xl font-mono-bold text-slate-900 tracking-tighter">{stats.approved}</Text>
            <Text className="text-[9px] text-slate-500 font-outfit-bold uppercase tracking-widest mt-1">Approved</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => router.push({ pathname: '/(app)/history', params: { date: getLocalDateString(selectedDate), status: 'REJECTED' } })}
            className="w-[31%] bg-white py-4 px-2 rounded-2xl shadow-sm border border-slate-200 items-center active:scale-[0.98] transition-transform"
          >
            <View className="bg-red-50 w-8 h-8 rounded-lg items-center justify-center mb-2 border border-red-100">
              <FileCheck2 size={16} color="#ef4444" />
            </View>
            <Text className="text-2xl font-mono-bold text-slate-900 tracking-tighter">{stats.rejected}</Text>
            <Text className="text-[9px] text-slate-500 font-outfit-bold uppercase tracking-widest mt-1">Rejected</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <Text className="text-slate-500 font-outfit-bold text-[10px] uppercase tracking-widest mt-6 mb-4">Quick Actions</Text>
        
        <TouchableOpacity 
          className="bg-indigo-600 flex-row items-center justify-center py-4 rounded-2xl shadow-sm mb-3 active:scale-[0.98] transition-transform"
          onPress={() => router.push('/(app)/entry/select')}
        >
          <Plus size={20} color="white" />
          <Text className="text-white font-outfit-bold text-[15px] ml-2 tracking-wide">New Daily Entry</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          className="bg-white border border-slate-200 shadow-sm flex-row items-center justify-center py-4 rounded-2xl active:scale-[0.98] transition-transform"
          onPress={() => router.push({ pathname: '/(app)/history', params: { date: getLocalDateString(selectedDate) } })}
        >
          <Clock size={20} color="#64748b" />
          <Text className="text-slate-700 font-outfit-bold text-[15px] ml-2 tracking-wide">View History</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
