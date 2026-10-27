import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Animated, Easing } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { Plus, ChevronRight, Truck } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { getLocalDateString } from '../../lib/dateUtils';

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  SUBMITTED: { bg: 'bg-amber-50', text: 'text-amber-700' },
  APPROVED: { bg: 'bg-green-50', text: 'text-green-700' },
  REJECTED: { bg: 'bg-red-50', text: 'text-red-700' },
};

// Fades a block in and rises it 16px, once, on mount -- the entrance motion
// for every section of the screen, staggered by `delay` so they arrive one
// after another instead of all at once.
function Reveal({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(translateY, { toValue: 0, duration: 380, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    ]).start();
  }, []);

  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

// The primary action gets its own press feedback -- a small scale-down,
// on top of the usual opacity change, since this is the one button every
// visit to this screen leads to.
function PressableScale({ onPress, children, className }: { onPress: () => void; children: React.ReactNode; className?: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: false, speed: 40, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: false, speed: 20, bounciness: 6 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity activeOpacity={0.92} onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} className={className}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

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

  const today = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const todayLabel = `${days[today.getDay()]}, ${months[today.getMonth()]} ${today.getDate()}`;
  const todayFact = todayCount > 0
    ? `${todayCount} ${todayCount === 1 ? 'trip' : 'trips'} logged today.`
    : 'No trips logged yet today.';

  if (loading) {
    return (
      <View className="flex-1 bg-slate-50 justify-center items-center">
        <ActivityIndicator size="large" color="#6d28d9" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-slate-50">
      <View className="bg-[#6d28d9] px-6 pt-16 pb-9">
        <Reveal>
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-violet-200 text-xs font-semibold">{todayLabel}</Text>
              <Text className="text-white text-[26px] font-bold mt-1">{firstName}</Text>
              <Text className="text-violet-100 text-sm mt-1">{todayFact}</Text>
            </View>
            <View className="bg-white/15 rounded-full w-12 h-12 items-center justify-center">
              <Truck size={22} color="#fff" />
            </View>
          </View>
        </Reveal>
      </View>

      <View className="px-6 -mt-4">
        <Reveal delay={80}>
          <View className="bg-white rounded-2xl border border-slate-100 flex-row">
            <View className="flex-1 p-4 border-r border-slate-100">
              <Text className="text-slate-400 text-[11px] font-semibold uppercase">Today</Text>
              <Text className="text-slate-900 text-[28px] font-semibold mt-1">{todayCount}</Text>
              <Text className="text-slate-400 text-xs mt-0.5">{todayCount === 1 ? 'entry' : 'entries'}</Text>
            </View>
            <View className="flex-1 p-4">
              <Text className="text-slate-400 text-[11px] font-semibold uppercase">This month</Text>
              <Text className="text-slate-900 text-[28px] font-semibold mt-1">{monthCount}</Text>
              <Text className="text-slate-400 text-xs mt-0.5">{monthCount === 1 ? 'entry' : 'entries'}</Text>
            </View>
          </View>
        </Reveal>
      </View>

      <View className="px-6 mt-5">
        <Reveal delay={160}>
          <PressableScale
            onPress={() => router.push({ pathname: '/(app)/entry/internal-vehicles', params: { id: undefined } })}
            className="bg-[#6d28d9] rounded-2xl py-4 px-5 flex-row items-center justify-between"
          >
            <Text className="text-white font-semibold text-base">New Vehicle Entry</Text>
            <View className="bg-white/15 rounded-full p-1.5">
              <Plus size={16} color="#fff" />
            </View>
          </PressableScale>
        </Reveal>
      </View>

      <View className="px-6 mt-7 mb-24">
        <Reveal delay={240}>
          <View className="bg-white rounded-2xl border border-slate-100 p-4">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center">
                <Text className="text-slate-900 font-semibold text-sm">Recent entries</Text>
                {recentEntries.length > 0 && (
                  <View className="bg-slate-100 rounded-full px-2 py-0.5 ml-2">
                    <Text className="text-slate-500 text-[11px] font-semibold">{recentEntries.length}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => router.push('/(app)/history')} activeOpacity={0.7} className="flex-row items-center">
                <Text className="text-[#6d28d9] font-semibold text-xs mr-0.5">View all</Text>
                <ChevronRight size={14} color="#6d28d9" />
              </TouchableOpacity>
            </View>

            {recentEntries.length === 0 ? (
              <View className="py-6 items-center">
                <Text className="text-slate-400 text-sm text-center">No trips logged yet. Use the button above to log your first one.</Text>
              </View>
            ) : (
              recentEntries.map((entry, index) => {
                const style = STATUS_STYLES[entry.status] || STATUS_STYLES.SUBMITTED;
                return (
                  <Reveal key={entry.id} delay={300 + index * 60}>
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: '/(app)/entry/internal-vehicles', params: { id: entry.id } })}
                      activeOpacity={0.7}
                      className={`bg-slate-50 rounded-xl px-3.5 py-3 ${index < recentEntries.length - 1 ? 'mb-2' : ''} flex-row items-center justify-between`}
                    >
                      <View className="flex-1 pr-3">
                        <Text className="text-slate-900 font-medium text-sm">{entry.entry_date}</Text>
                        <Text className="text-slate-400 text-xs mt-0.5" numberOfLines={1}>
                          {entry.jobs?.job_number ? `${entry.jobs.job_number} – ${entry.jobs.job_name}` : 'Unknown site'}
                        </Text>
                      </View>
                      <View className={`px-2 py-1 rounded-full ${style.bg}`}>
                        <Text className={`text-[10px] font-semibold ${style.text}`}>{entry.status}</Text>
                      </View>
                    </TouchableOpacity>
                  </Reveal>
                );
              })
            )}
          </View>
        </Reveal>
      </View>
    </ScrollView>
  );
}
