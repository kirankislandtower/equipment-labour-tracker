import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, ScrollView, 
  StatusBar, Modal, FlatList, ActivityIndicator, Alert, Platform, Image 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft, ChevronDown, Check, X, Camera, Image as ImageIcon, Truck, Calendar, Clock, Fuel } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { getLocalDateString } from '../../../lib/dateUtils';
import WebCamera from '../../../components/WebCamera';
import { uploadToCloudinary, getWatermarkedCloudinaryUrl } from '../../../lib/cloudinary';
import { compressImageToDataUri } from '../../../lib/imageUtils';
import { downloadImageToDevice } from '../../../lib/download';
import TimePickerModal from '../../../components/TimePickerModal';
import { resolveSupplierId, resolveEquipmentId } from '../../../lib/masterData';
import { isStoreForeman } from '../../../lib/foremanFlags';
import NetInfo from '@react-native-community/netinfo';
import { enqueueEntry } from '../../../lib/offlineQueue';

// Helper for modal picker
const CustomPicker = ({ label, value, options, onSelect, placeholder, required = false, error }: any) => {
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-slate-700 mb-1">
        {label} {required && <Text className="text-red-500">*</Text>}
      </Text>
      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        className={`bg-white border ${error ? 'border-red-500' : 'border-slate-300'} rounded-lg px-4 py-3.5 flex-row items-center justify-between active:opacity-70`}
      >
        <Text className={value ? "text-slate-900" : "text-slate-400"}>
          {value ? options.find((o: any) => o.value === value)?.label || placeholder : placeholder}
        </Text>
        <ChevronDown size={20} color={error ? "#ef4444" : "#64748b"} />
      </TouchableOpacity>
      {error ? <Text className="text-red-500 text-xs mt-1 ml-1">{error}</Text> : null}

      <Modal visible={modalVisible} transparent animationType="slide">
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-white rounded-t-3xl h-[60%] border-t border-slate-200 shadow-2xl">
            <View className="flex-row items-center justify-between p-5 border-b border-slate-100">
              <Text className="text-slate-900 text-lg font-black tracking-tight">Select {label}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} className="p-2 bg-slate-100 rounded-full active:opacity-60">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    onSelect(item.value);
                    setModalVisible(false);
                  }}
                  className="flex-row items-center justify-between p-4 border-b border-slate-100 active:bg-slate-50"
                >
                  <Text className={`text-base ${value === item.value ? 'text-[#1e3a8a] font-bold tracking-tight' : 'text-slate-700 font-medium'}`}>
                    {item.label}
                  </Text>
                  {value === item.value && <Check size={20} color="#1e3a8a" />}
                </TouchableOpacity>
              )}
              contentContainerStyle={{ paddingBottom: 40 }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default function EquipmentEntryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successVisible, setSuccessVisible] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [initialPhotoUri, setInitialPhotoUri] = useState<string | null>(null);
  // The exact moment the photo was taken -- used for the watermark stamp instead of
  // whenever the upload happens to complete, since those can differ by hours when an
  // entry sits in the offline queue. Null for a photo restored from an existing entry
  // (nothing new was just captured) or before any photo has been taken yet.
  const [photoCapturedAt, setPhotoCapturedAt] = useState<Date | null>(null);
  const [isStoreUser, setIsStoreUser] = useState(false);

  // ViewShot removed
  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need camera permissions to verify equipment on-site!');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const compressedUri = await compressImageToDataUri(asset.uri, asset.width, asset.height);
        setPhotoUri(compressedUri);
        setPhotoCapturedAt(new Date());
        if (errors.photo) setErrors(prev => ({ ...prev, photo: '' }));
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };
  
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const [jobs, setJobs] = useState<{ label: string; value: string }[]>([]);
  const [allJobsData, setAllJobsData] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<{ label: string; value: string }[]>([]);
  const [allSuppliersList, setAllSuppliersList] = useState<any[]>([]);
  const [equipmentList, setEquipmentList] = useState<{ label: string; value: string }[]>([]);
  const [allEquipmentList, setAllEquipmentList] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    entry_date: getLocalDateString(),
    job_id: '',
    supplier_id: '',
    equipment_id: '',
    rental_type: 'HOURLY',
    start_time: '08:00',
    start_am_pm: 'AM',
    end_time: '05:00',
    end_am_pm: 'PM',
    break_hours: '1',
    working_hours: '9',
    number_of_trips: '',
    vehicle_number: '',
    foreman_name: '',
    engineer_name: '',
    remarks: '',
    fuel_provided: false,
    fuel_quantity: '',
    fuel_unit: 'Gallons',
    location: ''
  });

  const rentalTypes = [
    { label: 'Hourly', value: 'HOURLY' },
    { label: 'Daily', value: 'DAILY' },
    { label: 'Weekly', value: 'WEEKLY' },
    { label: 'Monthly', value: 'MONTHLY' },
    { label: 'Trip Basis', value: 'TRIP_BASIS' },
  ];

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [id])
  );

  useEffect(() => {
    // Auto calculate working hours if valid times provided
    try {
      if (formData.start_time && formData.end_time) {
        let [startH, startM] = formData.start_time.split(':').map(Number);
        let [endH, endM] = formData.end_time.split(':').map(Number);
        
        if (!isNaN(startH) && !isNaN(endH)) {
          if (formData.start_am_pm === 'PM' && startH !== 12) startH += 12;
          if (formData.start_am_pm === 'AM' && startH === 12) startH = 0;
          
          if (formData.end_am_pm === 'PM' && endH !== 12) endH += 12;
          if (formData.end_am_pm === 'AM' && endH === 12) endH = 0;

          let diff = (endH + endM/60) - (startH + startM/60);
          if (diff < 0) diff += 24; // Cross midnight
          
          const breakHrs = parseFloat(formData.break_hours) || 0;
          const working = Math.max(0, diff - breakHrs);
          
          setFormData(prev => ({ ...prev, working_hours: working.toFixed(2).replace(/\.?0+$/, '') }));
        }
      }
    } catch (e) {
      // Ignore
    }
  }, [formData.start_time, formData.end_time, formData.start_am_pm, formData.end_am_pm, formData.break_hours]);

  useEffect(() => {
    // Supplier options are suppliers allocated to the job in Site Allocations AND
    // that have equipment specifically toggled on for them under that supplier in
    // Site Allocations -- a supplier with nothing scoped to it (e.g. allocated only
    // for labour purposes) has nothing to offer here, so it's excluded rather than
    // leading to a dead-end empty Equipment picker.
    const loadSuppliersForJob = async () => {
      if (!formData.job_id) {
        setSuppliers([]);
        return;
      }
      const [suppAllocRes, equipAllocRes] = await Promise.all([
        supabase.from('job_suppliers').select('supplier_id, suppliers!inner(id, supplier_name, supplier_type)').eq('job_id', formData.job_id).eq('suppliers.is_active', true),
        supabase.from('job_equipment').select('supplier_id').eq('job_id', formData.job_id),
      ]);

      const equipRows = equipAllocRes.data || [];
      const suppliersWithEquipment = new Set(equipRows.filter((row: any) => row.supplier_id).map((row: any) => row.supplier_id));

      const supplierOptions = (suppAllocRes.data || [])
        .filter((row: any) => row.suppliers && row.suppliers.supplier_type !== 'LABOUR' && suppliersWithEquipment.has(row.suppliers.id))
        .map((row: any) => ({ label: row.suppliers.supplier_name, value: row.suppliers.id }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
      setSuppliers(supplierOptions);
    };

    loadSuppliersForJob();
  }, [formData.job_id]);

  useEffect(() => {
    // Equipment options are strictly whatever's toggled on for this exact supplier
    // under this job in Site Allocations -- no sharing across suppliers. No supplier
    // selected means no equipment shown.
    const loadEquipmentForSupplier = async () => {
      if (!formData.job_id || !formData.supplier_id) {
        setEquipmentList([]);
        return;
      }

      const { data } = await supabase
        .from('job_equipment')
        .select('equipment_master_id, supplier_id, equipment_master!inner(id, equipment_name)')
        .eq('job_id', formData.job_id)
        .eq('supplier_id', formData.supplier_id)
        .eq('equipment_master.is_active', true);

      const rawOptions = (data || [])
        .filter((row: any) => row.equipment_master)
        .map((row: any) => ({ label: row.equipment_master.equipment_name, value: row.equipment_master.id }));
      const equipmentOptions = Array.from(new Map(rawOptions.map(e => [e.value, e])).values())
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
      setEquipmentList(equipmentOptions);

      if (formData.equipment_id && !equipmentOptions.find(e => e.value === formData.equipment_id)) {
        setFormData(prev => ({ ...prev, equipment_id: '' }));
      }
    };

    loadEquipmentForSupplier();
  }, [formData.job_id, formData.supplier_id]);

  const fetchData = async () => {
    try {
      const [jobsRes, suppliersRes, equipmentRes, { data: { user } }] = await Promise.all([
        supabase.from('jobs').select('id, job_number, job_name, location').eq('is_active', true).order('job_number'),
        supabase.from('suppliers').select('id, supplier_name').order('supplier_name'),
        supabase.from('equipment_master').select('id, equipment_category, equipment_name').eq('is_active', true).order('equipment_category').order('equipment_name'),
        supabase.auth.getUser(),
        new Promise(resolve => setTimeout(resolve, 300))
      ]);

      if (jobsRes.data) {
        setJobs(jobsRes.data.map((j: any) => ({ label: j.job_number, value: j.id })));
        setAllJobsData(jobsRes.data);
      }
      if (suppliersRes.data) {
        setAllSuppliersList(suppliersRes.data);
      }
      if (equipmentRes.data) {
        setAllEquipmentList(equipmentRes.data);
      }
      
      if (user) {
        const { data: userData } = await supabase.from('users').select('full_name, email').eq('id', user.id).maybeSingle();
        if (userData) {
          let name = userData.full_name || '';
          if (name === 'New User' && userData.email) {
            name = userData.email.split('@')[0];
          }
          setFormData(prev => ({ ...prev, foreman_name: name }));
          setIsStoreUser(isStoreForeman(userData.email));
        }
      }
      
      if (id) {
        const { data: entryData } = await supabase.from('equipment_entries').select('*').eq('id', id).eq('created_by', user?.id).single();
        if (entryData) {
          
          const formatTo12h = (time24: string) => {
            if (!time24) return { time: '', ampm: 'AM' };
            const [hStr, mStr] = time24.split(':');
            let h = parseInt(hStr, 10);
            const ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12 || 12;
            return { time: `${h.toString().padStart(2, '0')}:${mStr}`, ampm };
          };

          const startParts = formatTo12h(entryData.start_time ? entryData.start_time.substring(0, 5) : '');
          const endParts = formatTo12h(entryData.end_time ? entryData.end_time.substring(0, 5) : '');

          setFormData(prev => ({
            ...prev,
            entry_date: entryData.entry_date,
            job_id: entryData.job_id,
            supplier_id: entryData.supplier_id,
            equipment_id: entryData.equipment_master_id,
            rental_type: entryData.rental_type,
            start_time: startParts.time,
            start_am_pm: startParts.ampm,
            end_time: endParts.time,
            end_am_pm: endParts.ampm,
            break_hours: entryData.break_hours ? entryData.break_hours.toString() : '0',
            working_hours: entryData.working_hours ? entryData.working_hours.toString() : '0',
            number_of_trips: entryData.number_of_trips ? entryData.number_of_trips.toString() : '',
            vehicle_number: entryData.vehicle_number || '',
            foreman_name: entryData.foreman_name || '',
            engineer_name: entryData.engineer_name || '',
            remarks: entryData.remarks || '',
            fuel_provided: entryData.fuel_provided || false,
            fuel_quantity: entryData.fuel_quantity ? entryData.fuel_quantity.toString() : '',
            fuel_unit: entryData.fuel_unit || 'Gallons'
          }));
          if (entryData.equipment_photo_url && entryData.equipment_photo_url !== 'pending') {
            setPhotoUri(entryData.equipment_photo_url);
            setInitialPhotoUri(entryData.equipment_photo_url);
          }
        }
      } else {
        // Reset form for a new entry
        setFormData(prev => ({
          ...prev,
          entry_date: getLocalDateString(),
          job_id: '',
          supplier_id: '',
          equipment_id: '',
          rental_type: 'HOURLY',
          start_time: '08:00',
          start_am_pm: 'AM',
          end_time: '05:00',
          end_am_pm: 'PM',
          break_hours: '1',
          working_hours: '9',
          number_of_trips: '',
          vehicle_number: '',
          engineer_name: '',
          remarks: '',
          fuel_provided: false,
          fuel_quantity: '',
          fuel_unit: 'Gallons',
          location: ''
        }));
        setPhotoUri(null);
        setPhotoCapturedAt(null);
        setInitialPhotoUri(null);
        setErrors({});
      }
      
    } catch (error) {
      console.error('Error fetching data:', error);
      Alert.alert('Error', 'Failed to load form data');
    } finally {
      setLoading(false);
    }
  };

  const updateForm = (key: string, value: any) => {
    setFormData(prev => {
      const newState = { ...prev, [key]: value };
      // Clear dependent fields
      if (key === 'job_id') {
        newState.location = '';
        newState.supplier_id = '';
        newState.equipment_id = '';
      }
      if (key === 'supplier_id') {
        newState.equipment_id = '';
      }
      return newState;
    });
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
  };

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};
    if (!formData.job_id) newErrors.job_id = 'Job is required';
    if (!formData.supplier_id) newErrors.supplier_id = 'Supplier is required';
    if (!formData.equipment_id) newErrors.equipment_id = 'Equipment is required';
    if (!formData.vehicle_number) newErrors.vehicle_number = 'Vehicle number is required';
    if (!formData.foreman_name) newErrors.foreman_name = 'Foreman name is required';
    if (!formData.engineer_name) newErrors.engineer_name = 'Engineer name is required';
    
    if (!isStoreUser && formData.rental_type === 'TRIP_BASIS' && !formData.number_of_trips) {
      newErrors.number_of_trips = 'Number of trips is required';
    }

    if (formData.fuel_provided) {
      if (!formData.fuel_quantity) newErrors.fuel_quantity = 'Quantity is required';
      if (!formData.fuel_unit) newErrors.fuel_unit = 'Unit is required';
    }

    if (!isStoreUser && !photoUri && !id) newErrors.photo = 'Live photo is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const convertTo24h = (time12: string, ampm: string) => {
        if (!time12) return null;
        let [h, m] = time12.split(':').map(Number);
        if (isNaN(h) || isNaN(m)) return null;
        if (ampm === 'PM' && h !== 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      };

      // formData.supplier_id / equipment_id already hold the real suppliers/equipment_master
      // UUIDs (the pickers are built from those tables' .id fields), so this hits a
      // synchronous fast-path with no network call -- safe to run even while offline.
      const [resolvedSupplierId, resolvedEquipmentId] = await Promise.all([
        resolveSupplierId(formData.supplier_id),
        resolveEquipmentId(formData.equipment_id),
      ]);

      const selectedJob = jobs.find((j: any) => j.value === formData.job_id);
      const jobName = selectedJob ? selectedJob.label : 'Unknown Site';

      const basePayload = {
        entry_date: formData.entry_date,
        job_id: formData.job_id,
        supplier_id: resolvedSupplierId,
        equipment_master_id: resolvedEquipmentId,
        rental_type: formData.rental_type,
        start_time: convertTo24h(formData.start_time, formData.start_am_pm),
        end_time: convertTo24h(formData.end_time, formData.end_am_pm),
        break_hours: parseFloat(formData.break_hours) || 0,
        working_hours: parseFloat(formData.working_hours) || 0,
        number_of_trips: formData.rental_type === 'TRIP_BASIS' ? parseInt(formData.number_of_trips) || null : null,
        vehicle_number: formData.vehicle_number,
        foreman_name: formData.foreman_name,
        engineer_name: formData.engineer_name || '',
        remarks: formData.remarks || null,
        created_by: user?.id || null,
        status: 'SUBMITTED',
        rejection_reason: null,
        fuel_provided: formData.fuel_provided,
        fuel_quantity: formData.fuel_provided && formData.fuel_quantity ? parseFloat(formData.fuel_quantity) : null,
        fuel_unit: formData.fuel_provided ? formData.fuel_unit : null
      };

      // New entries only (not edits) go through the offline queue -- an edit while
      // offline still fails today, asking the foreman to retry once connected.
      if (!id) {
        const netState = await NetInfo.fetch();
        if (!netState.isConnected) {
          await enqueueEntry({
            type: 'equipment',
            table: 'equipment_entries',
            photoColumn: 'equipment_photo_url',
            payload: { ...basePayload, equipment_photo_url: isStoreUser && !photoUri ? 'NOT_REQUIRED' : 'pending' },
            photoDataUri: photoUri,
            photoCapturedAt: photoCapturedAt ? photoCapturedAt.toISOString() : null,
            watermarkJobLabel: jobName,
            downloadFilePrefix: 'Equipment',
            displayDate: formData.entry_date,
            display: {
              equipment_master: { equipment_name: allEquipmentList.find((e: any) => e.id === resolvedEquipmentId)?.equipment_name || 'Equipment' },
              jobs: { job_name: jobName },
              working_hours: basePayload.working_hours,
            },
          });
          Alert.alert(
            'Saved Offline',
            'No internet connection right now. This entry is saved on your device and will upload automatically once you\'re back online.',
            [{ text: 'OK', onPress: () => setSuccessVisible(true) }]
          );
          return;
        }
      }

      let uploadedPhotoUrl = (id && photoUri === initialPhotoUri) ? photoUri : (isStoreUser && !photoUri ? 'NOT_REQUIRED' : 'pending');
      let photoUploadFailed = false;

      if (photoUri && (!id || photoUri !== initialPhotoUri)) {
        try {
          const rawCloudinaryUrl = await uploadToCloudinary(photoUri);
          uploadedPhotoUrl = getWatermarkedCloudinaryUrl(rawCloudinaryUrl, jobName, photoCapturedAt || undefined);
          downloadImageToDevice(uploadedPhotoUrl, `Equipment_${jobName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.jpg`);
        } catch (err: any) {
          // Don't let a Cloudinary failure (quota, network) lose the whole entry --
          // save it with the photo marked pending so it can be attached later on edit.
          console.error('Cloudinary upload failed, saving entry without photo:', err);
          photoUploadFailed = true;
        }
      }

      const payload = { ...basePayload, equipment_photo_url: uploadedPhotoUrl };

      let error;
      if (id) {
        const { error: updateError } = await supabase.from('equipment_entries').update(payload).eq('id', id).eq('created_by', user?.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase.from('equipment_entries').insert(payload);
        error = insertError;
      }

      if (error) {
        if (error.code === '23503' && error.message?.includes('created_by')) {
          throw new Error('Your account profile is not fully set up. Please log out completely and log back in to fix this automatically.');
        }
        throw error;
      }

      if (photoUploadFailed) {
        Alert.alert(
          'Saved — Photo Pending',
          'Your entry was saved, but the photo could not be uploaded right now (connection issue or storage limit). Edit this entry later to attach the photo once you\'re back online.',
          [{ text: 'OK', onPress: () => setSuccessVisible(true) }]
        );
      } else {
        setSuccessVisible(true);
      }
    } catch (error: any) {
      console.error('Submit error:', error);
      Alert.alert('Error', error.message || 'Failed to submit entry');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-slate-50 justify-center items-center">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar barStyle="light-content" />
      
      {/* Modals */}
      <TimePickerModal 
        visible={showStartTimePicker}
        time={(() => {
          let [h, m] = (formData.start_time || '08:00').split(':').map(Number);
          if (formData.start_am_pm === 'PM' && h !== 12) h += 12;
          if (formData.start_am_pm === 'AM' && h === 12) h = 0;
          return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        })()}
        onClose={() => setShowStartTimePicker(false)}
        onSelect={(time24) => {
          let [h, m] = time24.split(':').map(Number);
          const isPM = h >= 12;
          let h12 = h % 12;
          if (h12 === 0) h12 = 12;
          setFormData(prev => ({ 
            ...prev, 
            start_time: `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
            start_am_pm: isPM ? 'PM' : 'AM'
          }));
        }}
      />

      <TimePickerModal 
        visible={showEndTimePicker}
        time={(() => {
          let [h, m] = (formData.end_time || '05:00').split(':').map(Number);
          if (formData.end_am_pm === 'PM' && h !== 12) h += 12;
          if (formData.end_am_pm === 'AM' && h === 12) h = 0;
          return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        })()}
        onClose={() => setShowEndTimePicker(false)}
        onSelect={(time24) => {
          let [h, m] = time24.split(':').map(Number);
          const isPM = h >= 12;
          let h12 = h % 12;
          if (h12 === 0) h12 = 12;
          setFormData(prev => ({ 
            ...prev, 
            end_time: `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
            end_am_pm: isPM ? 'PM' : 'AM'
          }));
        }}
      />

      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4 bg-[#1e3a8a]">
        <View className="flex-row items-center">
          <TouchableOpacity 
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(app)/entry/select');
              }
            }}
            className="p-2 -ml-2 rounded-full active:opacity-60"
          >
            <ArrowLeft size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text className="text-white text-xl font-bold ml-2">Equipment Entry</Text>
        </View>
        <TouchableOpacity 
          onPress={handleSubmit}
          className="flex-row items-center active:opacity-70"
        >
          <Check size={20} color="#ffffff" />
          <Text className="text-white font-semibold ml-1">Save</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={successVisible} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center px-6">
          <View className="bg-white rounded-3xl p-8 items-center w-full max-w-sm border border-slate-200 shadow-2xl">
            <View className="bg-green-100 p-4 rounded-full mb-4">
              <Truck size={64} color="#10b981" />
            </View>
            <Text className="text-2xl font-black text-slate-900 mb-2">Success!</Text>
            <Text className="text-slate-500 text-center mb-8">
              Your equipment entry has been {id ? 'updated' : 'submitted'} successfully and is awaiting review.
            </Text>
            <TouchableOpacity 
              className={`w-full bg-[#1e3a8a] rounded-xl py-4 flex-row justify-center items-center ${navigating ? 'opacity-80' : ''}`}
              disabled={navigating}
              onPress={() => {
                setNavigating(true);
                setTimeout(() => {
                  setSuccessVisible(false);
                  setNavigating(false);
                  setFormData({
                    entry_date: getLocalDateString(),
                    job_id: '',
                    supplier_id: '',
                    equipment_id: '',
                    rental_type: 'HOURLY',
                    start_time: '08:00',
                    start_am_pm: 'AM',
                    end_time: '05:00',
                    end_am_pm: 'PM',
                    break_hours: '1',
                    working_hours: '9',
                    number_of_trips: '',
                    vehicle_number: '',
                    foreman_name: formData.foreman_name,
                    engineer_name: '',
                    remarks: '',
                    fuel_provided: false,
                    fuel_quantity: '',
                    fuel_unit: 'Gallons',
                    location: ''
                  });
                  setPhotoUri(null);
                  setPhotoCapturedAt(null);
                  router.setParams({ id: '' });
                  router.replace('/(app)/home');
                }, 600);
              }}
            >
              {navigating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-bold text-lg">Continue to Dashboard</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView className="flex-1 px-6 pt-6" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 100 }}>
        
        <View className="flex-row items-center mb-6">
          <Truck size={24} color="#1e3a8a" />
          <Text className="text-lg font-bold text-[#1e3a8a] ml-2">Equipment Information</Text>
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

        <CustomPicker 
          label="Job Number"
          required={true}
          value={formData.job_id}
          options={jobs}
          onSelect={(v: string) => updateForm('job_id', v)}
          placeholder="Select Job"
          error={errors.job_id}
        />

        {(() => {
          const selectedJobObj = allJobsData.find((j: any) => j.id === formData.job_id);
          if (!selectedJobObj) return null;
          
          const locationsArray = selectedJobObj.location && selectedJobObj.location !== 'N/A' 
            ? selectedJobObj.location.split(',').map((l: string) => l.trim()).filter((l: string) => l) 
            : [];
            
          const locationOptions = locationsArray.map((l: string) => ({ label: l, value: l }));

          return (
            <>
              <View className="mb-4">
                <Text className="text-sm font-medium text-slate-700 mb-1">Project Name</Text>
                <TextInput
                  value={selectedJobObj.job_name}
                  editable={false}
                  multiline
                  className="bg-slate-100 border border-slate-200 text-slate-900 rounded-lg px-4 py-3.5"
                />
              </View>

              {locationOptions.length > 0 && (
                <CustomPicker 
                  label="Location"
                  required={true}
                  value={formData.location}
                  options={locationOptions}
                  onSelect={(v: string) => updateForm('location', v)}
                  placeholder="Select Location"
                  error={errors.location}
                />
              )}
            </>
          );
        })()}

        <View className={!formData.job_id ? 'opacity-50' : ''}>
          <CustomPicker 
            label="Supplier Name"
            required={true}
            value={formData.supplier_id}
            options={suppliers}
            onSelect={(v: string) => updateForm('supplier_id', v)}
            placeholder={formData.job_id ? "Select Supplier" : "Please select a Job Number first"}
            error={errors.supplier_id}
          />
        </View>

        <View className={!formData.supplier_id ? 'opacity-50' : ''}>
          <CustomPicker 
            label="Equipment Name" 
            value={formData.equipment_id} 
            options={equipmentList} 
            onSelect={(val: string) => updateForm('equipment_id', val)} 
            placeholder={formData.supplier_id ? "Select Equipment" : "Please select a Supplier first"} 
            required
            error={errors.equipment_id}
          />
        </View>

        {!isStoreUser && (
          <>
            <CustomPicker
              label="Rental Type"
              required={true}
              value={formData.rental_type}
              options={rentalTypes}
              onSelect={(v: string) => updateForm('rental_type', v)}
              placeholder="Select Rental Type"
            />

            {formData.rental_type === 'TRIP_BASIS' && (
              <View className="mb-4">
                <Text className="text-sm font-medium text-slate-700 mb-1">
                  Number of Trips <Text className="text-red-500">*</Text>
                </Text>
                <TextInput
                  value={formData.number_of_trips}
                  onChangeText={(t) => updateForm('number_of_trips', t)}
                  className={`bg-white border ${errors.number_of_trips ? 'border-red-500' : 'border-slate-300'} text-slate-900 rounded-lg px-4 py-3.5`}
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                />
                {errors.number_of_trips ? <Text className="text-red-500 text-xs mt-1 ml-1">{errors.number_of_trips}</Text> : null}
              </View>
            )}

            <View className="flex-row mb-4 gap-x-4">
              <View className="flex-1">
                <Text className="text-sm font-medium text-slate-700 mb-1">Start Time</Text>
                <TouchableOpacity
                  onPress={() => setShowStartTimePicker(true)}
                  className="flex-row items-center justify-between bg-white border border-slate-300 rounded-lg px-4 h-14"
                >
                  <View className="flex-row items-center flex-1">
                    <Clock size={18} color="#94a3b8" className="mr-2" />
                    <Text className="text-slate-900 text-base font-medium">{formData.start_time}</Text>
                  </View>
                  <View className="bg-slate-100 px-2 py-1.5 rounded-md border border-slate-200 ml-1">
                    <Text className="text-xs font-bold text-slate-700">{formData.start_am_pm}</Text>
                  </View>
                </TouchableOpacity>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-medium text-slate-700 mb-1">End Time</Text>
                <TouchableOpacity
                  onPress={() => setShowEndTimePicker(true)}
                  className="flex-row items-center justify-between bg-white border border-slate-300 rounded-lg px-4 h-14"
                >
                  <View className="flex-row items-center flex-1">
                    <Clock size={18} color="#94a3b8" className="mr-2" />
                    <Text className="text-slate-900 text-base font-medium">{formData.end_time}</Text>
                  </View>
                  <View className="bg-slate-100 px-2 py-1.5 rounded-md border border-slate-200 ml-1">
                    <Text className="text-xs font-bold text-slate-700">{formData.end_am_pm}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            <View className="flex-row space-x-4 mb-4">
              <View className="flex-1 mr-2">
                <Text className="text-sm font-medium text-slate-700 mb-1">Break Hours</Text>
                <TextInput
                  value={formData.break_hours}
                  onChangeText={(t) => updateForm('break_hours', t)}
                  className="bg-white border border-slate-300 text-slate-900 rounded-lg px-4 py-3.5"
                  placeholder="1"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                />
              </View>
              <View className="flex-1 ml-2">
                <Text className="text-sm font-medium text-slate-700 mb-1">Working Hours</Text>
                <TextInput
                  value={formData.working_hours}
                  onChangeText={(t) => updateForm('working_hours', t)}
                  className="bg-slate-100 border border-slate-200 text-slate-900 font-bold rounded-lg px-4 py-3.5"
                  editable={false}
                />
              </View>
            </View>
          </>
        )}

        <View className="mb-4">
          <Text className="text-sm font-medium text-slate-700 mb-1">
            Vehicle Number <Text className="text-red-500">*</Text>
          </Text>
          <TextInput
            value={formData.vehicle_number}
            onChangeText={(t) => updateForm('vehicle_number', t)}
            className={`bg-white border ${errors.vehicle_number ? 'border-red-500' : 'border-slate-300'} text-slate-900 rounded-lg px-4 py-3.5`}
            placeholder="e.g. DXB 12345"
            placeholderTextColor="#94a3b8"
          />
          {errors.vehicle_number ? <Text className="text-red-500 text-xs mt-1 ml-1">{errors.vehicle_number}</Text> : null}
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

        <View className="mb-4">
          <Text className="text-sm font-medium text-slate-700 mb-1">
            Engineer Name <Text className="text-red-500">*</Text>
          </Text>
          <TextInput
            value={formData.engineer_name}
            onChangeText={(t) => updateForm('engineer_name', t)}
            className={`bg-white border ${errors.engineer_name ? 'border-red-500' : 'border-slate-300'} text-slate-900 rounded-lg px-4 py-3.5`}
            placeholder="Name of Engineer"
            placeholderTextColor="#94a3b8"
          />
          {errors.engineer_name ? <Text className="text-red-500 text-xs mt-1 ml-1">{errors.engineer_name}</Text> : null}
        </View>

        {/* Fuel Supply Details */}
        <View className="flex-row items-center mt-6 mb-4">
          <Fuel size={24} color="#1e3a8a" />
          <Text className="text-lg font-bold text-[#1e3a8a] ml-2">Fuel Supply Details</Text>
        </View>

        <View className="mb-8 bg-white border border-slate-200 rounded-lg p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-medium text-slate-700 flex-1 mr-2">Fuel Provided by Our Site?</Text>
            <View className="flex-row space-x-2">
              <TouchableOpacity
                onPress={() => updateForm('fuel_provided', true)}
                className={`px-4 py-2 rounded-lg border ${formData.fuel_provided ? 'bg-blue-50 border-[#1e3a8a]' : 'bg-white border-slate-300'}`}
              >
                <Text className={`font-semibold ${formData.fuel_provided ? 'text-[#1e3a8a]' : 'text-slate-600'}`}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => updateForm('fuel_provided', false)}
                className={`px-4 py-2 rounded-lg border ${!formData.fuel_provided ? 'bg-blue-50 border-[#1e3a8a]' : 'bg-white border-slate-300'}`}
              >
                <Text className={`font-semibold ${!formData.fuel_provided ? 'text-[#1e3a8a]' : 'text-slate-600'}`}>No</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          {formData.fuel_provided && (
            <View className="mt-4 border-t border-slate-100 pt-4 flex-row space-x-4">
              <View className="flex-1 mr-2">
                <Text className="text-sm font-medium text-slate-700 mb-1">
                  Quantity <Text className="text-red-500">*</Text>
                </Text>
                <TextInput
                  value={formData.fuel_quantity}
                  onChangeText={(t) => updateForm('fuel_quantity', t)}
                  className={`bg-slate-50 border ${errors.fuel_quantity ? 'border-red-500' : 'border-slate-300'} text-slate-900 rounded-lg px-4 py-3`}
                  placeholder="e.g. 50"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                />
                {errors.fuel_quantity ? <Text className="text-red-500 text-xs mt-1 ml-1">{errors.fuel_quantity}</Text> : null}
              </View>
              <View className="flex-1 ml-2">
                <Text className="text-sm font-medium text-slate-700 mb-1">
                  Unit <Text className="text-red-500">*</Text>
                </Text>
                <View className="flex-row border border-slate-300 rounded-lg overflow-hidden h-12">
                  <TouchableOpacity
                    onPress={() => updateForm('fuel_unit', 'Gallons')}
                    className={`flex-1 justify-center items-center ${formData.fuel_unit === 'Gallons' ? 'bg-[#1e3a8a]' : 'bg-slate-50'}`}
                  >
                    <Text className={`text-xs font-bold ${formData.fuel_unit === 'Gallons' ? 'text-white' : 'text-slate-600'}`}>Gallons</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => updateForm('fuel_unit', 'Liters')}
                    className={`flex-1 justify-center items-center border-l border-slate-300 ${formData.fuel_unit === 'Liters' ? 'bg-[#1e3a8a] border-l-0' : 'bg-slate-50'}`}
                  >
                    <Text className={`text-xs font-bold ${formData.fuel_unit === 'Liters' ? 'text-white' : 'text-slate-600'}`}>Liters</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>

        {!isStoreUser && (
          <View className={`mb-6 bg-white border ${errors.photo ? 'border-red-500' : 'border-slate-200'} rounded-lg p-4`}>
            <Text className="text-slate-700 text-sm font-medium mb-3">
              Equipment Photo (Live Camera Only) <Text className="text-red-500">*</Text>
            </Text>
            {errors.photo ? <Text className="text-red-500 text-xs mb-3 -mt-1">{errors.photo}</Text> : null}

            {photoUri ? (
                <View className="relative w-full h-48 rounded-lg overflow-hidden border border-slate-200 bg-black">
                  <Image source={{ uri: photoUri }} className="w-full h-full opacity-90" resizeMode="cover" />

                  {/* Watermark Overlay (Visual Preview) */}
                  <View className="absolute bottom-2 left-2 bg-black/60 px-3 py-2 rounded-lg">
                    <Text className="text-white text-xs font-bold">
                      {(photoCapturedAt || new Date()).toLocaleString()}
                    </Text>
                    <Text className="text-white text-xs font-semibold">
                      {jobs.find((j: any) => j.value === formData.job_id)?.label || 'Unknown Site'}
                    </Text>
                    <Text className="text-white text-[10px] opacity-80">Verified Entry</Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => { setPhotoUri(null); setPhotoCapturedAt(null); }}
                    className="absolute top-2 right-2 bg-black/60 p-2 rounded-full"
                  >
                    <X size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
        ) : Platform.OS === 'web' ? (
          <WebCamera onImageCaptured={(uri) => { setPhotoUri(uri); setPhotoCapturedAt(new Date()); }} colorTheme="blue" />
        ) : (
          <TouchableOpacity
            onPress={pickImage}
            className="bg-blue-50 border-2 border-dashed border-blue-200 rounded-lg py-8 items-center justify-center active:bg-blue-100"
          >
            <Camera size={32} color="#1d4ed8" className="mb-2" />
            <Text className="text-blue-900 font-bold text-base">Take Live Photo</Text>
            <Text className="text-blue-600 text-xs mt-1 text-center px-4">
              Photos are time and location stamped to prevent fraud.
            </Text>
          </TouchableOpacity>
        )}
      </View>
        )}

        <View className="mb-8">
          <Text className="text-sm font-medium text-slate-700 mb-1">Remarks (Optional)</Text>
          <TextInput
            value={formData.remarks}
            onChangeText={(t) => updateForm('remarks', t)}
            className="bg-white border border-slate-300 text-slate-900 rounded-lg px-4 py-3.5 min-h-[100px]"
            placeholder="Enter remarks (optional)"
            placeholderTextColor="#94a3b8"
            multiline
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity 
          onPress={handleSubmit}
          disabled={submitting}
          className={`w-full py-4 rounded-xl flex-row justify-center items-center ${submitting ? 'bg-slate-400' : 'bg-[#1e3a8a]'}`}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-lg">{id ? 'Update Entry' : 'Submit Entry'}</Text>
          )}
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
