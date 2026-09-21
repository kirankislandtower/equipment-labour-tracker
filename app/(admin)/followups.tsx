import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, useWindowDimensions } from 'react-native';
import { supabase } from '../../lib/supabase';
import { getLocalDateString } from '../../lib/dateUtils';
import { openWhatsApp } from '../../lib/whatsapp';
import { Camera, UserX, Search, X, MessageCircle, RefreshCw } from 'lucide-react-native';

type Tab = 'photos' | 'today';

const SUPPORT_LINE = 'Need help? Call or WhatsApp +971 52 660 5909 or +971 54 771 4315.';

const TYPE_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  equipment: { label: 'Equipment', bg: 'bg-blue-100', text: 'text-blue-700' },
  labour: { label: 'Labour', bg: 'bg-green-100', text: 'text-green-700' },
  material: { label: 'Material', bg: 'bg-amber-100', text: 'text-amber-700' },
};

const firstName = (fullName: string) => (fullName || '').split(' ')[0] || 'Sir';

export default function FollowUps() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [tab, setTab] = useState<Tab>('photos');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [today, setToday] = useState(getLocalDateString());

  const [foremen, setForemen] = useState<any[]>([]);
  const [pendingEntries, setPendingEntries] = useState<any[]>([]);
  const [submittedTodayIds, setSubmittedTodayIds] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    setLoading(true);
    setLoadError(false);
    const todayStr = getLocalDateString();
    setToday(todayStr);
    try {
      const results = await Promise.all([
        supabase.from('users').select('*').eq('role', 'FOREMAN').is('deleted_at', null).order('full_name'),
        supabase.from('equipment_entries').select('id, entry_date, created_by, foreman_name, vehicle_number').eq('equipment_photo_url', 'pending').neq('status', 'REJECTED'),
        supabase.from('labour_entries').select('id, entry_date, created_by, foreman_name, employee_name').eq('labour_photo_url', 'pending').neq('status', 'REJECTED'),
        supabase.from('material_transfers').select('id, entry_date, created_by, foreman_name, material_description').eq('photo_url', 'pending').neq('status', 'REJECTED'),
        supabase.from('equipment_entries').select('created_by').eq('entry_date', todayStr),
        supabase.from('labour_entries').select('created_by').eq('entry_date', todayStr),
        supabase.from('material_transfers').select('created_by').eq('entry_date', todayStr),
      ]);
      const failed = results.find(r => r.error);
      if (failed) throw failed.error;

      const [usersRes, equipRes, labourRes, materialRes, tEquip, tLabour, tMaterial] = results;
      setForemen(usersRes.data || []);

      setPendingEntries([
        ...(equipRes.data || []).map((e: any) => ({ ...e, type: 'equipment', label: `Vehicle ${e.vehicle_number}` })),
        ...(labourRes.data || []).map((e: any) => ({ ...e, type: 'labour', label: e.employee_name })),
        ...(materialRes.data || []).map((e: any) => ({ ...e, type: 'material', label: e.material_description })),
      ]);

      const submitted = new Set<string>();
      [tEquip.data, tLabour.data, tMaterial.data].forEach(rows => (rows || []).forEach((r: any) => r.created_by && submitted.add(r.created_by)));
      setSubmittedTodayIds(submitted);
    } catch (err) {
      console.error('Error loading follow-ups:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const q = searchQuery.trim().toLowerCase();
  const matches = (name: string) => !q || name.toLowerCase().includes(q);

  // ---- Photo Pending: group entries by the account that submitted them ----
  const foremanById = new Map<string, any>(foremen.map(f => [f.id, f]));
  const photoGroups = Object.values(
    pendingEntries.reduce((acc: Record<string, any>, entry) => {
      const key = entry.created_by || entry.foreman_name || 'unknown';
      if (!acc[key]) {
        const user = entry.created_by ? foremanById.get(entry.created_by) : null;
        acc[key] = { key, name: user?.full_name || entry.foreman_name || 'Unknown Foreman', phone: user?.phone_number || null, entries: [] };
      }
      acc[key].entries.push(entry);
      return acc;
    }, {})
  )
    .filter((g: any) => matches(g.name))
    .sort((a: any, b: any) => b.entries.length - a.entries.length) as any[];

  // ---- Not submitted today: active foremen with nothing dated today ----
  const notSubmitted = foremen.filter(f => !submittedTodayIds.has(f.id));
  const missingToday = notSubmitted.filter(f => !f.away_reason && matches(f.full_name || ''));
  const awayToday = notSubmitted.filter(f => !!f.away_reason && matches(f.full_name || ''));

  const daysAgo = (dateStr: string) => Math.max(0, Math.round((new Date(today).getTime() - new Date(dateStr).getTime()) / 86400000));
  const daysAgoLabel = (dateStr: string) => {
    const n = daysAgo(dateStr);
    return n === 0 ? 'today' : n === 1 ? '1 day ago' : `${n} days ago`;
  };

  const remindPhoto = (group: any) => {
    if (!group.phone) return;
    const count = group.entries.length;
    openWhatsApp(
      group.phone,
      `Hi ${firstName(group.name)}, ${count} of your entries in the Island Tower app ${count === 1 ? "doesn't" : "don't"} have a photo yet. Please open the app, edit ${count === 1 ? 'that entry' : 'each entry'}, and upload the live photo. ${SUPPORT_LINE}`
    );
  };

  const remindToday = (f: any) => {
    if (!f.phone_number) return;
    openWhatsApp(
      f.phone_number,
      `Hi ${firstName(f.full_name)}, you haven't submitted any Equipment, Labour, or Material entries in the Island Tower app today. Please submit today's entries so your work gets recorded. ${SUPPORT_LINE}`
    );
  };

  const TabButton = ({ id, label, count, activeClass }: { id: Tab; label: string; count: number; activeClass: string }) => (
    <TouchableOpacity
      onPress={() => setTab(id)}
      className={`px-4 py-2 rounded-full border flex-row items-center ${tab === id ? activeClass : 'bg-white border-slate-200'}`}
    >
      <Text className={`font-bold text-sm ${tab === id ? 'text-white' : 'text-slate-600'}`}>{label}</Text>
      <View className={`ml-2 px-2 py-0.5 rounded-full ${tab === id ? 'bg-white/20' : 'bg-slate-100'}`}>
        <Text className={`text-xs font-bold ${tab === id ? 'text-white' : 'text-slate-500'}`}>{count}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: isMobile ? 16 : 32, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View className="mb-6 flex-row justify-between items-start">
          <View className="flex-1 pr-3">
            <Text className="text-3xl font-black text-slate-900 tracking-tight mb-1">Follow-ups</Text>
            <Text className="text-slate-500 font-medium">Foremen who need a nudge. Reminders open WhatsApp with the message ready.</Text>
          </View>
          <TouchableOpacity onPress={fetchData} disabled={loading} className="bg-white border border-slate-200 p-3 rounded-xl active:bg-slate-50">
            <RefreshCw size={18} color="#64748b" />
          </TouchableOpacity>
        </View>

        <View className="flex-row flex-wrap mb-5" style={{ gap: 8 }}>
          <TabButton id="photos" label="Photo Pending" count={pendingEntries.length} activeClass="bg-amber-600 border-amber-600" />
          <TabButton id="today" label="Not Submitted Today" count={notSubmitted.filter(f => !f.away_reason).length} activeClass="bg-rose-600 border-rose-600" />
        </View>

        <View className="flex-row items-center bg-white border border-slate-200 rounded-xl px-4 h-12 mb-6">
          <Search size={18} color="#94a3b8" />
          <TextInput
            placeholder="Search by foreman name"
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
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
        ) : loadError ? (
          <View className="py-10 px-6 items-center bg-amber-50 rounded-3xl border border-amber-200">
            <Text className="text-amber-900 text-lg font-black text-center">Couldn't load follow-ups</Text>
            <Text className="text-amber-700 mt-1 text-center">Check your connection and tap refresh.</Text>
          </View>
        ) : tab === 'photos' ? (
          photoGroups.length === 0 ? (
            <View className="py-20 items-center bg-white rounded-3xl border border-slate-100">
              <View className="bg-slate-50 p-4 rounded-full mb-4">
                <Camera size={32} color="#94a3b8" />
              </View>
              <Text className="text-slate-900 text-lg font-black">{q ? 'No match' : 'No photos pending'}</Text>
              <Text className="text-slate-500 mt-1 text-center">{q ? `No foreman matching "${searchQuery}".` : 'Every submitted entry has its photo.'}</Text>
            </View>
          ) : (
            photoGroups.map((group: any) => (
              <View key={group.key} className="bg-white p-5 rounded-2xl border border-slate-200 mb-4">
                <View className="flex-row justify-between items-center mb-3">
                  <View className="flex-1 pr-2">
                    <Text className="text-slate-900 font-black text-lg">{group.name}</Text>
                    <Text className="text-slate-500 text-xs font-bold uppercase tracking-wider">
                      {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'} without a photo
                    </Text>
                  </View>
                  {group.phone ? (
                    <TouchableOpacity onPress={() => remindPhoto(group)} className="flex-row items-center px-3.5 py-2.5 rounded-lg border border-green-200 bg-green-50 active:bg-green-100">
                      <MessageCircle size={16} color="#16a34a" />
                      <Text className="text-green-700 font-bold ml-1.5 text-sm">Remind</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text className="text-slate-400 text-xs font-medium">No number saved</Text>
                  )}
                </View>
                {group.entries
                  .slice()
                  .sort((a: any, b: any) => (a.entry_date < b.entry_date ? -1 : 1))
                  .map((e: any) => {
                    const style = TYPE_STYLES[e.type];
                    return (
                      <View key={`${e.type}-${e.id}`} className="flex-row items-center justify-between py-2.5 border-t border-slate-100">
                        <View className="flex-row items-center flex-1 pr-2">
                          <View className={`px-2.5 py-1 rounded-full mr-3 ${style.bg}`}>
                            <Text className={`text-[10px] font-bold uppercase ${style.text}`}>{style.label}</Text>
                          </View>
                          <Text className="text-slate-700 font-medium flex-1" numberOfLines={1}>{e.label}</Text>
                        </View>
                        <Text className={`text-xs font-bold ${daysAgo(e.entry_date) >= 2 ? 'text-red-600' : 'text-slate-400'}`}>
                          {e.entry_date} · {daysAgoLabel(e.entry_date)}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            ))
          )
        ) : (
          <>
            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Nothing submitted for {today}</Text>
            {missingToday.length === 0 ? (
              <View className="py-16 items-center bg-white rounded-3xl border border-slate-100">
                <View className="bg-slate-50 p-4 rounded-full mb-4">
                  <UserX size={32} color="#94a3b8" />
                </View>
                <Text className="text-slate-900 text-lg font-black">{q ? 'No match' : 'Everyone has submitted today'}</Text>
              </View>
            ) : (
              missingToday.map(f => (
                <View key={f.id} className="bg-white p-4 rounded-2xl border border-slate-200 mb-3 flex-row items-center justify-between">
                  <View className="flex-1 pr-2">
                    <Text className="text-slate-900 font-bold text-base">{f.full_name}</Text>
                    <Text className="text-slate-400 text-xs mt-0.5">{f.phone_number || 'No number saved'}</Text>
                  </View>
                  {f.phone_number && (
                    <TouchableOpacity onPress={() => remindToday(f)} className="flex-row items-center px-3.5 py-2.5 rounded-lg border border-green-200 bg-green-50 active:bg-green-100">
                      <MessageCircle size={16} color="#16a34a" />
                      <Text className="text-green-700 font-bold ml-1.5 text-sm">Remind</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}

            {awayToday.length > 0 && (
              <>
                <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-6 mb-3">Marked away (no reminder needed)</Text>
                {awayToday.map(f => (
                  <View key={f.id} className="bg-slate-100 p-4 rounded-2xl border border-slate-200 mb-3">
                    <View className="flex-row items-center">
                      <View className="w-2.5 h-2.5 rounded-full bg-red-500 mr-2" />
                      <Text className="text-slate-800 font-bold">{f.full_name}</Text>
                    </View>
                    <Text className="text-slate-500 text-sm mt-1">{f.away_reason}</Text>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
