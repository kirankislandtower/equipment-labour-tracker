import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { openWhatsApp } from '../../lib/whatsapp';
import { Users, Plus, X, User, Eye, EyeOff, Search, Phone, Check, MessageCircle, FileText, Trash2, RotateCcw, AlertCircle, Clock, LogIn, LogOut } from 'lucide-react-native';

export default function EmployeesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [loading, setLoading] = useState(true);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'loggedin' | 'notloggedin' | 'submitted' | 'notsubmitted'>('all');
  // Sub-filter within the "Not Logged In" tab -- whether they have a saved phone
  // number, since that's what decides if they can be WhatsApp-reminded at all.
  const [notLoggedInPhoneFilter, setNotLoggedInPhoneFilter] = useState<'all' | 'has_number' | 'no_number'>('all');
  // A foreman is "currently logged in" when their single most recent
  // attendance_logs row is a LOGIN with no LOGOUT after it -- the same signal the
  // Attendance screen shows per-day, just taken across all time and per account.
  const [loggedInIds, setLoggedInIds] = useState<Set<string>>(new Set());
  // Anyone who has EVER logged in, regardless of whether they're signed in right
  // now -- used for "Not Logged In", which should mean "has never used the app",
  // not "isn't signed in at this exact moment".
  const [everLoggedInIds, setEverLoggedInIds] = useState<Set<string>>(new Set());
  // Anyone who has ever had an Equipment, Labour, or Material entry attributed to
  // their account -- a foreman can be logged in without ever actually submitting a
  // form, which this catches separately from login status.
  const [everSubmittedIds, setEverSubmittedIds] = useState<Set<string>>(new Set());

  // Modal state
  const [addModal, setAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Form state
  const [form, setForm] = useState({ username: '', fullName: '', password: '' });

  // Foreman details/edit modal state
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editAwayReason, setEditAwayReason] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [deletingForeman, setDeletingForeman] = useState(false);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<any>(null);

  // Trash modal state
  const [trashModalVisible, setTrashModalVisible] = useState(false);
  const [trashList, setTrashList] = useState<any[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Login history modal state
  const [loginHistoryVisible, setLoginHistoryVisible] = useState(false);
  const [loginHistoryUser, setLoginHistoryUser] = useState<any>(null);
  const [loginHistoryList, setLoginHistoryList] = useState<any[]>([]);
  const [loginHistoryLoading, setLoginHistoryLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchLoginStatus();
    fetchSubmissionStatus();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'FOREMAN')
        .is('deleted_at', null)
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
      const everLoggedIn = new Set<string>();
      (data || []).forEach((log: any) => {
        // Every real login inserts a LOGIN row (see app/index.tsx), so appearing here
        // at all -- regardless of current state -- means this account has actually
        // been used at least once. That's a different question from "signed in right
        // now": someone who logged in yesterday and later logged out has still used
        // the app, so they shouldn't show up as "Not Logged In".
        everLoggedIn.add(log.user_id);
        if (seen.has(log.user_id)) return;
        seen.add(log.user_id);
        if (log.action === 'LOGIN') loggedIn.add(log.user_id);
      });
      setLoggedInIds(loggedIn);
      setEverLoggedInIds(everLoggedIn);
    } catch (error) {
      console.error('Error fetching login status:', error);
    }
  };

  const fetchSubmissionStatus = async () => {
    try {
      const [equipRes, labourRes, materialRes] = await Promise.all([
        supabase.from('equipment_entries').select('created_by'),
        supabase.from('labour_entries').select('created_by'),
        supabase.from('material_transfers').select('created_by'),
      ]);

      const submitted = new Set<string>();
      [equipRes.data, labourRes.data, materialRes.data].forEach((rows) => {
        (rows || []).forEach((row: any) => {
          if (row.created_by) submitted.add(row.created_by);
        });
      });
      setEverSubmittedIds(submitted);
    } catch (error) {
      console.error('Error fetching submission status:', error);
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

  const sendLoginReminder = (u: any) => {
    if (!u.phone_number) return;
    const firstName = (u.full_name || '').split(' ')[0] || 'Sir';
    const message = `Hi ${firstName}, this is a reminder to log in to the Island Tower app. It only takes 2 minutes. Need help? Call or WhatsApp +971 52 660 5909 or +971 54 771 4315.`;
    openWhatsApp(u.phone_number, message);
  };

  const sendSubmissionReminder = (u: any) => {
    if (!u.phone_number) return;
    const firstName = (u.full_name || '').split(' ')[0] || 'Sir';
    const message = `Hi ${firstName}, you're logged in to the Island Tower app but haven't submitted any Equipment, Labour, or Material entries yet. Please submit your daily entries so your work gets recorded. Need help? Call or WhatsApp +971 52 660 5909 or +971 54 771 4315.`;
    openWhatsApp(u.phone_number, message);
  };

  const openUserDetails = (u: any) => {
    setSelectedUser(u);
    setEditPhoneNumber(u.phone_number || '');
    setEditAwayReason(u.away_reason || '');
  };

  const handleSavePhone = async () => {
    if (!selectedUser) return;
    setSavingPhone(true);
    try {
      const trimmedPhone = editPhoneNumber.trim();
      const trimmedAwayReason = editAwayReason.trim();
      const { error } = await supabase
        .from('users')
        .update({ phone_number: trimmedPhone || null, away_reason: trimmedAwayReason || null })
        .eq('id', selectedUser.id);

      if (error) throw error;

      setUsersList(prev => prev.map(u => u.id === selectedUser.id ? { ...u, phone_number: trimmedPhone || null, away_reason: trimmedAwayReason || null } : u));
      setSelectedUser(null);
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', 'Failed to save foreman details');
    } finally {
      setSavingPhone(false);
    }
  };

  const confirmDeleteForeman = async () => {
    if (!deleteConfirmUser) return;
    setDeletingForeman(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', deleteConfirmUser.id);
      if (error) throw error;

      setUsersList(prev => prev.filter(x => x.id !== deleteConfirmUser.id));
      setDeleteConfirmUser(null);
      setSelectedUser(null);
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', 'Failed to delete foreman');
    } finally {
      setDeletingForeman(false);
    }
  };

  const openTrash = async () => {
    setTrashModalVisible(true);
    setTrashLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'FOREMAN')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });
      if (error) throw error;
      setTrashList(data || []);
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', 'Failed to load trash');
    } finally {
      setTrashLoading(false);
    }
  };

  const handleRestoreForeman = async (u: any) => {
    setRestoringId(u.id);
    try {
      const { error } = await supabase
        .from('users')
        .update({ deleted_at: null })
        .eq('id', u.id);
      if (error) throw error;

      setTrashList(prev => prev.filter(x => x.id !== u.id));
      fetchUsers();
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', 'Failed to restore foreman');
    } finally {
      setRestoringId(null);
    }
  };

  const openLoginHistory = async (u: any) => {
    setLoginHistoryUser(u);
    setLoginHistoryVisible(true);
    setLoginHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('action, created_at')
        .eq('user_id', u.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setLoginHistoryList(data || []);
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', 'Failed to load login history');
    } finally {
      setLoginHistoryLoading(false);
    }
  };

  const loggedInCount = usersList.filter((u) => loggedInIds.has(u.id)).length;
  const notLoggedInCount = usersList.filter((u) => !everLoggedInIds.has(u.id)).length;
  const submittedCount = usersList.filter((u) => everSubmittedIds.has(u.id)).length;
  const notSubmittedCount = usersList.filter((u) => !everSubmittedIds.has(u.id)).length;

  // Only the foremen who haven't logged in can be WhatsApp-reminded, and only if
  // there's a saved number -- this splits that group so the admin can see how many
  // still need a phone number collected before a reminder can even be sent.
  const notLoggedInWithNumberCount = usersList.filter((u) => !everLoggedInIds.has(u.id) && !!u.phone_number).length;
  const notLoggedInNoNumberCount = usersList.filter((u) => !everLoggedInIds.has(u.id) && !u.phone_number).length;

  const filteredUsers = usersList.filter((u) => {
    if (activeTab === 'loggedin' && !loggedInIds.has(u.id)) return false;
    if (activeTab === 'notloggedin' && everLoggedInIds.has(u.id)) return false;
    if (activeTab === 'notloggedin' && notLoggedInPhoneFilter === 'has_number' && !u.phone_number) return false;
    if (activeTab === 'notloggedin' && notLoggedInPhoneFilter === 'no_number' && !!u.phone_number) return false;
    if (activeTab === 'submitted' && !everSubmittedIds.has(u.id)) return false;
    if (activeTab === 'notsubmitted' && everSubmittedIds.has(u.id)) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    const username = u.email ? u.email.split('@')[0] : '';
    return (u.full_name || '').toLowerCase().includes(q) || username.toLowerCase().includes(q);
  });

  return (
    <View className={`flex-1 bg-slate-50 ${isMobile ? 'p-4' : 'p-8'}`}>
      <View className={`justify-between items-center mb-6 ${isMobile ? 'flex-col items-stretch gap-y-4' : 'flex-row'}`}>
        <View>
          <View className="flex-row items-center flex-wrap">
            <Text className={`text-slate-900 font-black tracking-tight mr-3 ${isMobile ? 'text-2xl' : 'text-3xl'}`}>Foreman</Text>
            <View className="bg-blue-100 px-3 py-1 rounded-full border border-blue-200">
              <Text className="text-blue-700 font-bold text-xs">{usersList.length} Total</Text>
            </View>
          </View>
          <Text className="text-slate-500 mt-1">Manage Foremen and system access.</Text>
        </View>
        <View className={`flex-row ${isMobile ? '' : 'items-center'}`} style={{ gap: 8 }}>
          <TouchableOpacity
            onPress={openTrash}
            className={`bg-white border border-slate-200 px-4 py-3 rounded-xl flex-row items-center active:bg-slate-50 ${isMobile ? 'justify-center flex-1' : ''}`}
          >
            <Trash2 size={18} color="#64748b" />
            <Text className="text-slate-700 font-bold ml-2">Trash</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setAddModal(true)}
            className={`bg-[#1e3a8a] px-5 py-3 rounded-xl flex-row items-center active:opacity-80 ${isMobile ? 'justify-center flex-1' : ''}`}
          >
            <Plus size={20} color="#fff" />
            <Text className="text-white font-bold ml-2">New Foreman</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: isMobile ? 16 : 0 }}
        style={{ flexGrow: 0, marginBottom: 16 }}
      >
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
        <TouchableOpacity
          onPress={() => setActiveTab('notloggedin')}
          className={`px-4 py-2 rounded-full border flex-row items-center ${activeTab === 'notloggedin' ? 'bg-amber-600 border-amber-600' : 'bg-white border-slate-200'}`}
        >
          <View className={`w-2 h-2 rounded-full mr-2 ${activeTab === 'notloggedin' ? 'bg-white' : 'bg-amber-500'}`} />
          <Text className={`font-bold text-sm ${activeTab === 'notloggedin' ? 'text-white' : 'text-slate-600'}`}>Not Logged In</Text>
          <View className={`ml-2 px-2 py-0.5 rounded-full ${activeTab === 'notloggedin' ? 'bg-white/20' : 'bg-amber-50'}`}>
            <Text className={`text-xs font-bold ${activeTab === 'notloggedin' ? 'text-white' : 'text-amber-700'}`}>{notLoggedInCount}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('submitted')}
          className={`px-4 py-2 rounded-full border flex-row items-center ${activeTab === 'submitted' ? 'bg-teal-600 border-teal-600' : 'bg-white border-slate-200'}`}
        >
          <View className={`w-2 h-2 rounded-full mr-2 ${activeTab === 'submitted' ? 'bg-white' : 'bg-teal-500'}`} />
          <Text className={`font-bold text-sm ${activeTab === 'submitted' ? 'text-white' : 'text-slate-600'}`}>Submitted</Text>
          <View className={`ml-2 px-2 py-0.5 rounded-full ${activeTab === 'submitted' ? 'bg-white/20' : 'bg-teal-50'}`}>
            <Text className={`text-xs font-bold ${activeTab === 'submitted' ? 'text-white' : 'text-teal-700'}`}>{submittedCount}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('notsubmitted')}
          className={`px-4 py-2 rounded-full border flex-row items-center ${activeTab === 'notsubmitted' ? 'bg-rose-600 border-rose-600' : 'bg-white border-slate-200'}`}
        >
          <View className={`w-2 h-2 rounded-full mr-2 ${activeTab === 'notsubmitted' ? 'bg-white' : 'bg-rose-500'}`} />
          <Text className={`font-bold text-sm ${activeTab === 'notsubmitted' ? 'text-white' : 'text-slate-600'}`}>Not Submitted Yet</Text>
          <View className={`ml-2 px-2 py-0.5 rounded-full ${activeTab === 'notsubmitted' ? 'bg-white/20' : 'bg-rose-50'}`}>
            <Text className={`text-xs font-bold ${activeTab === 'notsubmitted' ? 'text-white' : 'text-rose-700'}`}>{notSubmittedCount}</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      {activeTab === 'notloggedin' && (
        <View className="mb-4">
          <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Filter by phone number</Text>
          <View className="flex-row bg-slate-100 rounded-2xl p-1 self-start">
            <TouchableOpacity
              onPress={() => setNotLoggedInPhoneFilter('all')}
              className={`px-3.5 py-2 rounded-xl ${notLoggedInPhoneFilter === 'all' ? 'bg-white shadow-sm' : ''}`}
            >
              <Text className={`text-xs font-bold ${notLoggedInPhoneFilter === 'all' ? 'text-slate-900' : 'text-slate-500'}`}>
                All ({notLoggedInCount})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setNotLoggedInPhoneFilter('has_number')}
              className={`px-3.5 py-2 rounded-xl ${notLoggedInPhoneFilter === 'has_number' ? 'bg-white shadow-sm' : ''}`}
            >
              <Text className={`text-xs font-bold ${notLoggedInPhoneFilter === 'has_number' ? 'text-slate-900' : 'text-slate-500'}`}>
                Has Number ({notLoggedInWithNumberCount})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setNotLoggedInPhoneFilter('no_number')}
              className={`px-3.5 py-2 rounded-xl ${notLoggedInPhoneFilter === 'no_number' ? 'bg-white shadow-sm' : ''}`}
            >
              <Text className={`text-xs font-bold ${notLoggedInPhoneFilter === 'no_number' ? 'text-slate-900' : 'text-slate-500'}`}>
                No Number ({notLoggedInNoNumberCount})
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

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
                  <Text className="w-36 font-bold text-slate-500 text-xs uppercase text-center">Submissions</Text>
                  {(activeTab === 'notloggedin' || activeTab === 'notsubmitted') && (
                    <Text className="w-40 font-bold text-slate-500 text-xs uppercase text-right">Reminder</Text>
                  )}
                </View>
              )}
              
              {filteredUsers.length === 0 && (
                <View className="py-12 items-center">
                  <Text className="text-slate-500 font-medium">
                    {searchQuery
                      ? `No foremen match "${searchQuery}".`
                      : activeTab === 'loggedin'
                      ? 'No foremen are currently logged in.'
                      : activeTab === 'notloggedin' && notLoggedInPhoneFilter === 'has_number'
                      ? 'None of the not-logged-in foremen have a saved number.'
                      : activeTab === 'notloggedin' && notLoggedInPhoneFilter === 'no_number'
                      ? 'All not-logged-in foremen have a saved number.'
                      : activeTab === 'notloggedin'
                      ? 'Everyone has logged in at least once.'
                      : activeTab === 'submitted'
                      ? 'No foremen have submitted anything yet.'
                      : activeTab === 'notsubmitted'
                      ? 'Everyone has submitted at least one entry.'
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
                          {!!u.away_reason && (
                            <View className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border-2 border-white" />
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
                      <View className="flex-row justify-between mb-3">
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

                    {isMobile && (
                      everSubmittedIds.has(u.id) ? (
                        <View className="self-start px-2.5 py-1 rounded-full bg-green-50 border border-green-200">
                          <Text className="text-[10px] font-bold uppercase tracking-wider text-green-700">Submitted</Text>
                        </View>
                      ) : (
                        <View className="self-start px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200">
                          <Text className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Not Yet Submitted</Text>
                        </View>
                      )
                    )}

                    {isMobile && activeTab === 'notloggedin' && !!u.phone_number && (
                      <TouchableOpacity
                        onPress={(e) => { e.stopPropagation(); sendLoginReminder(u); }}
                        className="flex-row items-center justify-center mt-3 py-2.5 rounded-lg border border-green-200 bg-green-50 active:bg-green-100"
                      >
                        <MessageCircle size={16} color="#16a34a" />
                        <Text className="text-green-700 font-bold ml-2 text-sm">Send Login Reminder</Text>
                      </TouchableOpacity>
                    )}

                    {isMobile && activeTab === 'notsubmitted' && !!u.phone_number && (
                      <TouchableOpacity
                        onPress={(e) => { e.stopPropagation(); sendSubmissionReminder(u); }}
                        className="flex-row items-center justify-center mt-3 py-2.5 rounded-lg border border-rose-200 bg-rose-50 active:bg-rose-100"
                      >
                        <MessageCircle size={16} color="#e11d48" />
                        <Text className="text-rose-700 font-bold ml-2 text-sm">Send Submission Reminder</Text>
                      </TouchableOpacity>
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

                    {!isMobile && (
                      <View className="w-36 items-center">
                        {everSubmittedIds.has(u.id) ? (
                          <View className="px-2.5 py-1 rounded-full bg-green-50 border border-green-200">
                            <Text className="text-[10px] font-bold uppercase tracking-wider text-green-700">Submitted</Text>
                          </View>
                        ) : (
                          <View className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200">
                            <Text className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Not Yet Submitted</Text>
                          </View>
                        )}
                      </View>
                    )}

                    {!isMobile && activeTab === 'notloggedin' && (
                      <View className="w-40 items-end">
                        {!!u.phone_number && (
                          <TouchableOpacity
                            onPress={(e) => { e.stopPropagation(); sendLoginReminder(u); }}
                            className="flex-row items-center px-3 py-2 rounded-lg border border-green-200 bg-green-50 active:bg-green-100"
                          >
                            <MessageCircle size={14} color="#16a34a" />
                            <Text className="text-green-700 font-bold ml-1.5 text-xs">Remind</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {!isMobile && activeTab === 'notsubmitted' && (
                      <View className="w-40 items-end">
                        {!!u.phone_number && (
                          <TouchableOpacity
                            onPress={(e) => { e.stopPropagation(); sendSubmissionReminder(u); }}
                            className="flex-row items-center px-3 py-2 rounded-lg border border-rose-200 bg-rose-50 active:bg-rose-100"
                          >
                            <MessageCircle size={14} color="#e11d48" />
                            <Text className="text-rose-700 font-bold ml-1.5 text-xs">Remind</Text>
                          </TouchableOpacity>
                        )}
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
        <View className={`flex-1 bg-black/50 justify-center items-center ${isMobile ? "p-4" : "p-8"}`}>
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
        <View className={`flex-1 bg-black/50 justify-center items-center ${isMobile ? "p-4" : "p-8"}`}>
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

            <TouchableOpacity
              onPress={() => {
                const user = selectedUser;
                setSelectedUser(null);
                router.push({ pathname: '/(admin)/foremen', params: { userId: user.id, name: user.full_name } });
              }}
              className="flex-row items-center justify-center mb-3 py-3.5 rounded-lg border border-indigo-200 bg-indigo-50 active:bg-indigo-100"
            >
              <FileText size={18} color="#4338ca" />
              <Text className="text-indigo-700 font-bold ml-2">View Submission History</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => selectedUser && openLoginHistory(selectedUser)}
              className="flex-row items-center justify-center mb-6 py-3.5 rounded-lg border border-blue-200 bg-blue-50 active:bg-blue-100"
            >
              <Clock size={18} color="#1d4ed8" />
              <Text className="text-blue-700 font-bold ml-2">View Login History</Text>
            </TouchableOpacity>

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
              {!!selectedUser?.phone_number && (
                <TouchableOpacity
                  onPress={() => openWhatsApp(selectedUser.phone_number)}
                  className="flex-row items-center justify-center mt-3 py-3 rounded-lg border border-green-200 bg-green-50 active:bg-green-100"
                >
                  <MessageCircle size={18} color="#16a34a" />
                  <Text className="text-green-700 font-bold ml-2">Message on WhatsApp</Text>
                </TouchableOpacity>
              )}
            </View>

            <View className="mb-6">
              <Text className="text-sm font-bold text-slate-700 mb-1">Away / Absence Reason</Text>
              <Text className="text-slate-400 text-xs mb-2">
                Set this when the foreman tells you they're unavailable (e.g. gone to native place). Shows a red dot on the list. Clear it and Save when they're back.
              </Text>
              <View className="w-full bg-slate-50 border border-slate-200 rounded-lg flex-row items-start px-4 py-3">
                <AlertCircle size={16} color="#94a3b8" style={{ marginTop: 12 }} />
                <TextInput
                  placeholder="e.g. Gone to native place, back on 20th"
                  placeholderTextColor="#94a3b8"
                  value={editAwayReason}
                  onChangeText={setEditAwayReason}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  className="flex-1 p-2 ml-2 text-slate-900"
                  style={{ minHeight: 60 }}
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

            <View className="mt-6 pt-5 border-t border-slate-100">
              <TouchableOpacity
                onPress={() => selectedUser && setDeleteConfirmUser(selectedUser)}
                className="flex-row items-center justify-center py-3.5 rounded-lg border border-red-200 bg-red-50 active:bg-red-100"
              >
                <Trash2 size={18} color="#dc2626" />
                <Text className="text-red-700 font-bold ml-2">Delete Foreman</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal visible={!!deleteConfirmUser} transparent animationType="fade" onRequestClose={() => setDeleteConfirmUser(null)}>
        <View className="flex-1 bg-black/50 justify-center items-center p-8">
          <View className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl items-center">
            <View className="bg-red-100 p-4 rounded-full mb-4">
              <Trash2 size={32} color="#ef4444" />
            </View>
            <Text className="text-xl font-black text-slate-900 mb-2 text-center">Delete {deleteConfirmUser?.full_name}?</Text>
            <Text className="text-slate-500 text-center mb-6">
              They'll be moved to Trash and won't be able to log in until restored. You can undo this anytime from Trash.
            </Text>
            <View className="flex-row gap-3 w-full">
              <TouchableOpacity
                onPress={() => setDeleteConfirmUser(null)}
                disabled={deletingForeman}
                className="flex-1 bg-slate-100 border border-slate-200 py-3 rounded-xl items-center active:bg-slate-200"
              >
                <Text className="text-slate-700 font-bold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmDeleteForeman}
                disabled={deletingForeman}
                className={`flex-1 ${deletingForeman ? 'bg-red-400' : 'bg-red-500'} py-3 rounded-xl items-center flex-row justify-center active:bg-red-600`}
              >
                {deletingForeman ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-white font-bold">Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Trash Modal */}
      <Modal visible={trashModalVisible} transparent animationType="slide" onRequestClose={() => setTrashModalVisible(false)}>
        <View className="flex-1 bg-slate-900/60 justify-end">
          <View className="bg-white rounded-t-[32px] p-6 h-[80%]">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-2xl font-black text-slate-900">Trash</Text>
              <TouchableOpacity onPress={() => setTrashModalVisible(false)} className="bg-slate-100 p-2 rounded-full active:bg-slate-200">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text className="text-slate-500 font-medium mb-4">Deleted foremen can't log in until restored.</Text>

            {trashLoading ? (
              <View className="flex-1 justify-center items-center">
                <ActivityIndicator size="large" color="#0f172a" />
              </View>
            ) : trashList.length === 0 ? (
              <View className="py-16 items-center">
                <Text className="text-slate-500 font-medium">Trash is empty.</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                {trashList.map((u) => {
                  const username = u.email ? u.email.split('@')[0] : 'unknown';
                  return (
                    <View key={u.id} className="flex-row items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50 mb-3">
                      <View className="flex-1 pr-3">
                        <Text className="text-slate-900 font-bold">{u.full_name}</Text>
                        <Text className="text-slate-500 text-sm">{username}</Text>
                        {!!u.deleted_at && (
                          <Text className="text-slate-400 text-xs mt-1">Deleted {new Date(u.deleted_at).toLocaleDateString()}</Text>
                        )}
                      </View>
                      <TouchableOpacity
                        onPress={() => handleRestoreForeman(u)}
                        disabled={restoringId === u.id}
                        className={`flex-row items-center px-3.5 py-2.5 rounded-lg border border-green-200 bg-green-50 active:bg-green-100 ${restoringId === u.id ? 'opacity-70' : ''}`}
                      >
                        {restoringId === u.id ? (
                          <ActivityIndicator size="small" color="#16a34a" />
                        ) : (
                          <>
                            <RotateCcw size={16} color="#16a34a" />
                            <Text className="text-green-700 font-bold ml-1.5 text-sm">Restore</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Login History Modal */}
      <Modal visible={loginHistoryVisible} transparent animationType="slide" onRequestClose={() => setLoginHistoryVisible(false)}>
        <View className="flex-1 bg-slate-900/60 justify-end">
          <View className="bg-white rounded-t-[32px] p-6 h-[80%]">
            <View className="flex-row justify-between items-center mb-2">
              <View className="flex-1 pr-2">
                <Text className="text-2xl font-black text-slate-900">{loginHistoryUser?.full_name}</Text>
                <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider">Login / Logout History</Text>
              </View>
              <TouchableOpacity onPress={() => setLoginHistoryVisible(false)} className="bg-slate-100 p-2 rounded-full active:bg-slate-200">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {loginHistoryLoading ? (
              <View className="flex-1 justify-center items-center">
                <ActivityIndicator size="large" color="#0f172a" />
              </View>
            ) : loginHistoryList.length === 0 ? (
              <View className="py-16 items-center">
                <Text className="text-slate-500 font-medium">No login activity yet.</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40, paddingTop: 12 }}>
                {(() => {
                  const today = new Date();
                  const yesterday = new Date(today);
                  yesterday.setDate(yesterday.getDate() - 1);

                  const groupedByDate: Record<string, any[]> = {};
                  loginHistoryList.forEach((log: any) => {
                    const dateObj = new Date(log.created_at);
                    let dateLabel = '';
                    if (dateObj.toDateString() === today.toDateString()) {
                      dateLabel = 'Today';
                    } else if (dateObj.toDateString() === yesterday.toDateString()) {
                      dateLabel = 'Yesterday';
                    } else {
                      dateLabel = dateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                    }
                    if (!groupedByDate[dateLabel]) groupedByDate[dateLabel] = [];
                    groupedByDate[dateLabel].push(log);
                  });

                  return Object.entries(groupedByDate).map(([dateLabel, logsForDate]) => (
                    <View key={dateLabel} className="mb-6">
                      <Text className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-3 px-1">{dateLabel}</Text>
                      <View className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                        {logsForDate.map((log, idx) => {
                          const dObj = new Date(log.created_at);
                          const isLogLogin = log.action === 'LOGIN';
                          return (
                            <View key={`${log.created_at}-${idx}`} className={`p-4 flex-row items-center justify-between ${idx !== logsForDate.length - 1 ? 'border-b border-slate-100' : ''}`}>
                              <View className="flex-row items-center">
                                <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${isLogLogin ? 'bg-green-100' : 'bg-red-100'}`}>
                                  {isLogLogin ? <LogIn size={18} color="#16a34a" /> : <LogOut size={18} color="#dc2626" />}
                                </View>
                                <View>
                                  <Text className="text-slate-900 font-bold text-base">{isLogLogin ? 'Logged In' : 'Logged Out'}</Text>
                                  <Text className="text-slate-500 text-sm mt-0.5">{dObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                </View>
                              </View>
                              <Text className={`font-black text-xs uppercase tracking-wider ${isLogLogin ? 'text-green-600' : 'text-red-600'}`}>
                                {log.action}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  ));
                })()}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}
