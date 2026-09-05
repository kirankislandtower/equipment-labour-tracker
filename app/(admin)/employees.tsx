import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal, useWindowDimensions } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Users, Plus, X, User, Eye, EyeOff, Search, Phone, Check } from 'lucide-react-native';

export default function EmployeesScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [loading, setLoading] = useState(true);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'loggedin'>('all');
  // A foreman is "currently logged in" when their single most recent
  // attendance_logs row is a LOGIN with no LOGOUT after it -- the same signal the
  // Attendance screen shows per-day, just taken across all time and per account.
  const [loggedInIds, setLoggedInIds] = useState<Set<string>>(new Set());

  // Modal state
  const [addModal, setAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Form state
  const [form, setForm] = useState({ username: '', fullName: '', password: '' });

  // Foreman details/edit modal state
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchLoginStatus();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'FOREMAN')
        .order('full_name');

      if (error) throw error;
      setUsersList(data || []);
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchLoginStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('user_id, action, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const seen = new Set<string>();
      const loggedIn = new Set<string>();
      (data || []).forEach((log: any) => {
        if (seen.has(log.user_id)) return;
        seen.add(log.user_id);
        if (log.action === 'LOGIN') loggedIn.add(log.user_id);
      });
      setLoggedInIds(loggedIn);
    } catch (error) {
      console.error('Error fetching login status:', error);
    }
  };

  const handleCreateUser = async () => {
    if (!form.username || !form.password || !form.fullName) {
      Alert.alert('Validation', 'Please fill in all fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Create user directly via GoTrue API to prevent logging the Admin out of their session
      const pseudoEmail = `${form.username.toLowerCase().trim()}@islandtower.local`;
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !anonKey) {
        throw new Error('Supabase configuration missing');
      }

      const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
        },
        body: JSON.stringify({
          email: pseudoEmail,
          password: form.password,
          data: {
            full_name: form.fullName,
            role: 'FOREMAN'
          }
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.msg || result.error_description || 'Failed to create user');
      }

      Alert.alert('Success', 'Foreman account created successfully!');
      setAddModal(false);
      setShowPassword(false);
      setForm({ username: '', fullName: '', password: '' });
      fetchUsers(); // Refresh the list
      fetchLoginStatus();
      
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', error.message || 'Could not create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openUserDetails = (u: any) => {
    setSelectedUser(u);
    setEditPhoneNumber(u.phone_number || '');
  };

  const handleSavePhone = async () => {
    if (!selectedUser) return;
    setSavingPhone(true);
    try {
      const trimmed = editPhoneNumber.trim();
      const { error } = await supabase
        .from('users')
        .update({ phone_number: trimmed || null })
        .eq('id', selectedUser.id);

      if (error) throw error;

      setUsersList(prev => prev.map(u => u.id === selectedUser.id ? { ...u, phone_number: trimmed || null } : u));
      setSelectedUser(null);
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', 'Failed to save phone number');
    } finally {
      setSavingPhone(false);
    }
  };

  const loggedInCount = usersList.filter((u) => loggedInIds.has(u.id)).length;

  const filteredUsers = usersList.filter((u) => {
    if (activeTab === 'loggedin' && !loggedInIds.has(u.id)) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    const username = u.email ? u.email.split('@')[0] : '';
    return (u.full_name || '').toLowerCase().includes(q) || username.toLowerCase().includes(q);
  });

  return (
    <View className={`flex-1 bg-slate-50 ${isMobile ? 'p-4' : 'p-8'}`}>
      <View className={`flex-row justify-between items-center mb-6 ${isMobile ? 'flex-wrap gap-y-4' : ''}`}>
        <View>
          <View className="flex-row items-center">
            <Text className="text-slate-900 text-3xl font-black tracking-tight mr-3">Foreman</Text>
            <View className="bg-blue-100 px-3 py-1 rounded-full border border-blue-200">
              <Text className="text-blue-700 font-bold text-xs">{usersList.length} Total</Text>
            </View>
          </View>
          <Text className="text-slate-500 mt-1">Manage Foremen and system access.</Text>
        </View>
        <TouchableOpacity
          onPress={() => setAddModal(true)}
          className="bg-[#1e3a8a] px-5 py-3 rounded-xl flex-row items-center active:opacity-80"
        >
          <Plus size={20} color="#fff" />
          <Text className="text-white font-bold ml-2">New Foreman</Text>
        </TouchableOpacity>
      </View>

      <View className="flex-row items-center gap-2 mb-4">
        <TouchableOpacity
          onPress={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-full border flex-row items-center ${activeTab === 'all' ? 'bg-[#1e3a8a] border-[#1e3a8a]' : 'bg-white border-slate-200'}`}
        >
          <Text className={`font-bold text-sm ${activeTab === 'all' ? 'text-white' : 'text-slate-600'}`}>All</Text>
          <View className={`ml-2 px-2 py-0.5 rounded-full ${activeTab === 'all' ? 'bg-white/20' : 'bg-slate-100'}`}>
            <Text className={`text-xs font-bold ${activeTab === 'all' ? 'text-white' : 'text-slate-500'}`}>{usersList.length}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('loggedin')}
          className={`px-4 py-2 rounded-full border flex-row items-center ${activeTab === 'loggedin' ? 'bg-green-600 border-green-600' : 'bg-white border-slate-200'}`}
        >
          <View className={`w-2 h-2 rounded-full mr-2 ${activeTab === 'loggedin' ? 'bg-white' : 'bg-green-500'}`} />
          <Text className={`font-bold text-sm ${activeTab === 'loggedin' ? 'text-white' : 'text-slate-600'}`}>Logged In</Text>
          <View className={`ml-2 px-2 py-0.5 rounded-full ${activeTab === 'loggedin' ? 'bg-white/20' : 'bg-green-50'}`}>
            <Text className={`text-xs font-bold ${activeTab === 'loggedin' ? 'text-white' : 'text-green-700'}`}>{loggedInCount}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View className="flex-row items-center bg-white border border-slate-200 rounded-xl px-4 h-12 mb-6">
        <Search size={18} color="#94a3b8" />
        <TextInput
          placeholder="Search by name or username"
          placeholderTextColor="#94a3b8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          className="flex-1 ml-3 text-slate-900"
          style={{ outlineStyle: 'none' } as any}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1">
            <X size={16} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </View>

      <View className="flex-1 bg-transparent overflow-hidden">
        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#0f172a" />
          </View>
        ) : (
          <ScrollView className="flex-1">
            <View className={`flex-1 ${isMobile ? '' : 'bg-white rounded-2xl shadow-sm border border-slate-200'} pb-20`}>
              {!isMobile && (
                <View className="flex-row items-center p-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
                  <Text className="flex-1 font-bold text-slate-500 text-xs uppercase">Full Name</Text>
                  <Text className="flex-1 font-bold text-slate-500 text-xs uppercase">Username</Text>
                  <Text className="flex-1 font-bold text-slate-500 text-xs uppercase">User ID</Text>
                  <Text className="w-24 font-bold text-slate-500 text-xs uppercase text-center">Role</Text>
                </View>
              )}
              
              {filteredUsers.length === 0 && (
                <View className="py-12 items-center">
                  <Text className="text-slate-500 font-medium">
                    {searchQuery
                      ? `No foremen match "${searchQuery}".`
                      : activeTab === 'loggedin'
                      ? 'No foremen are currently logged in.'
                      : 'No foremen found.'}
                  </Text>
                </View>
              )}

              {filteredUsers.map((u) => {
                const username = u.email ? u.email.split('@')[0] : 'unknown';

                return (
                  <TouchableOpacity
                    key={u.id}
                    onPress={() => openUserDetails(u)}
                    activeOpacity={0.7}
                    className={`${isMobile ? 'bg-white mb-3 p-4 rounded-xl shadow-sm border border-slate-100 flex-col' : 'flex-row items-center p-4 border-b border-slate-100'}`}
                  >
                    <View className={`${isMobile ? 'mb-4 border-b border-slate-100 pb-3' : 'flex-1'} flex-row items-center justify-between`}>
                      <View className="flex-row items-center">
                        <View className="relative mr-3">
                          <View className={`w-8 h-8 rounded-full items-center justify-center ${u.role === 'ADMIN' ? 'bg-blue-100' : 'bg-slate-100'}`}>
                            <User size={14} color={u.role === 'ADMIN' ? '#2563eb' : '#64748b'} />
                          </View>
                          {loggedInIds.has(u.id) && (
                            <View className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-white" />
                          )}
                        </View>
                        <Text className="text-slate-900 font-bold">{u.full_name}</Text>
                      </View>
                      {isMobile && (
                        <View className={`px-2 py-1 rounded ${u.role === 'ADMIN' ? 'bg-blue-50 border border-blue-200' : 'bg-slate-50 border border-slate-200'}`}>
                          <Text className={`text-[10px] font-bold uppercase tracking-wider ${u.role === 'ADMIN' ? 'text-blue-700' : 'text-slate-600'}`}>
                            {u.role}
                          </Text>
                        </View>
                      )}
                    </View>
                    
                    {!isMobile && <Text className="flex-1 text-slate-600">{username}</Text>}
                    {!isMobile && <Text className="flex-1 text-slate-400 text-xs font-mono">{u.id.split('-')[0]}...</Text>}
                    
                    {isMobile && (
                      <View className="flex-row justify-between">
                        <View>
                          <Text className="text-xs font-bold text-slate-400 mb-1 uppercase">Username</Text>
                          <Text className="text-slate-600">{username}</Text>
                        </View>
                        <View>
                          <Text className="text-xs font-bold text-slate-400 mb-1 uppercase text-right">User ID</Text>
                          <Text className="text-slate-400 text-xs font-mono text-right">{u.id.split('-')[0]}...</Text>
                        </View>
                      </View>
                    )}

                    {!isMobile && (
                      <View className="w-24 items-center">
                        <View className={`px-2 py-1 rounded ${u.role === 'ADMIN' ? 'bg-blue-50 border border-blue-200' : 'bg-slate-50 border border-slate-200'}`}>
                          <Text className={`text-[10px] font-bold uppercase tracking-wider ${u.role === 'ADMIN' ? 'text-blue-700' : 'text-slate-600'}`}>
                            {u.role}
                          </Text>
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Create User Modal */}
      <Modal visible={addModal} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center p-8">
          <View className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl">
            <View className="flex-row justify-between items-center mb-6">
              <View className="flex-row items-center">
                <View className="bg-blue-100 p-2 rounded-lg mr-3">
                  <Users size={20} color="#1e3a8a" />
                </View>
                <Text className="text-xl font-black text-slate-900">Add Foreman</Text>
              </View>
              <TouchableOpacity onPress={() => setAddModal(false)}><X size={24} color="#94a3b8" /></TouchableOpacity>
            </View>
            
            <View className="mb-4">
              <Text className="text-sm font-bold text-slate-700 mb-1">Full Name</Text>
              <TextInput 
                placeholder="e.g. John Doe" 
                value={form.fullName} 
                onChangeText={t => setForm({...form, fullName: t})} 
                className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-slate-900" 
              />
            </View>
            
            <View className="mb-4">
              <Text className="text-sm font-bold text-slate-700 mb-1">Login Username</Text>
              <TextInput 
                placeholder="e.g. johndoe" 
                value={form.username} 
                onChangeText={t => setForm({...form, username: t})} 
                autoCapitalize="none"
                className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-slate-900" 
              />
              <Text className="text-xs text-slate-400 mt-1">This is what they will type on the login screen.</Text>
            </View>
            
            <View className="mb-8">
              <Text className="text-sm font-bold text-slate-700 mb-1">Password</Text>
              <View className="w-full bg-slate-50 border border-slate-200 rounded-lg flex-row items-center pr-4">
                <TextInput 
                  placeholder="Minimum 6 characters" 
                  value={form.password} 
                  onChangeText={t => setForm({...form, password: t})} 
                  secureTextEntry={!showPassword}
                  className="flex-1 p-4 text-slate-900" 
                />
                <TouchableOpacity 
                  onPress={() => setShowPassword(!showPassword)}
                  className="p-2 -mr-2 active:opacity-60"
                >
                  {showPassword ? (
                    <EyeOff size={20} color="#94a3b8" />
                  ) : (
                    <Eye size={20} color="#94a3b8" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
            
            <TouchableOpacity 
              onPress={handleCreateUser} 
              disabled={isSubmitting}
              className={`bg-[#1e3a8a] py-4 rounded-xl items-center flex-row justify-center ${isSubmitting ? 'opacity-70' : ''}`}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-bold text-lg">Create Account</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Foreman Details / Edit Modal */}
      <Modal visible={!!selectedUser} transparent animationType="fade" onRequestClose={() => setSelectedUser(null)}>
        <View className="flex-1 bg-black/50 justify-center items-center p-8">
          <View className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl">
            <View className="flex-row items-start justify-between mb-6">
              <View className="flex-row items-start flex-1 mr-3">
                <View className={`p-2 rounded-lg mr-3 ${selectedUser?.role === 'ADMIN' ? 'bg-blue-100' : 'bg-slate-100'}`}>
                  <User size={20} color={selectedUser?.role === 'ADMIN' ? '#2563eb' : '#64748b'} />
                </View>
                <View className="flex-1">
                  <Text className="text-xl font-black text-slate-900 leading-tight">{selectedUser?.full_name}</Text>
                  <Text className="text-slate-400 text-xs font-mono mt-1">{selectedUser?.email?.split('@')[0]}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setSelectedUser(null)} className="p-1 -mt-1 -mr-1">
                <X size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <View className="flex-row mb-4">
              <View className="flex-1 mr-2">
                <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Role</Text>
                <Text className="text-slate-900 font-bold">{selectedUser?.role}</Text>
              </View>
              <View className="flex-1 ml-2">
                <Text className="text-xs font-bold text-slate-400 uppercase mb-1">User ID</Text>
                <Text className="text-slate-500 text-xs font-mono">{selectedUser?.id?.split('-')[0]}...</Text>
              </View>
            </View>

            <View className="mb-6">
              <Text className="text-sm font-bold text-slate-700 mb-1">Phone Number</Text>
              <View className="w-full bg-slate-50 border border-slate-200 rounded-lg flex-row items-center px-4">
                <Phone size={16} color="#94a3b8" />
                <TextInput
                  placeholder="e.g. +971 50 123 4567"
                  placeholderTextColor="#94a3b8"
                  value={editPhoneNumber}
                  onChangeText={setEditPhoneNumber}
                  keyboardType="phone-pad"
                  className="flex-1 p-4 ml-2 text-slate-900"
                />
              </View>
            </View>

            <TouchableOpacity
              onPress={handleSavePhone}
              disabled={savingPhone}
              className={`bg-[#1e3a8a] py-4 rounded-xl items-center flex-row justify-center ${savingPhone ? 'opacity-70' : ''}`}
            >
              {savingPhone ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Check size={18} color="#fff" />
                  <Text className="text-white font-bold text-base ml-2">Save</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}
