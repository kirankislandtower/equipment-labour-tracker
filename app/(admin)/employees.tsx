import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal, useWindowDimensions } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Users, Plus, X, User, Eye, EyeOff } from 'lucide-react-native';

export default function EmployeesScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [loading, setLoading] = useState(true);
  const [usersList, setUsersList] = useState<any[]>([]);
  
  // Modal state
  const [addModal, setAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Form state
  const [form, setForm] = useState({ username: '', fullName: '', password: '' });

  useEffect(() => {
    fetchUsers();
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
      
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', error.message || 'Could not create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className={`flex-1 bg-slate-50 ${isMobile ? 'p-4' : 'p-8'}`}>
      <View className={`flex-row justify-between items-center mb-8 ${isMobile ? 'flex-wrap gap-y-4' : ''}`}>
        <View>
          <View className="flex-row items-center">
            <Text className="text-slate-900 text-3xl font-black tracking-tight mr-3">Foremans</Text>
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
              
              {usersList.map((u) => {
                const username = u.email ? u.email.split('@')[0] : 'unknown';
                
                return (
                  <View key={u.id} className={`${isMobile ? 'bg-white mb-3 p-4 rounded-xl shadow-sm border border-slate-100 flex-col' : 'flex-row items-center p-4 border-b border-slate-100'}`}>
                    <View className={`${isMobile ? 'mb-4 border-b border-slate-100 pb-3' : 'flex-1'} flex-row items-center justify-between`}>
                      <View className="flex-row items-center">
                        <View className={`w-8 h-8 rounded-full items-center justify-center mr-3 ${u.role === 'ADMIN' ? 'bg-blue-100' : 'bg-slate-100'}`}>
                          <User size={14} color={u.role === 'ADMIN' ? '#2563eb' : '#64748b'} />
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
                  </View>
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

    </View>
  );
}
