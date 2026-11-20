import React, { useCallback, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StatusBar, ActivityIndicator, Platform, Modal, FlatList
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Check, Fuel, Calendar, ChevronDown, X, Search } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';
import { getLocalDateString } from '../../../lib/dateUtils';
import { fetchWithCache } from '../../../lib/dataCache';
import MessageModal, { MessageModalContent } from '../../../components/MessageModal';

const COMPANY_OPTIONS = [
  { label: 'IST', value: 'IST', fullName: 'Island Tower Electromechanical' },
  { label: 'JAH', value: 'JAH', fullName: 'Jazeerat Al Hadeed' },
  { label: 'Hydro', value: 'HYDRO', fullName: 'Hydro' },
];

const UNIT_OPTIONS = [
  { label: 'Liters', value: 'Liters' },
  { label: 'Gallons', value: 'Gallons' },
];

const PillToggle = ({ label, value, options, onSelect, required = false, error }: any) => (
  <View className="mb-4">
    <Text className="text-sm font-medium text-slate-700 mb-1">
      {label} {required && <Text className="text-red-500">*</Text>}
    </Text>
    <View className={`flex-row bg-slate-100 p-1 rounded-xl border ${error ? 'border-red-500' : 'border-transparent'}`}>
      {options.map((opt: any) => (
        <TouchableOpacity
          key={opt.value}
          onPress={() => onSelect(opt.value)}
          className={`flex-1 py-3 rounded-lg items-center ${value === opt.value ? 'bg-[#1d4ed8] shadow-sm' : ''}`}
        >
          <Text className={`font-bold text-sm ${value === opt.value ? 'text-white' : 'text-slate-500'}`}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
    {error ? <Text className="text-red-500 text-xs mt-1 ml-1">{error}</Text> : null}
  </View>
);

const CustomPicker = ({ label, value, options, onSelect, placeholder, required = false, error }: any) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = searchQuery.trim()
    ? options.filter((o: any) => o.label.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : options;

  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-slate-700 mb-1">
        {label} {required && <Text className="text-red-500">*</Text>}
      </Text>
      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        className={`bg-white border ${error ? 'border-red-500' : 'border-slate-300'} rounded-lg px-4 py-3.5 flex-row items-center justify-between active:opacity-70`}
      >
        <Text className={value ? 'text-slate-900' : 'text-slate-400'}>
          {value ? options.find((o: any) => o.value === value)?.label || placeholder : placeholder}
        </Text>
        <ChevronDown size={20} color={error ? '#ef4444' : '#64748b'} />
      </TouchableOpacity>
      {error ? <Text className="text-red-500 text-xs mt-1 ml-1">{error}</Text> : null}

      <Modal visible={modalVisible} transparent animationType="slide" onShow={() => setSearchQuery('')} onRequestClose={() => setModalVisible(false)}>
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-white rounded-t-3xl h-[75%] border-t border-slate-200 shadow-2xl">
            <View className="flex-row items-center justify-between p-5 border-b border-slate-100">
              <Text className="text-slate-900 text-lg font-black tracking-tight">Select {label}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} className="p-2 bg-slate-100 rounded-full active:opacity-60">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl mx-5 mt-4 mb-2 px-4 h-12">
              <Search size={18} color="#94a3b8" />
              <TextInput
                placeholder={`Search ${label.toLowerCase()}...`}
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
            {filteredOptions.length === 0 && (
              <View className="py-10 items-center">
                <Text className="text-slate-400 font-medium">No matches for "{searchQuery}"</Text>
              </View>
            )}
            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => { onSelect(item.value); setModalVisible(false); }}
                  className="flex-row items-center justify-between p-4 border-b border-slate-100 active:bg-slate-50"
                >
                  <Text className={`text-base ${value === item.value ? 'text-[#1d4ed8] font-bold tracking-tight' : 'text-slate-700 font-medium'}`}>
                    {item.label}
                  </Text>
                  {value === item.value && <Check size={20} color="#1d4ed8" />}
                </TouchableOpacity>
              )}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 40 }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default function FuelTopupRequestScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [messageModal, setMessageModal] = useState<MessageModalContent | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [allJobs, setAllJobs] = useState<any[]>([]);
  const [allVehicles, setAllVehicles] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    entry_date: getLocalDateString(),
    company: '',
    job_id: '',
    vehicle_id: '',
    quantity: '',
    unit: 'Liters',
    foreman_name: '',
    remarks: '',
  });

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const fetchData = async () => {
    setLoading(true);
    try {
      const [jobsRes, vehiclesRes, { data: { user } }] = await Promise.all([
        fetchWithCache('jobs', () => supabase.from('jobs').select('id, job_number, job_name, location, company').eq('is_active', true).order('job_number')),
        fetchWithCache('internal_vehicles', () => supabase.from('internal_vehicles').select('id, vehicle_number, vehicle_type, company').eq('is_active', true).order('vehicle_number')),
        supabase.auth.getUser(),
      ]);

      if (jobsRes.data) setAllJobs(jobsRes.data);
      if (vehiclesRes.data) setAllVehicles(vehiclesRes.data);

      if (user) {
        const { data: userData } = await supabase.from('users').select('full_name, email').eq('id', user.id).maybeSingle();
        if (userData) {
          let name = userData.full_name || '';
          if (name === 'New User' && userData.email) name = userData.email.split('@')[0];
          setFormData(prev => ({ ...prev, foreman_name: name }));
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setMessageModal({ title: 'Error', message: 'Failed to load form data.' });
    } finally {
      setLoading(false);
    }
  };

  const updateForm = (key: string, value: any) => {
    if (key === 'company') {
      // Jobs are tagged by company -- a previously picked job could belong to
      // a different one, so clear it rather than leave a stale, now-hidden
      // selection in place.
      setFormData(prev => ({ ...prev, company: value, job_id: '' }));
      if (errors.company) setErrors(prev => ({ ...prev, company: '' }));
      return;
    }
    setFormData(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
  };

  const jobs = allJobs
    .filter((j: any) => !formData.company || j.company === formData.company)
    .map((j: any) => ({ label: `${j.job_number} - ${j.job_name}`, value: j.id }));

  // Not filtered by company -- the internal vehicle fleet isn't scoped per
  // company either, matching how the Internal Vehicles entry form itself
  // lists them.
  const vehicles = allVehicles.map((v: any) => ({ label: `${v.vehicle_number} - ${v.vehicle_type}`, value: v.id }));
  const selectedVehicle = allVehicles.find((v: any) => v.id === formData.vehicle_id);

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};
    if (!formData.company) newErrors.company = 'Company is required';
    if (!formData.job_id) newErrors.job_id = 'Job is required';
    if (!formData.vehicle_id) newErrors.vehicle_id = 'Vehicle is required';
    if (!formData.quantity || parseFloat(formData.quantity) <= 0) newErrors.quantity = 'Quantity is required';
    if (!formData.foreman_name.trim()) newErrors.foreman_name = 'Foreman name is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const quantity = parseFloat(formData.quantity) || 0;

      const { error } = await supabase.from('fuel_topup_requests').insert({
        entry_date: formData.entry_date,
        company: formData.company,
        job_id: formData.job_id,
        vehicle_number: selectedVehicle?.vehicle_number || '',
        requested_quantity: quantity,
        quantity,
        unit: formData.unit,
        foreman_name: formData.foreman_name,
        remarks: formData.remarks || null,
        status: 'PENDING',
        created_by: user?.id || null,
      });

      if (error) throw error;
      setSuccessVisible(true);
    } catch (error: any) {
      console.error('Submit error:', error);
      const errorMessage = error.message || (error.code ? `Error ${error.code}: ${error.details || ''}` : JSON.stringify(error));
      setMessageModal({ title: 'Could Not Submit', message: errorMessage || 'Failed to submit request. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-slate-50 justify-center items-center">
        <ActivityIndicator size="large" color="#1d4ed8" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar barStyle="light-content" />

      <View className="flex-row items-center justify-between px-6 py-4 bg-[#1d4ed8]">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(app)/entry/select'); }}
            className="p-2 -ml-2 rounded-full active:opacity-60"
          >
            <ArrowLeft size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text className="text-white text-xl font-bold ml-2">Fuel Top-Up Request</Text>
        </View>
        <TouchableOpacity onPress={() => handleSubmit()} className="flex-row items-center active:opacity-70">
          <Check size={20} color="#ffffff" />
          <Text className="text-white font-semibold ml-1">Save</Text>
        </TouchableOpacity>
      </View>

      <MessageModal content={messageModal} onDismiss={() => setMessageModal(null)} />

      {successVisible && (
        <View className="absolute inset-0 bg-black/50 justify-center items-center px-6 z-50">
          <View className="bg-white rounded-3xl p-8 items-center w-full max-w-sm border border-slate-200 shadow-2xl">
            <View className="bg-blue-100 p-4 rounded-full mb-4">
              <Fuel size={64} color="#1d4ed8" />
            </View>
            <Text className="text-2xl font-black text-slate-900 mb-2">Request Sent!</Text>
            <Text className="text-slate-500 text-center mb-8">
              Your fuel top-up request has been sent to Store for approval. You'll see it reflected once they confirm it.
            </Text>
            <TouchableOpacity
              className={`w-full bg-[#1d4ed8] rounded-xl py-4 flex-row justify-center items-center ${navigating ? 'opacity-80' : ''}`}
              disabled={navigating}
              onPress={() => {
                setNavigating(true);
                setTimeout(() => {
                  router.replace('/(app)/home');
                }, 600);
              }}
            >
              {navigating ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-lg">Continue to Dashboard</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView className="flex-1 px-6 pt-6" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 100 }}>
        <View className="flex-row items-center mb-6">
          <Fuel size={24} color="#1d4ed8" />
          <Text className="text-lg font-bold text-[#1d4ed8] ml-2">Request Details</Text>
        </View>

        <View className="mb-4">
          <Text className="text-sm font-medium text-slate-700 mb-1">
            Date <Text className="text-red-500">*</Text>
          </Text>
          <View className="flex-row items-center bg-white border border-slate-300 rounded-lg px-4 h-14">
            <Calendar size={20} color="#94a3b8" className="mr-3" />
            {Platform.OS === 'web' ? (
              <input
                type="date"
                value={formData.entry_date}
                onChange={(e) => updateForm('entry_date', e.target.value)}
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: '#0f172a', fontSize: '16px', fontWeight: '500', fontFamily: 'inherit' }}
              />
            ) : (
              <TextInput
                value={formData.entry_date}
                onChangeText={(t) => updateForm('entry_date', t)}
                className="flex-1 text-slate-900 text-base font-medium"
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94a3b8"
              />
            )}
          </View>
        </View>

        <PillToggle
          label="Company"
          required
          value={formData.company}
          options={COMPANY_OPTIONS}
          onSelect={(v: string) => updateForm('company', v)}
          error={errors.company}
        />
        {!!formData.company && (
          <Text className="text-slate-400 text-xs -mt-3 mb-4 ml-1">
            {COMPANY_OPTIONS.find(o => o.value === formData.company)?.fullName}
          </Text>
        )}

        <CustomPicker
          label="Job"
          required
          value={formData.job_id}
          options={jobs}
          onSelect={(v: string) => updateForm('job_id', v)}
          placeholder="Select Job"
          error={errors.job_id}
        />

        <CustomPicker
          label="Vehicle"
          required
          value={formData.vehicle_id}
          options={vehicles}
          onSelect={(v: string) => updateForm('vehicle_id', v)}
          placeholder="Select Vehicle"
          error={errors.vehicle_id}
        />

        <View className="flex-row space-x-4 mb-4">
          <View className="flex-1 mr-2">
            <Text className="text-sm font-medium text-slate-700 mb-1">Quantity Needed <Text className="text-red-500">*</Text></Text>
            <TextInput
              value={formData.quantity}
              onChangeText={(t) => updateForm('quantity', t)}
              className={`bg-white border ${errors.quantity ? 'border-red-500' : 'border-slate-300'} text-slate-900 rounded-lg px-4 py-3.5`}
              placeholder="e.g. 80"
              placeholderTextColor="#94a3b8"
              keyboardType="decimal-pad"
            />
            {errors.quantity ? <Text className="text-red-500 text-xs mt-1 ml-1">{errors.quantity}</Text> : null}
          </View>
          <View className="flex-1 ml-2">
            <PillToggle
              label="Unit"
              required
              value={formData.unit}
              options={UNIT_OPTIONS}
              onSelect={(v: string) => updateForm('unit', v)}
            />
          </View>
        </View>

        <View className="mb-4">
          <Text className="text-sm font-medium text-slate-700 mb-1">
            Foreman Name <Text className="text-red-500">*</Text>
          </Text>
          <TextInput
            value={formData.foreman_name}
            onChangeText={(t) => updateForm('foreman_name', t)}
            className={`bg-white border ${errors.foreman_name ? 'border-red-500' : 'border-slate-300'} text-slate-900 rounded-lg px-4 py-3.5`}
            placeholder="Name of Foreman"
            placeholderTextColor="#94a3b8"
          />
          {errors.foreman_name ? <Text className="text-red-500 text-xs mt-1 ml-1">{errors.foreman_name}</Text> : null}
        </View>

        <View className="mb-8">
          <Text className="text-sm font-medium text-slate-700 mb-1">Remarks (Optional)</Text>
          <TextInput
            value={formData.remarks}
            onChangeText={(t) => updateForm('remarks', t)}
            className="bg-white border border-slate-300 text-slate-900 rounded-lg px-4 py-3.5 min-h-[100px]"
            placeholder="e.g. Tank is almost empty, need it before noon"
            placeholderTextColor="#94a3b8"
            multiline
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          onPress={() => handleSubmit()}
          disabled={submitting}
          className={`w-full py-4 rounded-xl flex-row justify-center items-center ${submitting ? 'bg-slate-400' : 'bg-[#1d4ed8]'}`}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-lg">Send Request to Store</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
