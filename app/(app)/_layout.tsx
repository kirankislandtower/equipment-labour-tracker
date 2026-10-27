import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { Home, Truck, Users, User, Droplets, Wrench, History as HistoryIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { processQueue } from '../../lib/offlineQueue';
import { FLUSHING_ENABLED_FOR_FOREMEN } from '../../lib/foremanFlags';
import { useAuth } from '../../lib/auth';

// Screens a Driver account can reach -- everything else in this group
// (Equipment/Labour/Flushing entries, the foreman Home dashboard, etc.) is
// off-limits, enforced both here (tab bar) and in the route guard below.
const DRIVER_ROUTES = ['driver-home', 'entry/internal-vehicles', 'history', 'profile'];

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { role } = useAuth();
  const isDriver = role === 'DRIVER';

  return (
    <View
      className="absolute left-4 right-4 bg-white/95 shadow-sm border border-slate-200 rounded-3xl flex-row justify-between items-center px-2 py-2"
      style={{ bottom: Platform.OS === 'web' ? 24 : Math.max(insets.bottom, 16), elevation: 5, backdropFilter: 'blur(10px)' } as any}
    >
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];

        if (isDriver) {
          // Four stops only: Home, Vehicle, History, Profile.
          if (!DRIVER_ROUTES.includes(route.name)) return null;
        } else {
          // Hide routes that shouldn't be in the tab bar (like entry forms),
          // plus the driver-only Home variant and Internal Vehicles, which is
          // Driver-login only now.
          const hiddenRoutes = FLUSHING_ENABLED_FOR_FOREMEN
            ? ['driver-home', 'entry/select', 'entry/material', 'entry/internal-vehicles', 'history', 'missing-photos']
            : ['driver-home', 'entry/select', 'entry/material', 'entry/internal-vehicles', 'history', 'missing-photos', 'entry/flushing'];
          if (hiddenRoutes.includes(route.name)) return null;
        }

        const label =
          options.tabBarLabel !== undefined
            ? options.tabBarLabel
            : options.title !== undefined
            ? options.title
            : route.name;

        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            if (route.name === 'entry/equipment' || route.name === 'entry/labour' || route.name === 'entry/internal-vehicles' || route.name === 'entry/flushing') {
              navigation.navigate(route.name, { ...route.params, id: undefined });
            } else {
              navigation.navigate(route.name, route.params);
            }
          }
        };

        const Icon = options.tabBarIcon;

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            className={`flex-1 items-center justify-center py-2.5 rounded-[20px] active:scale-[0.95] transition-transform ${isFocused ? 'bg-indigo-600' : 'bg-transparent'}`}
          >
            {Icon && <Icon size={22} color={isFocused ? '#ffffff' : '#475569'} strokeWidth={isFocused ? 2.5 : 2} />}
            <Text 
              className={`text-[9px] mt-1.5 uppercase tracking-widest ${isFocused ? 'text-white font-outfit-bold' : 'text-slate-500 font-outfit-semibold'}`}
              style={{ textAlign: 'center' }}
              numberOfLines={1}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function AppLayout() {
  const { role } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Drains any offline-queued entries as soon as this layout mounts (covers reopening
  // the app while already back online) and again whenever connectivity is restored,
  // regardless of which tab the foreman is on.
  useEffect(() => {
    processQueue();
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) processQueue();
    });
    return unsubscribe;
  }, []);

  // A Driver account is scoped to its own Home, Vehicle Entry, History and
  // Profile -- bounce away from every other screen in this group (e.g. a
  // bookmarked /entry/equipment URL on web).
  useEffect(() => {
    if (role !== 'DRIVER') return;
    const current = segments.slice(1).join('/'); // drop the '(app)' group segment
    if (!DRIVER_ROUTES.includes(current)) {
      router.replace('/(app)/driver-home');
    }
  }, [role, segments]);

  // Internal Vehicle Entry is Driver-login only -- bounce a Foreman away from
  // it too (e.g. a bookmarked /entry/internal-vehicles URL on web), not just
  // hide its tab bar button.
  useEffect(() => {
    if (!role || role === 'DRIVER') return;
    const current = segments.slice(1).join('/');
    if (current === 'entry/internal-vehicles') {
      router.replace('/(app)/home');
    }
  }, [role, segments]);

  const content = (
    <Tabs 
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ 
        headerShown: false,
        tabBarHideOnKeyboard: true, // Prevents footer from floating above keyboard
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="driver-home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="entry/equipment"
        options={{ 
          title: 'Equipment',
          tabBarIcon: ({ color, size }) => <Truck color={color} size={size} />
        }} 
      />
      <Tabs.Screen 
        name="entry/labour" 
        options={{ 
          title: 'Labour',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />
        }} 
      />
      <Tabs.Screen
        name="entry/internal-vehicles"
        options={{
          title: 'Vehicles',
          tabBarIcon: ({ color, size }) => <Wrench color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="entry/flushing"
        options={FLUSHING_ENABLED_FOR_FOREMEN ? {
          title: 'Flushing',
          tabBarIcon: ({ color, size }) => <Droplets color={color} size={size} />
        } : { href: null }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => <HistoryIcon color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />
        }}
      />

      {/* Hidden Screens inside the Tabs layout */}
      <Tabs.Screen name="entry/select" options={{ href: null }} />
      <Tabs.Screen name="entry/material" options={{ href: null }} />
      <Tabs.Screen name="missing-photos" options={{ href: null }} />
    </Tabs>
  );

  if (Platform.OS === 'web') {
    return (
      <View className="flex-1 bg-slate-100 items-center justify-center">
        <View className="w-full max-w-[480px] h-full bg-slate-50 shadow-2xl overflow-hidden border-x border-slate-200">
          {content}
        </View>
      </View>
    );
  }

  return content;
}
