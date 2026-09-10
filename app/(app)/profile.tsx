import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TouchableWithoutFeedback, Keyboard, Modal, Platform, ActivityIndicator, Image, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { useRouter, useFocusEffect } from 'expo-router';
import { User, Mail, LogOut, Shield, Download, CheckCircle, Share, X, PhoneCall } from 'lucide-react-native';
import {
  canPromptInstall,
  promptInstall,
  isStandalone,
  isIOS,
  subscribePwaInstallChanges,
} from '../../lib/pwaInstall';

export default function ProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Re-rendered whenever the browser's install-availability changes (the event
  // that makes canPromptInstall() true can fire after this screen has already
  // mounted, and installing the app flips isStandalone() true without a reload).
  const [, forceInstallRerender] = useState(0);
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  React.useEffect(() => {
    const unsubscribe = subscribePwaInstallChanges(() => forceInstallRerender((n) => n + 1));
    return unsubscribe;
  }, []);

  const handleInstallPress = async () => {
    if (canPromptInstall()) {
      await promptInstall();
    } else {
      setShowIosInstructions(true);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      setIsTransitioning(true);
      const timer = setTimeout(() => setIsTransitioning(false), 300);
      return () => clearTimeout(timer);
    }, [])
  );

  const handleLogoutConfirm = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    if (user?.id) {
      // Admin might not have access to insert attendance logs but profile is for foremen
      await supabase.from('attendance_logs').insert({
        user_id: user.id,
        action: 'LOGOUT'
      });
    }

    await Promise.all([
      supabase.auth.signOut(),
      new Promise(resolve => setTimeout(resolve, 2000))
    ]);
    setIsLoggingOut(false);
    setShowLogoutModal(false);
    router.replace('/');
  };

  const username = user?.email?.split('@')[0] || 'Foreman';
  const role = user?.email?.includes('admin') ? 'Administrator' : 'Foreman';

  if (isTransitioning) {
    return (
      <View className="flex-1 bg-slate-50 justify-center items-center">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView className="flex-1 bg-slate-50">
        <View className="px-6 py-5 border-b border-slate-200 bg-white flex-row justify-between items-center">
          <Text className="text-slate-900 text-3xl font-black tracking-tight">Profile</Text>
          <Image 
            source={require('../../assets/images/island_tower_logo.jpg')} 
            style={{ width: 40, height: 40, borderRadius: 8 }}
            resizeMode="contain" 
          />
        </View>

        <ScrollView className="flex-1 px-6 pt-8" contentContainerStyle={{ paddingBottom: 130 }}>
          {/* Avatar Section */}
          <View className="items-center mb-10">
            <View className="w-24 h-24 bg-blue-100 rounded-full items-center justify-center border-4 border-white shadow-sm mb-4">
              <Text className="text-blue-900 text-4xl font-black">{username.charAt(0).toUpperCase()}</Text>
            </View>
            <Text className="text-2xl font-black text-slate-900 tracking-tight">{username.charAt(0).toUpperCase() + username.slice(1)}</Text>
            <View className="flex-row items-center mt-2 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
              <Shield size={14} color="#64748b" />
              <Text className="text-slate-600 font-bold text-xs ml-1.5 uppercase tracking-wider">{role}</Text>
            </View>
          </View>

          {/* Details */}
          <View className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm mb-8">
            <View className="flex-row items-center mb-6">
              <View className="bg-slate-50 p-3 rounded-full border border-slate-100 mr-4">
                <User size={20} color="#64748b" />
              </View>
              <View>
                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Account Name</Text>
                <Text className="text-base font-bold text-slate-900">{username}</Text>
              </View>
            </View>

            <View className="h-px bg-slate-100 w-full mb-6" />

            <View className="flex-row items-center">
              <View className="bg-slate-50 p-3 rounded-full border border-slate-100 mr-4">
                <Mail size={20} color="#64748b" />
              </View>
              <View>
                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Email Address</Text>
                <Text className="text-base font-bold text-slate-900">{user?.email || 'No email provided'}</Text>
              </View>
            </View>
          </View>

          {/* Install App */}
          {Platform.OS === 'web' && (
            <View className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm mb-8">
              {isStandalone() ? (
                <View className="flex-row items-center">
                  <View className="bg-green-50 p-3 rounded-full border border-green-100 mr-4">
                    <CheckCircle size={20} color="#16a34a" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">App Status</Text>
                    <Text className="text-base font-bold text-slate-900">Installed on this device</Text>
                  </View>
                </View>
              ) : (
                <>
                  <View className="flex-row items-center mb-4">
                    <View className="bg-blue-50 p-3 rounded-full border border-blue-100 mr-4">
                      <Download size={20} color="#1e3a8a" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Get the App</Text>
                      <Text className="text-base font-bold text-slate-900">Install for quick, one-tap access</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={handleInstallPress}
                    className="flex-row items-center justify-center bg-[#1e3a8a] py-4 rounded-2xl active:opacity-90"
                  >
                    <Download size={20} color="#fff" />
                    <Text className="text-white font-bold text-lg ml-2">Download App</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {/* Need Help */}
          <View className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm mb-8">
            <View className="flex-row items-center mb-4">
              <View className="bg-amber-50 p-3 rounded-full border border-amber-100 mr-4">
                <PhoneCall size={20} color="#d97706" />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Need Help?</Text>
                <Text className="text-base font-bold text-slate-900">Call or WhatsApp us anytime</Text>
              </View>
            </View>
            <View className="flex-row gap-x-3">
              <TouchableOpacity
                onPress={() => Linking.openURL('tel:+971526605909')}
                className="flex-1 flex-row items-center justify-center bg-slate-50 border border-slate-200 py-3.5 rounded-2xl active:bg-slate-100"
              >
                <Text className="text-slate-900 font-bold">052 660 5909</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => Linking.openURL('tel:+971547714315')}
                className="flex-1 flex-row items-center justify-center bg-slate-50 border border-slate-200 py-3.5 rounded-2xl active:bg-slate-100"
              >
                <Text className="text-slate-900 font-bold">054 771 4315</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Logout Button */}
          <TouchableOpacity 
            onPress={() => setShowLogoutModal(true)}
            className="flex-row items-center justify-center bg-red-50 border border-red-200 py-4 rounded-2xl active:bg-red-100 mt-auto"
          >
            <LogOut size={20} color="#dc2626" />
            <Text className="text-red-600 font-bold text-lg ml-2">Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Custom Logout Modal */}
        <Modal
          visible={showLogoutModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowLogoutModal(false)}
        >
          <View className="flex-1 bg-slate-900/40 justify-center items-center px-6">
            <View className="bg-white w-full max-w-sm rounded-[32px] p-6 items-center shadow-2xl">
              <View className="w-16 h-16 bg-red-50 rounded-full items-center justify-center mb-4 border border-red-100">
                <LogOut size={28} color="#dc2626" />
              </View>
              <Text className="text-2xl font-black text-slate-900 mb-2 tracking-tight text-center">Sign Out</Text>
              <Text className="text-slate-500 text-center mb-8 font-medium leading-relaxed">
                Are you sure you want to sign out of your account?
              </Text>
              
              <View className="flex-row w-full">
                <TouchableOpacity 
                  onPress={() => setShowLogoutModal(false)}
                  className="flex-1 bg-slate-100 py-4 rounded-2xl mr-2 items-center active:bg-slate-200 border border-slate-200"
                >
                  <Text className="text-slate-700 font-bold text-lg">Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  onPress={handleLogoutConfirm}
                  disabled={isLoggingOut}
                  className={`flex-1 ${isLoggingOut ? 'bg-red-400' : 'bg-red-600'} py-4 rounded-2xl ml-2 items-center flex-row justify-center active:bg-red-700 shadow-sm shadow-red-200`}
                >
                  {isLoggingOut ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text className="text-white font-bold text-lg">Sign Out</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Manual Install Instructions -- shown when there's no programmatic install
            prompt available (always true on iOS Safari; also a fallback for any
            browser that hasn't fired beforeinstallprompt for whatever reason). */}
        <Modal
          visible={showIosInstructions}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowIosInstructions(false)}
        >
          <View className="flex-1 bg-slate-900/40 justify-center items-center px-6">
            <View className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-2xl font-black text-slate-900 tracking-tight">Install App</Text>
                <TouchableOpacity onPress={() => setShowIosInstructions(false)} className="bg-slate-100 p-2 rounded-full active:bg-slate-200">
                  <X size={20} color="#64748b" />
                </TouchableOpacity>
              </View>

              {isIOS() ? (
                <View>
                  <View className="flex-row items-start mb-4">
                    <View className="bg-blue-50 w-8 h-8 rounded-full items-center justify-center mr-3 mt-0.5">
                      <Text className="text-blue-900 font-black text-sm">1</Text>
                    </View>
                    <View className="flex-1 flex-row items-center flex-wrap">
                      <Text className="text-slate-700 font-medium leading-relaxed">Tap the </Text>
                      <Share size={15} color="#1e3a8a" />
                      <Text className="text-slate-700 font-medium leading-relaxed"> Share icon at the bottom of Safari</Text>
                    </View>
                  </View>
                  <View className="flex-row items-start mb-4">
                    <View className="bg-blue-50 w-8 h-8 rounded-full items-center justify-center mr-3 mt-0.5">
                      <Text className="text-blue-900 font-black text-sm">2</Text>
                    </View>
                    <Text className="flex-1 text-slate-700 font-medium leading-relaxed">
                      Scroll down and tap <Text className="font-bold text-slate-900">"Add to Home Screen"</Text>
                    </Text>
                  </View>
                  <View className="flex-row items-start">
                    <View className="bg-blue-50 w-8 h-8 rounded-full items-center justify-center mr-3 mt-0.5">
                      <Text className="text-blue-900 font-black text-sm">3</Text>
                    </View>
                    <Text className="flex-1 text-slate-700 font-medium leading-relaxed">
                      Tap <Text className="font-bold text-slate-900">"Add"</Text> in the top right corner
                    </Text>
                  </View>
                </View>
              ) : (
                <Text className="text-slate-700 font-medium leading-relaxed">
                  Open your browser's menu (usually a ⋮ or ••• icon) and look for{' '}
                  <Text className="font-bold text-slate-900">"Install app"</Text> or{' '}
                  <Text className="font-bold text-slate-900">"Add to Home Screen"</Text>.
                </Text>
              )}

              <TouchableOpacity
                onPress={() => setShowIosInstructions(false)}
                className="bg-[#1e3a8a] py-4 rounded-2xl items-center mt-6"
              >
                <Text className="text-white font-bold text-lg">Got It</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}
