import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StatusBar, ActivityIndicator, Platform, Modal, FlatList, Image, Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import WebCamera from '../../../components/WebCamera';
import { compressImageToDataUri } from '../../../lib/imageUtils';
import { uploadToCloudinary, getWatermarkedCloudinaryUrl } from '../../../lib/cloudinary';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Check, Fuel, Calendar, ChevronDown, X, Search, Camera, Image as ImageIcon, History } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';
import { getLocalDateString } from '../../../lib/dateUtils';
import { fetchWithCache } from '../../../lib/dataCache';
import MessageModal, { MessageModalContent } from '../../../components/MessageModal';
import { fetchOffHireStatusForJob, offHireKey } from '../../../lib/equipmentOffHire';

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
  const [suppliers, setSuppliers] = useState<{ label: string; value: string }[]>([]);
  const [equipmentList, setEquipmentList] = useState<{ label: string; value: string }[]>([]);
  const { t } = useTranslation();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  // When the photo was actually taken -- used for the watermark stamp rather
  // than whenever the upload finishes.
  const [photoCapturedAt, setPhotoCapturedAt] = useState<Date | null>(null);

  const pickImage = async (source: 'camera' | 'gallery') => {
    try {
      const { status } = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', source === 'camera' ? 'Camera permission is needed to take a photo.' : 'Photo library permission is needed to choose a photo.');
        return;
      }
      const options = { mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7 };
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setPhotoUri(await compressImageToDataUri(asset.uri, asset.width, asset.height));
        setPhotoCapturedAt(new Date());
        setErrors(prev => ({ ...prev, photo: '' }));
      }
    } catch (error) {
      console.error('Error picking image:', error);
      setMessageModal({ title: 'Error', message: 'Failed to pick image.' });
    }
  };

  const [formData, setFormData] = useState({
    entry_date: getLocalDateString(),
    company: '',
    job_id: '',
    vehicle_source: 'INTERNAL' as 'INTERNAL' | 'SUPPLIER',
    vehicle_id: '',
    supplier_id: '',
    equipment_id: '',
    supplier_vehicle_number: '',
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

  // Same supplier/equipment cascade as the Equipment entry form: suppliers
  // allocated to the job in Site Allocations that still have non-off-hired
  // equipment under them, then that supplier's equipment for this job.
  useEffect(() => {
    const loadSuppliersForJob = async () => {
      if (!formData.job_id || formData.vehicle_source !== 'SUPPLIER') {
        setSuppliers([]);
        return;
      }
      const { data: supplierOptions } = await fetchWithCache(`equip-suppliers-for-job:${formData.job_id}`, async () => {
        const [suppAllocRes, equipAllocRes, offHireKeys] = await Promise.all([
          supabase.from('job_suppliers').select('supplier_id, suppliers!inner(id, supplier_name, supplier_type)').eq('job_id', formData.job_id).eq('suppliers.is_active', true),
          supabase.from('job_equipment').select('supplier_id, equipment_master_id').eq('job_id', formData.job_id),
          fetchOffHireStatusForJob(formData.job_id),
        ]);
        if (suppAllocRes.error) return { data: null, error: suppAllocRes.error };
        if (equipAllocRes.error) return { data: null, error: equipAllocRes.error };

        const equipRows = (equipAllocRes.data || []).filter(
          (row: any) => !offHireKeys.has(offHireKey(row.supplier_id, row.equipment_master_id))
        );
        const suppliersWithEquipment = new Set(equipRows.filter((row: any) => row.supplier_id).map((row: any) => row.supplier_id));

        const options = (suppAllocRes.data || [])
          .filter((row: any) => row.suppliers && row.suppliers.supplier_type !== 'LABOUR' && suppliersWithEquipment.has(row.suppliers.id))
          .map((row: any) => ({ label: row.suppliers.supplier_name, value: row.suppliers.id }))
          .sort((a: any, b: any) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
        return { data: options, error: null };
      });
      setSuppliers(supplierOptions || []);
    };
    loadSuppliersForJob();
  }, [formData.job_id, formData.vehicle_source]);

  useEffect(() => {
    const loadEquipmentForSupplier = async () => {
      if (!formData.job_id || !formData.supplier_id) {
        setEquipmentList([]);
        return;
      }
      const [{ data }, offHireKeys] = await Promise.all([
        fetchWithCache(`equipment-for-job-supplier:${formData.job_id}:${formData.supplier_id}`, () =>
          supabase
            .from('job_equipment')
            .select('equipment_master_id, supplier_id, equipment_master!inner(id, equipment_name)')
            .eq('job_id', formData.job_id)
            .eq('supplier_id', formData.supplier_id)
            .eq('equipment_master.is_active', true)
        ),
        fetchOffHireStatusForJob(formData.job_id),
      ]);
      const rawOptions = (data || [])
        .filter((row: any) => row.equipment_master && !offHireKeys.has(offHireKey(row.supplier_id, row.equipment_master_id)))
        .map((row: any) => ({ label: row.equipment_master.equipment_name, value: row.equipment_master.id }));
      const options = Array.from(new Map(rawOptions.map((e: any) => [e.value, e])).values())
        .sort((a: any, b: any) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
      setEquipmentList(options as { label: string; value: string }[]);
    };
    loadEquipmentForSupplier();
  }, [formData.job_id, formData.supplier_id]);

  const updateForm = (key: string, value: any) => {
    if (key === 'company') {
      // Jobs are tagged by company -- a previously picked job could belong to
      // a different one, so clear it rather than leave a stale, now-hidden
      // selection in place.
      setFormData(prev => ({ ...prev, company: value, job_id: '', supplier_id: '', equipment_id: '' }));
      if (errors.company) setErrors(prev => ({ ...prev, company: '' }));
      return;
    }
    // Supplier depends on job, and equipment depends on supplier -- clear
    // whatever sits downstream so a stale pick can't be submitted.
    if (key === 'job_id') {
      setFormData(prev => ({ ...prev, job_id: value, supplier_id: '', equipment_id: '' }));
      if (errors.job_id) setErrors(prev => ({ ...prev, job_id: '' }));
      return;
    }
    if (key === 'supplier_id') {
      setFormData(prev => ({ ...prev, supplier_id: value, equipment_id: '' }));
      if (errors.supplier_id) setErrors(prev => ({ ...prev, supplier_id: '' }));
      return;
    }
    if (key === 'vehicle_source') {
      setFormData(prev => ({ ...prev, vehicle_source: value, vehicle_id: '', supplier_id: '', equipment_id: '', supplier_vehicle_number: '' }));
      setErrors(prev => ({ ...prev, vehicle_id: '', supplier_id: '', equipment_id: '', supplier_vehicle_number: '' }));
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
    if (formData.vehicle_source === 'INTERNAL') {
      if (!formData.vehicle_id) newErrors.vehicle_id = 'Vehicle is required';
    } else {
      if (!formData.supplier_id) newErrors.supplier_id = 'Supplier is required';
      if (!formData.equipment_id) newErrors.equipment_id = 'Equipment is required';
      if (!formData.supplier_vehicle_number.trim()) newErrors.supplier_vehicle_number = 'Vehicle number is required';
    }
    if (!photoUri) newErrors.photo = 'Vehicle photo is required';
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

      // A photo is required to submit, but a Cloudinary failure (quota, weak
      // signal) mustn't lose the whole request -- it's sent without the photo
      // and the foreman is told, same as the Equipment form.
      let photoUrl: string | null = null;
      let photoUploadFailed = false;
      if (photoUri) {
        try {
          const jobLabel = jobs.find((j: any) => j.value === formData.job_id)?.label || 'Unknown Site';
          const rawUrl = await uploadToCloudinary(photoUri);
          photoUrl = getWatermarkedCloudinaryUrl(rawUrl, jobLabel, photoCapturedAt || undefined);
        } catch (err) {
          console.error('Cloudinary upload failed, sending request without photo:', err);
          photoUploadFailed = true;
        }
      }

      const { error } = await supabase.from('fuel_topup_requests').insert({
        entry_date: formData.entry_date,
        company: formData.company,
        job_id: formData.job_id,
        vehicle_source: formData.vehicle_source,
        vehicle_number: formData.vehicle_source === 'INTERNAL'
          ? (selectedVehicle?.vehicle_number || '')
          : formData.supplier_vehicle_number.trim(),
        supplier_id: formData.vehicle_source === 'SUPPLIER' ? formData.supplier_id : null,
        equipment_master_id: formData.vehicle_source === 'SUPPLIER' ? formData.equipment_id : null,
        requested_quantity: quantity,
        quantity,
        unit: formData.unit,
        foreman_name: formData.foreman_name,
        remarks: formData.remarks || null,
        photo_url: photoUrl,
        status: 'PENDING',
        created_by: user?.id || null,
      });

      if (error) throw error;
      if (photoUploadFailed) {
        setMessageModal({
          title: 'Sent Without Photo',
          message: 'Your request was sent to Store, but the photo could not be uploaded (weak connection or storage limit).',
          onClose: () => setSuccessVisible(true),
        });
        return;
      }
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
        <View className="flex-row items-center justify-between mb-6">
          <View className="flex-row items-center">
            <Fuel size={24} color="#1d4ed8" />
            <Text className="text-lg font-bold text-[#1d4ed8] ml-2">Request Details</Text>
          </View>
          <View className="flex-row items-center" style={{ gap: 8 }}>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/(app)/history', params: { type: 'FUEL_TOPUP' } })}
            className="bg-slate-100 p-2 rounded-xl active:bg-slate-200"
            accessibilityLabel="Fuel top-up history"
          >
            <History size={18} color="#1d4ed8" />
          </TouchableOpacity>
          <View className="flex-row bg-slate-100 p-1 rounded-xl">
            {(['INTERNAL', 'SUPPLIER'] as const).map(src => (
              <TouchableOpacity
                key={src}
                onPress={() => updateForm('vehicle_source', src)}
                className={`px-3 py-1.5 rounded-lg ${formData.vehicle_source === src ? 'bg-[#1d4ed8]' : ''}`}
              >
                <Text className={`font-bold text-xs ${formData.vehicle_source === src ? 'text-white' : 'text-slate-500'}`}>
                  {src === 'INTERNAL' ? 'Internal' : 'Supplier'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          </View>
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

        {formData.vehicle_source === 'INTERNAL' ? (
          <CustomPicker
            label="Vehicle"
            required
            value={formData.vehicle_id}
            options={vehicles}
            onSelect={(v: string) => updateForm('vehicle_id', v)}
            placeholder="Select Vehicle"
            error={errors.vehicle_id}
          />
        ) : (
          <>
            <CustomPicker
              label="Supplier"
              required
              value={formData.supplier_id}
              options={suppliers}
              onSelect={(v: string) => updateForm('supplier_id', v)}
              placeholder={formData.job_id ? (suppliers.length ? 'Select Supplier' : 'No suppliers allocated to this job') : 'Select a Job first'}
              error={errors.supplier_id}
            />
            <CustomPicker
              label="Equipment"
              required
              value={formData.equipment_id}
              options={equipmentList}
              onSelect={(v: string) => updateForm('equipment_id', v)}
              placeholder={formData.supplier_id ? 'Select Equipment' : 'Select a Supplier first'}
              error={errors.equipment_id}
            />
            <View className="mb-4">
              <Text className="text-sm font-medium text-slate-700 mb-1">
                Vehicle Number <Text className="text-red-500">*</Text>
              </Text>
              <TextInput
                value={formData.supplier_vehicle_number}
                onChangeText={(t) => updateForm('supplier_vehicle_number', t)}
                className={`bg-white border ${errors.supplier_vehicle_number ? 'border-red-500' : 'border-slate-300'} text-slate-900 rounded-lg px-4 py-3.5`}
                placeholder="e.g. DXB 12345"
                placeholderTextColor="#94a3b8"
                autoCapitalize="characters"
              />
              {errors.supplier_vehicle_number ? <Text className="text-red-500 text-xs mt-1 ml-1">{errors.supplier_vehicle_number}</Text> : null}
            </View>
          </>
        )}

        <View className={`mb-4 bg-white border ${errors.photo ? 'border-red-500' : 'border-slate-200'} rounded-lg p-4`}>
          <Text className="text-slate-700 text-sm font-medium mb-3">
            Vehicle Photo <Text className="text-red-500">*</Text>
          </Text>
          {errors.photo ? <Text className="text-red-500 text-xs mb-3 -mt-1">{errors.photo}</Text> : null}
          {photoUri ? (
            <View className="relative w-full h-48 rounded-lg overflow-hidden border border-slate-200 bg-black">
              <Image source={{ uri: photoUri }} className="w-full h-full opacity-90" resizeMode="cover" />
              <View className="absolute bottom-2 left-2 bg-black/60 px-3 py-2 rounded-lg">
                <Text className="text-white text-xs font-bold">{(photoCapturedAt || new Date()).toLocaleString()}</Text>
                <Text className="text-white text-xs font-semibold">
                  {jobs.find((j: any) => j.value === formData.job_id)?.label || 'No job selected'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => { setPhotoUri(null); setPhotoCapturedAt(null); }}
                className="absolute top-2 right-2 bg-black/60 p-2 rounded-full"
              >
                <X size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : Platform.OS === 'web' ? (
            <WebCamera onImageCaptured={(uri) => { setPhotoUri(uri); setPhotoCapturedAt(new Date()); setErrors(prev => ({ ...prev, photo: '' })); }} colorTheme="blue" />
          ) : (
            <>
              <View className="flex-row" style={{ gap: 12 }}>
                <TouchableOpacity
                  onPress={() => pickImage('camera')}
                  className="flex-1 bg-blue-50 border-2 border-dashed border-blue-200 rounded-lg py-8 items-center justify-center active:bg-blue-100"
                >
                  <Camera size={28} color="#1d4ed8" />
                  <Text className="text-blue-900 font-bold text-sm text-center mt-2">Take Live Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => pickImage('gallery')}
                  className="flex-1 bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg py-8 items-center justify-center active:bg-slate-100"
                >
                  <ImageIcon size={28} color="#475569" />
                  <Text className="text-slate-700 font-bold text-sm text-center mt-2">Choose from Gallery</Text>
                </TouchableOpacity>
              </View>
              <Text className="text-blue-600 text-xs mt-2 text-center px-2">{t('entryCommon.livePhotoHint')}</Text>
            </>
          )}
        </View>

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
