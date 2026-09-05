import React, { useState } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions, Modal, SafeAreaView, ActivityIndicator, Image, ScrollView, Platform } from 'react-native';
import { Slot, useRouter, usePathname } from 'expo-router';
import { Truck, Users, LayoutDashboard, LogOut, Settings, UserPlus, Menu, X, AlertTriangle, FileText, Shield, MapPin, ArrowRightLeft, Clock as AttendanceIcon } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

export default function AdminLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const confirmLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    
    // Attempt to fetch current user to log out
    const { data: { user } } = await supabase.auth.getUser();

    await Promise.all([
      supabase.auth.signOut(),
      new Promise(resolve => setTimeout(resolve, 2000))
    ]);
    setIsLoggingOut(false);
    setLogoutModalVisible(false);
    router.replace('/');
  };

  const handleLogout = () => {
    if (isMobile) {
      setMenuOpen(false);
    }
    // Add a tiny delay so the sidebar can close smoothly before showing the logout modal
    setTimeout(() => {
      setLogoutModalVisible(true);
    }, 50);
  };

  const NavItem = ({ icon: Icon, label, href }: { icon: any, label: string, href: string }) => {
    // Expo Router's usePathname() omits route groups like (admin)
    const normalizedHref = href.replace('/(admin)', '');
    const isActive = pathname === href || pathname === normalizedHref;
    
    return (
      <TouchableOpacity 
        onPress={() => {
          router.push(href as any);
          if (isMobile) setMenuOpen(false);
        }}
        className={`flex-row items-center py-3.5 px-4 rounded-xl mb-1 active:scale-[0.98] transition-transform ${isActive ? 'bg-slate-900 border-l-4 border-indigo-500 shadow-sm' : 'hover:bg-slate-900 border-l-4 border-transparent'}`}
      >
        <Icon size={20} color={isActive ? '#ffffff' : '#71717a'} className="mr-3" />
        <Text className={`font-semibold tracking-wide ${isActive ? 'text-white' : 'text-slate-400'}`}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const BottomTabItem = ({ icon: Icon, label, href }: { icon: any, label: string, href: string }) => {
    const normalizedHref = href.replace('/(admin)', '');
    const isActive = pathname === href || pathname === normalizedHref;
    return (
      <TouchableOpacity 
        onPress={() => router.push(href as any)}
        className="items-center justify-center flex-1 active:opacity-70"
      >
        <View className={`p-2 rounded-xl ${isActive ? 'bg-blue-50' : ''}`}>
          <Icon size={24} color={isActive ? '#1d4ed8' : '#64748b'} />
        </View>
        <Text style={{ fontSize: 10 }} className={`mt-1 font-bold ${isActive ? 'text-blue-700' : 'text-slate-500'}`}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const SidebarContent = () => (
    <ScrollView 
      className="flex-1 bg-slate-950" 
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-center justify-between mb-8 px-2">
        <View className="flex-row items-center">
          <View className="bg-white p-1 rounded-xl mr-3 shadow-sm">
            <Image 
              source={require('../../assets/images/island_tower_logo.jpg')} 
              style={{ width: 32, height: 32, borderRadius: 8 }} 
              resizeMode="contain" 
            />
          </View>
          <View>
            <Text className="text-white text-2xl font-outfit-black tracking-tight">ISLAND TOWER</Text>
            <Text className="text-indigo-400 text-xs font-outfit-bold uppercase tracking-widest">Admin Portal</Text>
          </View>
        </View>
        {isMobile && (
          <TouchableOpacity onPress={() => setMenuOpen(false)} className="p-2">
            <X size={24} color="#ffffff" />
          </TouchableOpacity>
        )}
      </View>

      <View className="mb-2">
        <Text className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-4 px-2">Menu</Text>
        <NavItem icon={LayoutDashboard} label="Dashboard" href="/(admin)/dashboard" />
        <NavItem icon={Truck} label="Equipment Entries" href="/(admin)/equipment" />
        <NavItem icon={Users} label="Labour Entries" href="/(admin)/labour" />
        <NavItem icon={ArrowRightLeft} label="Material Transfers" href="/(admin)/materials" />
        <NavItem icon={FileText} label="Foreman Reports" href="/(admin)/foremen" />
        <NavItem icon={AttendanceIcon} label="Attendance" href="/(admin)/attendance" />
        <NavItem icon={MapPin} label="Site Allocations" href="/(admin)/allocations" />
        <NavItem icon={Settings} label="Master Data" href="/(admin)/settings" />
        <NavItem icon={UserPlus} label="Foreman" href="/(admin)/employees" />
        <NavItem icon={Shield} label="Admins" href="/(admin)/admins" />
      </View>

      <View className="pt-4 border-t border-slate-900 mt-2">
        <TouchableOpacity 
          onPress={handleLogout}
          className="flex-row items-center px-4 py-3 rounded-xl active:bg-slate-900 active:scale-[0.98]"
        >
          <LogOut size={20} color="#ef4444" />
          <Text className="ml-3 font-outfit-semibold text-red-500">Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  return (
    <View className="flex-1 flex-row bg-slate-50">
      {/* Logout Confirmation Modal */}
      <Modal visible={logoutModalVisible} transparent animationType="fade" onRequestClose={() => setLogoutModalVisible(false)}>
        <View className="flex-1 bg-black/50 justify-center items-center p-8">
          <View className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl items-center">
            <View className="bg-red-100 p-4 rounded-full mb-4">
              <AlertTriangle size={32} color="#ef4444" />
            </View>
            <Text className="text-xl font-black text-slate-900 mb-2">Logout?</Text>
            <Text className="text-slate-500 text-center mb-6">Are you sure you want to logout from the admin portal?</Text>
            <View className="flex-row gap-3 w-full">
              <TouchableOpacity
                onPress={() => setLogoutModalVisible(false)}
                className="flex-1 bg-slate-100 border border-slate-200 py-3 rounded-xl items-center active:bg-slate-200"
              >
                <Text className="text-slate-700 font-bold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmLogout}
                disabled={isLoggingOut}
                className={`flex-1 ${isLoggingOut ? 'bg-red-400' : 'bg-red-500'} py-3 rounded-xl items-center flex-row justify-center active:bg-red-600`}
              >
                {isLoggingOut ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-white font-bold">Logout</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Desktop Sidebar */}
      {!isMobile && (
        <View className="w-64 border-r border-slate-900 bg-slate-950">
          <SidebarContent />
        </View>
      )}

      {/* Main Content Area */}
      <View className="flex-1 flex-col">
        {/* Mobile Header */}
        {isMobile && (
          <View className="bg-slate-950 flex-row items-center justify-between p-4 pt-10 border-b border-slate-900">
            <TouchableOpacity onPress={() => setMenuOpen(true)} className="flex-row items-center active:opacity-80">
              <View className="flex-row items-center">
                <View className="bg-white p-1 rounded-lg mr-2">
                  <Image 
                    source={require('../../assets/images/island_tower_logo.jpg')} 
                    style={{ width: 24, height: 24, borderRadius: 4 }} 
                    resizeMode="contain" 
                  />
                </View>
                <Text className="text-white text-xl font-black tracking-tight">ISLAND TOWER</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMenuOpen(true)} className="p-2 active:opacity-80">
              <Menu size={28} color="#ffffff" />
            </TouchableOpacity>
          </View>
        )}

        <View className="flex-1">
          <Slot />
        </View>

        {/* Mobile Bottom Tab Bar */}
        {isMobile && (
          <View className="bg-white flex-row items-center justify-between px-2 pt-3 pb-8 border-t border-slate-200" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 10 }}>
            <BottomTabItem icon={LayoutDashboard} label="Home" href="/(admin)/dashboard" />
            <BottomTabItem icon={Truck} label="Equipment" href="/(admin)/equipment" />
            <BottomTabItem icon={Users} label="Labour" href="/(admin)/labour" />
            <BottomTabItem icon={ArrowRightLeft} label="Materials" href="/(admin)/materials" />
          </View>
        )}
      </View>

      {/* Mobile Menu Modal */}
      {isMobile && (
        <Modal visible={menuOpen} animationType="slide" transparent={false}>
          <View 
            className="flex-1 bg-slate-950" 
            style={{ 
              height: Platform.OS === 'web' ? '100dvh' : '100%', 
              paddingTop: Platform.OS === 'web' ? 0 : 40 
            }}
          >
            <SidebarContent />
          </View>
        </Modal>
      )}
    </View>
  );
}
