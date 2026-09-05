import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Home, Truck, Users, User, ArrowRightLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { processQueue } from '../../lib/offlineQueue';

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  
  return (
    <View 
      className="absolute left-4 right-4 bg-white/95 shadow-sm border border-slate-200 rounded-3xl flex-row justify-between items-center px-2 py-2"
      style={{ bottom: Platform.OS === 'web' ? 24 : Math.max(insets.bottom, 16), elevation: 5, backdropFilter: 'blur(10px)' }}
    >
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        
        // Hide routes that shouldn't be in the tab bar (like entry forms)
        if (['entry/select', 'history'].includes(route.name)) return null;

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
            if (route.name === 'entry/equipment' || route.name === 'entry/labour' || route.name === 'entry/material') {
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
        name="entry/material" 
        options={{ 
          title: 'Material',
          tabBarIcon: ({ color, size }) => <ArrowRightLeft color={color} size={size} />
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
      <Tabs.Screen name="history" options={{ href: null }} />
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
