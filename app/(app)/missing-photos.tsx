import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Camera, CheckCircle2 } from 'lucide-react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { getLocalDateString } from '../../lib/dateUtils';

const TYPES = {
  equipment: { label: 'Equipment', route: '/(app)/entry/equipment', bg: 'bg-blue-100', text: 'text-blue-700' },
  labour: { label: 'Labour', route: '/(app)/entry/labour', bg: 'bg-green-100', text: 'text-green-700' },
  material: { label: 'Material', route: '/(app)/entry/material', bg: 'bg-amber-100', text: 'text-amber-700' },
} as const;

// Only entries still open to editing (Submitted or Rejected) -- the same rule the
// History screen uses for showing an Edit button -- since attaching the photo
// happens by editing the entry.
const EDITABLE_STATUSES = ['SUBMITTED', 'REJECTED'];

export default function MissingPhotosScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [entries, setEntries] = useState<any[]>([]);

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        setLoading(true);
        setLoadError(false);
        try {
          const [eq, lab, mat] = await Promise.all([
            supabase.from('equipment_entries').select('id, entry_date, status, vehicle_number').eq('created_by', user?.id).eq('equipment_photo_url', 'pending').in('status', EDITABLE_STATUSES),
            supabase.from('labour_entries').select('id, entry_date, status, employee_name').eq('created_by', user?.id).eq('labour_photo_url', 'pending').in('status', EDITABLE_STATUSES),
            supabase.from('material_transfers').select('id, entry_date, status, material_description').eq('created_by', user?.id).eq('photo_url', 'pending').in('status', EDITABLE_STATUSES),
          ]);
          const failed = [eq, lab, mat].find(r => r.error);
          if (failed) throw failed.error;

          const all = [
            ...(eq.data || []).map((e: any) => ({ ...e, type: 'equipment', label: `Vehicle ${e.vehicle_number}` })),
            ...(lab.data || []).map((e: any) => ({ ...e, type: 'labour', label: e.employee_name })),
            ...(mat.data || []).map((e: any) => ({ ...e, type: 'material', label: e.material_description })),
          ];
          all.sort((a, b) => (a.entry_date < b.entry_date ? -1 : 1));
          setEntries(all);
        } catch (err) {
          console.error('Error loading entries missing photos:', err);
          setLoadError(true);
        } finally {
          setLoading(false);
        }
      };
      load();
    }, [user?.id])
  );

  const todayStr = getLocalDateString();
  const daysAgoLabel = (dateStr: string) => {
    const n = Math.max(0, Math.round((new Date(todayStr).getTime() - new Date(dateStr).getTime()) / 86400000));
    return n === 0 ? 'today' : n === 1 ? '1 day ago' : `${n} days ago`;
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar barStyle="dark-content" />

      <View className="flex-row items-center px-6 py-4 border-b border-slate-200 bg-white">
        <TouchableOpacity onPress={() => router.replace('/(app)/home')} className="p-2 -ml-2 rounded-full active:opacity-60">
          <ArrowLeft size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-slate-900 text-2xl font-black tracking-tight ml-3">Missing Photos</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {loading ? (
          <View className="py-20 items-center">
            <ActivityIndicator size="large" color="#1e3a8a" />
          </View>
        ) : loadError ? (
          <View className="py-10 px-6 items-center bg-amber-50 rounded-3xl border border-amber-200">
            <Text className="text-amber-900 text-lg font-black text-center">Couldn't load your entries</Text>
            <Text className="text-amber-700 mt-1 text-center">Check your connection and open this page again.</Text>
          </View>
        ) : entries.length === 0 ? (
          <View className="py-20 items-center bg-white rounded-3xl border border-slate-100">
            <View className="bg-green-50 p-4 rounded-full mb-4">
              <CheckCircle2 size={32} color="#16a34a" />
            </View>
            <Text className="text-slate-900 text-lg font-black">All your entries have photos</Text>
            <Text className="text-slate-500 mt-1 text-center">Nothing to add right now.</Text>
          </View>
        ) : (
          <>
            <Text className="text-slate-500 font-medium mb-4">
              These entries were submitted without a photo. Tap Add Photo, take the live photo, and save.
            </Text>
            {entries.map(e => {
              const t = TYPES[e.type as keyof typeof TYPES];
              return (
                <View key={`${e.type}-${e.id}`} className="bg-white p-4 rounded-2xl border border-slate-200 mb-3 shadow-sm">
                  <View className="flex-row justify-between items-start mb-1">
                    <View className={`px-2.5 py-1 rounded-full ${t.bg}`}>
                      <Text className={`text-[10px] font-bold uppercase ${t.text}`}>{t.label}</Text>
                    </View>
                    {e.status === 'REJECTED' && (
                      <View className="bg-red-100 px-2.5 py-1 rounded-full">
                        <Text className="text-[10px] font-bold uppercase text-red-700">Rejected</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-slate-900 font-bold text-base mt-2">{e.label}</Text>
                  <Text className="text-slate-500 text-sm mt-0.5">{e.entry_date} · {daysAgoLabel(e.entry_date)}</Text>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: t.route as any, params: { id: e.id } })}
                    className="mt-3 flex-row items-center justify-center bg-slate-900 py-3 rounded-xl active:bg-slate-800"
                  >
                    <Camera size={16} color="#ffffff" />
                    <Text className="text-white font-bold ml-2">Add Photo</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
