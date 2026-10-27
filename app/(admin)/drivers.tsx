import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal, useWindowDimensions } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Truck, Plus, X, User, Eye, EyeOff, Search, Check, KeyRound, FileText, Clock } from 'lucide-react-native';
import { FadeInUp } from '../../components/Animations';

const COMPANY_LABELS: Record<string, string> = { IST: 'IST', JAH: 'JAH', HYDRO: 'Hydro' };

export default function DriversScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [loading, setLoading] = useState(true);
  const [driversList, setDriversList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'nologin' | 'loggedin' | 'notloggedin' | 'submitted' | 'notsubmitted'>('all');

  // Same signal the Foreman screen uses: most recent attendance_logs row per
  // user with no LOGOUT after it means "currently logged in"; appearing in
  // the log at all (regardless of current state) means "has used the app".
  const [loggedInIds, setLoggedInIds] = useState<Set<string>>(new Set());
  const [everLoggedInIds, setEverLoggedInIds] = useState<Set<string>>(new Set());
  const [everSubmittedIds, setEverSubmittedIds] = useState<Set<string>>(new Set());

  // Create-login modal
  const [loginModalDriver, setLoginModalDriver] = useState<any>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New-driver modal -- adds straight to the same internal_vehicle_drivers list
  // Master Data manages, so it shows up there too, not just here.
  const [addDriverModal, setAddDriverModal] = useState(false);
  const [newDriverForm, setNewDriverForm] = useState({ name: '', company: 'IST' as 'IST' | 'JAH' | 'HYDRO' });
  const [isAddingDriver, setIsAddingDriver] = useState(false);

  // Driver details modal (opened by tapping a row) + its two drill-downs,
  // same pattern as the Foreman screen's user details modal.
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [loginHistoryVisible, setLoginHistoryVisible] = useState(false);
  const [loginHistoryList, setLoginHistoryList] = useState<any[]>([]);
  const [loginHistoryLoading, setLoginHistoryLoading] = useState(false);
  const [submissionHistoryVisible, setSubmissionHistoryVisible] = useState(false);
  const [submissionHistoryList, setSubmissionHistoryList] = useState<any[]>([]);
  const [submissionHistoryLoading, setSubmissionHistoryLoading] = useState(false);

  useEffect(() => {
    fetchDrivers();
    fetchLoginStatus();
    fetchSubmissionStatus();
  }, []);

  const fetchDrivers = async () => {
    setLoading(true);
    try {
      // internal_vehicle_drivers.user_id links a Master Data driver record to its
      // Supabase Auth login, once an admin creates one -- the embedded `users`
      // select pulls that account's email (for the username) in the same query.
      const { data, error } = await supabase
        .from('internal_vehicle_drivers')
        .select('id, name, company, is_active, user_id, users(email)')
        .order('name');
      if (error) throw error;
      setDriversList(data || []);
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', 'Failed to fetch drivers');
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
      const { data, error } = await supabase.from('internal_vehicle_entries').select('created_by');
      if (error) throw error;
      const submitted = new Set<string>();
      (data || []).forEach((row: any) => {
        if (row.created_by) submitted.add(row.created_by);
      });
      setEverSubmittedIds(submitted);
    } catch (error) {
      console.error('Error fetching submission status:', error);
    }
  };

  const openLoginModal = (driver: any) => {
    setLoginModalDriver(driver);
    setLoginForm({ username: '', password: '' });
    setShowPassword(false);
  };

  const handleAddDriver = async () => {
    if (!newDriverForm.name.trim()) {
      Alert.alert('Validation', 'Please enter a name.');
      return;
    }
    setIsAddingDriver(true);
    try {
      const { error } = await supabase.from('internal_vehicle_drivers').insert({
        name: newDriverForm.name.trim(),
        company: newDriverForm.company,
        is_active: true,
      });
      if (error) throw error;
      setAddDriverModal(false);
      setNewDriverForm({ name: '', company: 'IST' });
      fetchDrivers();
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', error.message || 'Could not add driver');
    } finally {
      setIsAddingDriver(false);
    }
  };

  const openLoginHistory = async (driver: any) => {
    if (!driver.user_id) return;
    setLoginHistoryVisible(true);
    setLoginHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('action, created_at')
        .eq('user_id', driver.user_id)
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

  const openSubmissionHistory = async (driver: any) => {
    if (!driver.user_id) return;
    setSubmissionHistoryVisible(true);
    setSubmissionHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('internal_vehicle_entries')
        .select('entry_date, status, jobs(job_number, job_name)')
        .eq('created_by', driver.user_id)
        .order('entry_date', { ascending: false });
      if (error) throw error;
      setSubmissionHistoryList(data || []);
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', 'Failed to load submission history');
    } finally {
      setSubmissionHistoryLoading(false);
    }
  };

  const handleCreateLogin = async () => {
    if (!loginModalDriver) return;
    if (!loginForm.username || !loginForm.password) {
      Alert.alert('Validation', 'Please fill in username and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const pseudoEmail = `${loginForm.username.toLowerCase().trim()}@islandtower.local`;
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !anonKey) {
        throw new Error('Supabase configuration missing');
      }

      // Same direct GoTrue signup call the Foreman screen uses, so creating a
      // driver's login doesn't log the admin out of their own session.
      const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
        },
        body: JSON.stringify({
          email: pseudoEmail,
          password: loginForm.password,
          data: {
            full_name: loginModalDriver.name,
            role: 'DRIVER',
          },
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.msg || result.error_description || 'Failed to create login');
      }

      // The signup response's shape (a bare user object vs. a session wrapping one
      // under .user) differs by Supabase project settings, so rather than guessing
      // which field holds the id, look the new account up by its email in `users`
      // -- the same row the signup trigger always populates and everything else in
      // the app already relies on, so this is the one place guaranteed correct.
      const { data: newUserRow, error: userLookupError } = await supabase
        .from('users')
        .select('id')
        .eq('email', pseudoEmail)
        .maybeSingle();
      if (userLookupError || !newUserRow) {
        throw new Error('Login account was created, but the new account could not be found to link it. Please try again.');
      }
      const newUserId = newUserRow.id;

      // .select() is required here, not cosmetic -- Supabase's update() returns no
      // error when the filter matches zero rows (only an empty data array), so
      // without it a failed link would silently report "Success" while the
      // driver record was never actually connected to the new login.
      const { data: linkedRows, error: linkError } = await supabase
        .from('internal_vehicle_drivers')
        .update({ user_id: newUserId })
        .eq('id', loginModalDriver.id)
        .select('id');
      if (linkError) throw linkError;
      if (!linkedRows || linkedRows.length === 0) {
        throw new Error('Login account was created, but it could not be linked to this driver record. Please try again or contact support.');
      }

      Alert.alert('Success', `Login created for ${loginModalDriver.name}.`);
      setLoginModalDriver(null);
      fetchDrivers();
      fetchLoginStatus();
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', error.message || 'Could not create login');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasLogin = (d: any) => !!d.user_id;
  const loggedInCount = driversList.filter((d) => hasLogin(d) && loggedInIds.has(d.user_id)).length;
  const notLoggedInCount = driversList.filter((d) => hasLogin(d) && !everLoggedInIds.has(d.user_id)).length;
  const submittedCount = driversList.filter((d) => hasLogin(d) && everSubmittedIds.has(d.user_id)).length;
  const notSubmittedCount = driversList.filter((d) => hasLogin(d) && !everSubmittedIds.has(d.user_id)).length;
  const noLoginCount = driversList.filter((d) => !hasLogin(d)).length;

  const filteredDrivers = driversList.filter((d) => {
    if (activeTab === 'nologin' && hasLogin(d)) return false;
    if (activeTab === 'loggedin' && (!hasLogin(d) || !loggedInIds.has(d.user_id))) return false;
    if (activeTab === 'notloggedin' && (!hasLogin(d) || everLoggedInIds.has(d.user_id))) return false;
    if (activeTab === 'submitted' && (!hasLogin(d) || !everSubmittedIds.has(d.user_id))) return false;
    if (activeTab === 'notsubmitted' && (!hasLogin(d) || everSubmittedIds.has(d.user_id))) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    const username = d.users?.email ? d.users.email.split('@')[0] : '';
    return (d.name || '').toLowerCase().includes(q) || username.toLowerCase().includes(q);
  });

  const TABS: { key: typeof activeTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: driversList.length },
    { key: 'nologin', label: 'No Login', count: noLoginCount },
    { key: 'loggedin', label: 'Logged In', count: loggedInCount },
    { key: 'notloggedin', label: 'Not Logged In', count: notLoggedInCount },
    { key: 'submitted', label: 'Submitted', count: submittedCount },
    { key: 'notsubmitted', label: 'Not Submitted Yet', count: notSubmittedCount },
  ];

  return (
    <FadeInUp style={{ flex: 1 }}>
    <View className={`flex-1 bg-slate-50 ${isMobile ? 'p-4' : 'p-8'}`}>
      <View className={`justify-between items-center mb-6 ${isMobile ? 'flex-col items-stretch gap-y-4' : 'flex-row'}`}>
        <View>
          <View className="flex-row items-center flex-wrap">
            <Text className={`text-slate-900 font-black tracking-tight mr-3 ${isMobile ? 'text-2xl' : 'text-3xl'}`}>Drivers</Text>
            <View className="bg-violet-100 px-3 py-1 rounded-full border border-violet-200">
              <Text className="text-violet-700 font-bold text-xs">{driversList.length} Total</Text>
            </View>
          </View>
          <Text className="text-slate-500 mt-1">Create logins for drivers from the Drivers / Operators list, and track their access.</Text>
        </View>
        <TouchableOpacity
          onPress={() => setAddDriverModal(true)}
          className={`bg-[#6d28d9] px-5 py-3 rounded-xl flex-row items-center active:opacity-80 ${isMobile ? 'justify-center' : ''}`}
        >
          <Plus size={20} color="#fff" />
          <Text className="text-white font-bold ml-2">New Driver</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: isMobile ? 16 : 0 }}
        style={{ flexGrow: 0, marginBottom: 16 }}
      >
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-full border flex-row items-center ${activeTab === tab.key ? 'bg-[#6d28d9] border-[#6d28d9]' : 'bg-white border-slate-200'}`}
          >
            <Text className={`font-bold text-sm ${activeTab === tab.key ? 'text-white' : 'text-slate-600'}`}>{tab.label}</Text>
            <View className={`ml-2 px-2 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-white/20' : 'bg-slate-100'}`}>
              <Text className={`font-bold text-xs ${activeTab === tab.key ? 'text-white' : 'text-slate-600'}`}>{tab.count}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View className="flex-row items-center bg-white border border-slate-200 rounded-xl px-4 h-12 mb-4">
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
                  <Text className="flex-1 font-bold text-slate-500 text-xs uppercase">Name</Text>
                  <Text className="flex-1 font-bold text-slate-500 text-xs uppercase">Company</Text>
                  <Text className="flex-1 font-bold text-slate-500 text-xs uppercase">Username</Text>
                  <Text className="w-36 font-bold text-slate-500 text-xs uppercase text-center">Status</Text>
                  <Text className="w-40 font-bold text-slate-500 text-xs uppercase text-right">Login</Text>
                </View>
              )}

              {filteredDrivers.length === 0 && (
                <View className="py-12 items-center">
                  <Text className="text-slate-500 font-medium">
                    {searchQuery
                      ? `No drivers match "${searchQuery}".`
                      : activeTab === 'nologin'
                      ? 'Every driver already has a login.'
                      : activeTab === 'loggedin'
                      ? 'No drivers are currently logged in.'
                      : activeTab === 'notloggedin'
                      ? 'Everyone with a login has used it at least once.'
                      : activeTab === 'submitted'
                      ? 'No drivers have submitted anything yet.'
                      : activeTab === 'notsubmitted'
                      ? 'Everyone with a login has submitted at least one entry.'
                      : 'No drivers found. Add them under Master Data → Drivers / Operators first.'}
                  </Text>
                </View>
              )}

              {filteredDrivers.map((d) => {
                const username = d.users?.email ? d.users.email.split('@')[0] : null;
                const driverHasLogin = hasLogin(d);

                return (
                  <TouchableOpacity
                    key={d.id}
                    activeOpacity={0.7}
                    onPress={() => setSelectedDriver(d)}
                    className={`${isMobile ? 'bg-white mb-3 p-4 rounded-xl shadow-sm border border-slate-100 flex-col' : 'flex-row items-center p-4 border-b border-slate-100'}`}
                  >
                    <View className={`${isMobile ? 'mb-3 flex-row items-center justify-between' : 'flex-1 flex-row items-center pr-2'}`}>
                      <View className="flex-row items-center flex-1">
                        <View className="relative mr-3">
                          <View className="w-8 h-8 rounded-full items-center justify-center bg-violet-100">
                            <User size={14} color="#6d28d9" />
                          </View>
                          {driverHasLogin && loggedInIds.has(d.user_id) && (
                            <View className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-white" />
                          )}
                        </View>
                        <Text className="text-slate-900 font-bold flex-1" numberOfLines={1} ellipsizeMode="tail">{d.name}</Text>
                      </View>
                    </View>

                    {!isMobile && (
                      <Text className="flex-1 text-slate-600">{COMPANY_LABELS[d.company] || d.company || 'N/A'}</Text>
                    )}
                    {!isMobile && <Text className="flex-1 text-slate-600">{username || '—'}</Text>}

                    {isMobile && (
                      <View className="flex-row justify-between mb-3">
                        <View>
                          <Text className="text-xs font-bold text-slate-400 mb-1 uppercase">Company</Text>
                          <Text className="text-slate-600">{COMPANY_LABELS[d.company] || d.company || 'N/A'}</Text>
                        </View>
                        <View>
                          <Text className="text-xs font-bold text-slate-400 mb-1 uppercase text-right">Username</Text>
                          <Text className="text-slate-600 text-right">{username || '—'}</Text>
                        </View>
                      </View>
                    )}

                    <View className={isMobile ? 'mb-3 self-start' : 'w-36 items-center'}>
                      {!driverHasLogin ? (
                        <View className="px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200">
                          <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-500">No Login</Text>
                        </View>
                      ) : everSubmittedIds.has(d.user_id) ? (
                        <View className="px-2.5 py-1 rounded-full bg-green-50 border border-green-200">
                          <Text className="text-[10px] font-bold uppercase tracking-wider text-green-700">Submitted</Text>
                        </View>
                      ) : (
                        <View className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200">
                          <Text className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Not Yet Submitted</Text>
                        </View>
                      )}
                    </View>

                    <View className={isMobile ? '' : 'w-40 items-end'}>
                      {driverHasLogin ? (
                        <Text className="text-slate-400 text-xs text-right">
                          {everLoggedInIds.has(d.user_id) ? (loggedInIds.has(d.user_id) ? 'Signed in now' : 'Has logged in') : 'Never logged in'}
                        </Text>
                      ) : (
                        <TouchableOpacity
                          onPress={(e) => { e.stopPropagation(); openLoginModal(d); }}
                          className={`flex-row items-center justify-center px-3 py-2 rounded-lg bg-[#6d28d9] active:opacity-80 ${isMobile ? 'w-full' : ''}`}
                        >
                          <KeyRound size={14} color="#fff" />
                          <Text className="text-white font-bold ml-1.5 text-xs">Create Login</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Driver Details Modal -- opened by tapping a row, same pattern as Foreman */}
      <Modal visible={!!selectedDriver} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl">
            <View className="flex-row justify-between items-center mb-1">
              <View className="flex-1 pr-3">
                <Text className="text-xl font-bold text-slate-900" numberOfLines={2}>{selectedDriver?.name}</Text>
                {hasLogin(selectedDriver || {}) && (
                  <Text className="text-slate-500">{selectedDriver?.users?.email?.split('@')[0]}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setSelectedDriver(null)} className="p-2 bg-slate-100 rounded-full active:opacity-60">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View className="flex-row justify-between my-5">
              <View className="flex-1">
                <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Company</Text>
                <Text className="text-slate-900 font-bold">{COMPANY_LABELS[selectedDriver?.company] || selectedDriver?.company || 'N/A'}</Text>
              </View>
              <View className="flex-1 ml-2">
                <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Role</Text>
                <Text className="text-slate-900 font-bold">{hasLogin(selectedDriver || {}) ? 'DRIVER' : 'No Login'}</Text>
              </View>
            </View>

            {hasLogin(selectedDriver || {}) ? (
              <>
                <TouchableOpacity
                  onPress={() => openSubmissionHistory(selectedDriver)}
                  className="flex-row items-center justify-center mb-3 py-3.5 rounded-lg border border-violet-200 bg-violet-50 active:bg-violet-100"
                >
                  <FileText size={18} color="#6d28d9" />
                  <Text className="text-violet-700 font-bold ml-2">View Submission History</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => openLoginHistory(selectedDriver)}
                  className="flex-row items-center justify-center py-3.5 rounded-lg border border-blue-200 bg-blue-50 active:bg-blue-100"
                >
                  <Clock size={18} color="#1d4ed8" />
                  <Text className="text-blue-700 font-bold ml-2">View Login History</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                onPress={() => { const d = selectedDriver; setSelectedDriver(null); openLoginModal(d); }}
                className="flex-row items-center justify-center py-3.5 rounded-lg bg-[#6d28d9] active:opacity-80"
              >
                <KeyRound size={18} color="#fff" />
                <Text className="text-white font-bold ml-2">Create Login</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Login History Modal */}
      <Modal visible={loginHistoryVisible} transparent animationType="fade" onRequestClose={() => setLoginHistoryVisible(false)}>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl" style={{ maxHeight: '75%' }}>
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xl font-bold text-slate-900">Login History</Text>
              <TouchableOpacity onPress={() => setLoginHistoryVisible(false)} className="p-2 bg-slate-100 rounded-full active:opacity-60">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            {loginHistoryLoading ? (
              <ActivityIndicator size="large" color="#6d28d9" />
            ) : loginHistoryList.length === 0 ? (
              <Text className="text-slate-500 text-center py-6">No login activity yet.</Text>
            ) : (
              <ScrollView>
                {loginHistoryList.map((log, idx) => (
                  <View key={idx} className="flex-row items-center justify-between py-3 border-b border-slate-100">
                    <View className={`px-2.5 py-1 rounded-full ${log.action === 'LOGIN' ? 'bg-green-50 border border-green-200' : 'bg-slate-100 border border-slate-200'}`}>
                      <Text className={`text-[10px] font-bold uppercase ${log.action === 'LOGIN' ? 'text-green-700' : 'text-slate-500'}`}>{log.action}</Text>
                    </View>
                    <Text className="text-slate-600 text-sm">{new Date(log.created_at).toLocaleString()}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Submission History Modal */}
      <Modal visible={submissionHistoryVisible} transparent animationType="fade" onRequestClose={() => setSubmissionHistoryVisible(false)}>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl" style={{ maxHeight: '75%' }}>
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xl font-bold text-slate-900">Submission History</Text>
              <TouchableOpacity onPress={() => setSubmissionHistoryVisible(false)} className="p-2 bg-slate-100 rounded-full active:opacity-60">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            {submissionHistoryLoading ? (
              <ActivityIndicator size="large" color="#6d28d9" />
            ) : submissionHistoryList.length === 0 ? (
              <Text className="text-slate-500 text-center py-6">No Internal Vehicle entries submitted yet.</Text>
            ) : (
              <ScrollView>
                {submissionHistoryList.map((entry, idx) => (
                  <View key={idx} className="py-3 border-b border-slate-100">
                    <View className="flex-row justify-between items-center mb-1">
                      <Text className="text-slate-900 font-bold">{entry.entry_date}</Text>
                      <View className={`px-2 py-0.5 rounded-full ${entry.status === 'APPROVED' ? 'bg-green-50 border border-green-200' : entry.status === 'REJECTED' ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`}>
                        <Text className={`text-[10px] font-bold uppercase ${entry.status === 'APPROVED' ? 'text-green-700' : entry.status === 'REJECTED' ? 'text-red-700' : 'text-amber-700'}`}>{entry.status}</Text>
                      </View>
                    </View>
                    <Text className="text-slate-500 text-sm">{entry.jobs?.job_number ? `${entry.jobs.job_number} - ${entry.jobs.job_name}` : 'Unknown Site'}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Create Login Modal */}
      <Modal visible={!!loginModalDriver} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-xl font-bold text-slate-900">Create Driver Login</Text>
              <TouchableOpacity onPress={() => setLoginModalDriver(null)} className="p-2 bg-slate-100 rounded-full active:opacity-60">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text className="text-slate-500 mb-5">{loginModalDriver?.name}</Text>

            <Text className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-1.5">Username</Text>
            <TextInput
              value={loginForm.username}
              onChangeText={(t) => setLoginForm(prev => ({ ...prev, username: t }))}
              placeholder="e.g. driver_abdul"
              autoCapitalize="none"
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-slate-900 font-semibold mb-4"
            />

            <Text className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-1.5">Password</Text>
            <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-4 mb-6">
              <TextInput
                value={loginForm.password}
                onChangeText={(t) => setLoginForm(prev => ({ ...prev, password: t }))}
                placeholder="Set a password"
                secureTextEntry={!showPassword}
                className="flex-1 py-3.5 text-slate-900 font-semibold"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} className="p-1">
                {showPassword ? <EyeOff size={18} color="#94a3b8" /> : <Eye size={18} color="#94a3b8" />}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleCreateLogin}
              disabled={isSubmitting}
              className={`w-full py-4 rounded-2xl flex-row items-center justify-center ${isSubmitting ? 'bg-violet-300' : 'bg-[#6d28d9] active:bg-[#5b21b6]'}`}
            >
              {isSubmitting ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Check size={18} color="#fff" />
                  <Text className="text-white font-bold text-lg ml-2">Create Login</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* New Driver Modal */}
      <Modal visible={addDriverModal} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-slate-900">New Driver</Text>
              <TouchableOpacity onPress={() => setAddDriverModal(false)} className="p-2 bg-slate-100 rounded-full active:opacity-60">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-1.5">Name</Text>
            <TextInput
              value={newDriverForm.name}
              onChangeText={(t) => setNewDriverForm(prev => ({ ...prev, name: t }))}
              placeholder="e.g. Abdul Wakil"
              autoCapitalize="words"
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-slate-900 font-semibold mb-4"
            />

            <Text className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-1.5">Company</Text>
            <View className="flex-row bg-slate-100 p-1 rounded-xl mb-6">
              {(['IST', 'JAH', 'HYDRO'] as const).map((company) => (
                <TouchableOpacity
                  key={company}
                  onPress={() => setNewDriverForm(prev => ({ ...prev, company }))}
                  className={`flex-1 py-3 rounded-lg items-center ${newDriverForm.company === company ? 'bg-[#6d28d9]' : ''}`}
                >
                  <Text className={`font-bold text-sm ${newDriverForm.company === company ? 'text-white' : 'text-slate-500'}`}>
                    {COMPANY_LABELS[company]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              onPress={handleAddDriver}
              disabled={isAddingDriver}
              className={`w-full py-4 rounded-2xl flex-row items-center justify-center ${isAddingDriver ? 'bg-violet-300' : 'bg-[#6d28d9] active:bg-[#5b21b6]'}`}
            >
              {isAddingDriver ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Plus size={18} color="#fff" />
                  <Text className="text-white font-bold text-lg ml-2">Add Driver</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
    </FadeInUp>
  );
}
