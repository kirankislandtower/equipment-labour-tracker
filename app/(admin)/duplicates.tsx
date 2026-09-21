import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, useWindowDimensions } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Copy, Search, X } from 'lucide-react-native';

const TYPE_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  equipment: { label: 'Equipment', bg: 'bg-blue-100', text: 'text-blue-700' },
  labour: { label: 'Labour', bg: 'bg-green-100', text: 'text-green-700' },
  material: { label: 'Material', bg: 'bg-amber-100', text: 'text-amber-700' },
};

export default function DuplicateAlerts() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('duplicate_attempts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(300);
        if (error) throw error;
        setAttempts(data || []);
      } catch (err) {
        console.error('Error loading duplicate attempts:', err);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const countsByForeman = attempts.reduce((acc: Record<string, number>, a) => {
    const name = a.foreman_name || 'Unknown Foreman';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});
  const foremanChips = Object.entries(countsByForeman).sort((a, b) => b[1] - a[1]);

  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? attempts.filter(a => (a.foreman_name || 'Unknown Foreman').toLowerCase().includes(q) || (a.detail || '').toLowerCase().includes(q))
    : attempts;

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: isMobile ? 16 : 32, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View className="mb-6">
          <Text className="text-3xl font-black text-slate-900 tracking-tight mb-1">Duplicate Alerts</Text>
          <Text className="text-slate-500 font-medium">Foremen who tried to submit an entry that was already logged. These were blocked, not saved.</Text>
        </View>

        {loading ? (
          <View className="py-20 items-center">
            <ActivityIndicator size="large" color="#1e3a8a" />
          </View>
        ) : loadError ? (
          <View className="py-10 px-6 items-center bg-amber-50 rounded-3xl border border-amber-200">
            <Text className="text-amber-900 text-lg font-black text-center">Couldn't load duplicate alerts</Text>
            <Text className="text-amber-700 mt-1 text-center">Run add_duplicate_attempts.sql in Supabase first, then refresh.</Text>
          </View>
        ) : attempts.length === 0 ? (
          <View className="py-20 items-center bg-white rounded-3xl border border-slate-100">
            <View className="bg-slate-50 p-4 rounded-full mb-4">
              <Copy size={32} color="#94a3b8" />
            </View>
            <Text className="text-slate-900 text-lg font-black">No duplicate attempts yet</Text>
            <Text className="text-slate-500 mt-1 text-center">They'll show up here when a foreman tries to submit something already logged.</Text>
          </View>
        ) : (
          <>
            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">By foreman (tap to filter)</Text>
            <View className="flex-row flex-wrap mb-5" style={{ gap: 8 }}>
              {foremanChips.map(([name, count]) => (
                <TouchableOpacity
                  key={name}
                  onPress={() => setSearchQuery(searchQuery === name ? '' : name)}
                  className={`px-3.5 py-2 rounded-full border ${searchQuery === name ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'}`}
                >
                  <Text className={`text-xs font-bold ${searchQuery === name ? 'text-white' : 'text-slate-700'}`}>{name} · {count}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View className="flex-row items-center bg-white border border-slate-200 rounded-xl px-4 h-12 mb-6">
              <Search size={18} color="#94a3b8" />
              <TextInput
                placeholder="Search by foreman, vehicle, or employee"
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

            {filtered.length === 0 ? (
              <Text className="text-slate-500 text-center py-10">Nothing matches "{searchQuery}".</Text>
            ) : (
              filtered.map(a => {
                const style = TYPE_STYLES[a.entry_type] || TYPE_STYLES.equipment;
                return (
                  <View key={a.id} className="bg-white p-5 rounded-2xl border border-slate-200 mb-3">
                    <View className="flex-row justify-between items-start mb-2">
                      <Text className="text-slate-900 font-black text-lg flex-1 pr-2">{a.foreman_name || 'Unknown Foreman'}</Text>
                      <View className={`px-3 py-1 rounded-full ${style.bg}`}>
                        <Text className={`text-[10px] font-bold uppercase ${style.text}`}>{style.label}</Text>
                      </View>
                    </View>
                    <Text className="text-slate-700 font-bold">{a.detail}</Text>
                    <Text className="text-slate-500 text-sm mt-1">Entry date {a.entry_date}</Text>
                    <Text className="text-slate-400 text-xs mt-2">Tried on {new Date(a.created_at).toLocaleString()}</Text>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
