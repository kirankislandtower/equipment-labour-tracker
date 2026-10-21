import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StatusBar, Modal, FlatList, ActivityIndicator, Alert, Platform, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft, ChevronDown, Check, X, Camera, Image as ImageIcon, Wrench, Calendar, Clock, WifiOff, Search, Truck, Users } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { getLocalDateString } from '../../../lib/dateUtils';
import WebCamera from '../../../components/WebCamera';
import { uploadToCloudinary, getWatermarkedCloudinaryUrl } from '../../../lib/cloudinary';
import { compressImageToDataUri } from '../../../lib/imageUtils';
import { downloadImageToDevice } from '../../../lib/download';
import TimePickerModal from '../../../components/TimePickerModal';
import NetInfo from '@react-native-community/netinfo';
import { enqueueEntry } from '../../../lib/offlineQueue';
import { fetchWithCache } from '../../../lib/dataCache';
import MessageModal, { MessageModalContent } from '../../../components/MessageModal';

const SECTION_OPTIONS = [
  { label: 'Civil', value: 'Civil' },
  { label: 'Network', value: 'Network' },
];

const BASIS_OPTIONS = [
  { label: 'Hourly', value: 'HOURLY' },
  { label: 'Trip Basis', value: 'TRIP_BASIS' },
];

const COMPANY_OPTIONS = [
  { label: 'IST', value: 'IST', fullName: 'Island Tower Electromechanical' },
  { label: 'JAH', value: 'JAH', fullName: 'Jazeerat Al Hadeed' },
  { label: 'Hydro', value: 'HYDRO', fullName: 'Hydro' },
];

// Helper for modal picker
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
        <Text className={value ? "text-slate-900" : "text-slate-400"}>
          {value ? options.find((o: any) => o.value === value)?.label || placeholder : placeholder}
        </Text>
        <ChevronDown size={20} color={error ? "#ef4444" : "#64748b"} />
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
                  onPress={() => {
                    onSelect(item.value);
                    setModalVisible(false);
                  }}
                  className="flex-row items-center justify-between p-4 border-b border-slate-100 active:bg-slate-50"
                >
                  <Text className={`text-base ${value === item.value ? 'text-[#6d28d9] font-bold tracking-tight' : 'text-slate-700 font-medium'}`}>
                    {item.label}
                  </Text>
                  {value === item.value && <Check size={20} color="#6d28d9" />}
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

// Tap-once toggle for simple 2-3 option fields, instead of opening a modal picker.
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
          className={`flex-1 py-3 rounded-lg items-center ${value === opt.value ? 'bg-[#6d28d9] shadow-sm' : ''}`}
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

const SectionHeader = ({ icon: Icon, label }: { icon: any; label: string }) => (
  <View className="flex-row items-center mt-2 mb-3 pb-2 border-b border-slate-200">
    <Icon size={16} color="#6d28d9" />
    <Text className="text-[#6d28d9] font-outfit-bold text-xs uppercase tracking-widest ml-2">{label}</Text>
  </View>
);

export default function InternalVehicleEntryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successVisible, setSuccessVisible] = useState(false);
  const [messageModal, setMessageModal] = useState<MessageModalContent | null>(null);
  const [photoPendingReason, setPhotoPendingReason] = useState<'missing' | 'upload_failed' | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [initialPhotoUri, setInitialPhotoUri] = useState<string | null>(null);
  const [photoCapturedAt, setPhotoCapturedAt] = useState<Date | null>(null);

  const pickImage = async (source: 'camera' | 'gallery' = 'camera') => {
    try {
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'We need camera permissions to verify the vehicle on-site!');
          return;
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'We need photo library permission to choose a photo.');
          return;
        }
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            quality: 0.7,
          })
        : await ImagePicker.launchImageLibraryAsync({
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

  const [allJobs, setAllJobs] = useState<any[]>([]);
  const [allVehicles, setAllVehicles] = useState<any[]>([]);
  const [allDrivers, setAllDrivers] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    entry_date: getLocalDateString(),
    company: '',
    vehicle_id: '',
    job_id: '',
    section: '',
    basis: 'HOURLY',
    start_time: '08:00',
    start_am_pm: 'AM',
    end_time: '05:00',
    end_am_pm: 'PM',
    break_hours: '1',
    working_hours: '9',
    number_of_trips: '',
    requester_name: '',
    driver_id: '',
    rate_amount: '',
    ist_timesheet_number: '',
    remarks: '',
  });

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [id])
  );

  const [isOffline, setIsOffline] = useState(false);
  useEffect(() => {
    NetInfo.fetch().then(s => setIsOffline(!s.isConnected));
    const unsubscribe = NetInfo.addEventListener(s => setIsOffline(!s.isConnected));
    return unsubscribe;
  }, []);

  useEffect(() => {
    // Auto calculate working hours whenever start/end/break change.
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
          if (diff < 0) diff += 24;

          const breakHrs = parseFloat(formData.break_hours) || 0;
          const working = Math.max(0, diff - breakHrs);

          setFormData(prev => ({ ...prev, working_hours: working.toFixed(2).replace(/\.?0+$/, '') }));
        }
      }
    } catch (e) {
      // Ignore
    }
  }, [formData.start_time, formData.end_time, formData.start_am_pm, formData.end_am_pm, formData.break_hours]);

  const fetchData = async () => {
    try {
      const [jobsRes, vehiclesRes, driversRes, { data: { user } }] = await Promise.all([
        fetchWithCache('jobs', () => supabase.from('jobs').select('id, job_number, job_name, company').eq('is_active', true).order('job_number')),
        fetchWithCache('internal_vehicles', () => supabase.from('internal_vehicles').select('id, vehicle_number, vehicle_type, company').eq('is_active', true).order('vehicle_number')),
        fetchWithCache('internal_vehicle_drivers', () => supabase.from('internal_vehicle_drivers').select('id, name, company').eq('is_active', true).order('name')),
        supabase.auth.getUser(),
        new Promise(resolve => setTimeout(resolve, 300))
      ]);

      if (jobsRes.data) {
        setAllJobs(jobsRes.data);
      }
      if (vehiclesRes.data) {
        setAllVehicles(vehiclesRes.data);
      }
      if (driversRes.data) {
        setAllDrivers(driversRes.data);
      }

      if (user) {
        const { data: userData } = await supabase.from('users').select('full_name, email').eq('id', user.id).maybeSingle();
        if (userData) {
          let name = userData.full_name || '';
          if (name === 'New User' && userData.email) {
            name = userData.email.split('@')[0];
          }
          setFormData(prev => ({ ...prev, requester_name: name }));
        }
      }

      if (id) {
        const { data: entryData } = await supabase.from('internal_vehicle_entries').select('*').eq('id', id).eq('created_by', user?.id).single();
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
            company: entryData.company || '',
            vehicle_id: entryData.internal_vehicle_id || '',
            job_id: entryData.job_id || '',
            section: entryData.section || '',
            basis: entryData.basis || 'HOURLY',
            start_time: startParts.time || '08:00',
            start_am_pm: startParts.ampm,
            end_time: endParts.time || '05:00',
            end_am_pm: endParts.ampm,
            break_hours: entryData.break_hours ? entryData.break_hours.toString() : '0',
            working_hours: entryData.working_hours ? entryData.working_hours.toString() : '0',
            number_of_trips: entryData.number_of_trips !== null && entryData.number_of_trips !== undefined ? entryData.number_of_trips.toString() : '',
            requester_name: entryData.requester_name || '',
            driver_id: entryData.driver_id || '',
            rate_amount: entryData.rate_amount !== null && entryData.rate_amount !== undefined ? entryData.rate_amount.toString() : '',
            ist_timesheet_number: entryData.ist_timesheet_number || '',
            remarks: entryData.remarks || '',
          }));
          if (entryData.internal_vehicle_photo_url && entryData.internal_vehicle_photo_url !== 'pending') {
            setPhotoUri(entryData.internal_vehicle_photo_url);
            setInitialPhotoUri(entryData.internal_vehicle_photo_url);
          }
        }
      } else {
        setFormData(prev => ({
          ...prev,
          entry_date: getLocalDateString(),
          company: '',
          vehicle_id: '',
          job_id: '',
          section: '',
          basis: 'HOURLY',
          start_time: '08:00',
          start_am_pm: 'AM',
          end_time: '05:00',
          end_am_pm: 'PM',
          break_hours: '1',
          working_hours: '9',
          number_of_trips: '',
          driver_id: '',
          rate_amount: '',
          ist_timesheet_number: '',
          remarks: '',
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
    setFormData(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
  };

  // Jobs and Drivers are tagged to a company in Master Data, so those two
  // pickers scope to whichever company is selected above. Vehicles are a
  // shared fleet used across all three companies, so that list stays the
  // same regardless of which company is selected.
  const jobs = allJobs
    .filter((j: any) => !formData.company || j.company === formData.company)
    .map((j: any) => ({ label: `${j.job_number} - ${j.job_name}`, value: j.id }));
  const vehicleOptions = allVehicles
    .map((v: any) => ({ label: `${v.vehicle_number} - ${v.vehicle_type}`, value: v.id }));
  const driverOptions = allDrivers
    .filter((d: any) => !formData.company || d.company === formData.company)
    .map((d: any) => ({ label: d.name, value: d.id }));

  const selectedVehicle = allVehicles.find((v: any) => v.id === formData.vehicle_id);
  const selectedDriver = allDrivers.find((d: any) => d.id === formData.driver_id);

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};
    if (!formData.company) newErrors.company = 'Company is required';
    if (!formData.vehicle_id) newErrors.vehicle_id = 'Vehicle is required';
    if (!formData.job_id) newErrors.job_id = 'Job is required';
    if (formData.company === 'IST' && !formData.section) newErrors.section = 'Section is required';
    if (!formData.number_of_trips) newErrors.number_of_trips = 'Number of trips is required';
    if (!formData.requester_name) newErrors.requester_name = 'Requester name is required';
    if (!formData.driver_id) newErrors.driver_id = 'Driver / Operator is required';

    const missingPhoto = !photoUri && !id;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Same rule as Equipment: can't have finished work that, by the clock,
    // hasn't ended yet.
    if (formData.entry_date === getLocalDateString()) {
      const toMinutes = (time12: string, ampm: string) => {
        let [h, m] = (time12 || '').split(':').map(Number);
        if (isNaN(h) || isNaN(m)) return null;
        if (ampm === 'PM' && h !== 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return h * 60 + m;
      };
      const endMinutes = toMinutes(formData.end_time, formData.end_am_pm);
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const nowLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Foremen can submit up to 30 minutes before the claimed finish time --
      // enough slack for wrapping up without blocking a legit on-time submit.
      if (endMinutes !== null && nowMinutes < endMinutes - 30) {
        setMessageModal({
          title: 'Too Early to Submit',
          message: `You can submit this entry only at work finish time. This entry claims work until ${formData.end_time} ${formData.end_am_pm}, but it's only ${nowLabel} right now.`,
        });
        return;
      }
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

      const jobForWatermark = jobs.find((j: any) => j.value === formData.job_id);
      const jobName = jobForWatermark ? jobForWatermark.label : 'Unknown Site';

      const basePayload = {
        entry_date: formData.entry_date,
        company: formData.company,
        internal_vehicle_id: formData.vehicle_id,
        job_id: formData.job_id,
        section: formData.section,
        basis: formData.basis,
        start_time: convertTo24h(formData.start_time, formData.start_am_pm),
        end_time: convertTo24h(formData.end_time, formData.end_am_pm),
        break_hours: parseFloat(formData.break_hours) || 0,
        working_hours: parseFloat(formData.working_hours) || 0,
        number_of_trips: parseInt(formData.number_of_trips) || 0,
        requester_name: formData.requester_name,
        driver_id: formData.driver_id,
        rate_amount: formData.rate_amount ? (parseFloat(formData.rate_amount) || null) : null,
        ist_timesheet_number: formData.ist_timesheet_number.trim() || null,
        remarks: formData.remarks || null,
        created_by: user?.id || null,
        status: 'SUBMITTED',
        rejection_reason: null,
      };

      if (!id) {
        const netState = await NetInfo.fetch();
        if (!netState.isConnected) {
          await enqueueEntry({
            type: 'internal_vehicle',
            table: 'internal_vehicle_entries',
            photoColumn: 'internal_vehicle_photo_url',
            payload: { ...basePayload, internal_vehicle_photo_url: 'pending' },
            photoDataUri: photoUri,
            photoCapturedAt: photoCapturedAt ? photoCapturedAt.toISOString() : null,
            watermarkJobLabel: jobName,
            downloadFilePrefix: 'InternalVehicle',
            displayDate: formData.entry_date,
            display: {
              company: basePayload.company,
              internal_vehicles: { vehicle_number: selectedVehicle?.vehicle_number || '', vehicle_type: selectedVehicle?.vehicle_type || 'Vehicle' },
              internal_vehicle_drivers: { name: selectedDriver?.name || '' },
              jobs: { job_name: jobName },
              working_hours: basePayload.working_hours,
              number_of_trips: basePayload.number_of_trips,
            },
          });
          setPhotoPendingReason(missingPhoto ? 'missing' : null);
          setMessageModal({
            title: 'Saved Offline',
            message: 'No internet connection right now. This entry is saved on your device and will upload automatically once you\'re back online.',
            onClose: () => setSuccessVisible(true),
          });
          return;
        }
      }

      let uploadedPhotoUrl = (id && photoUri === initialPhotoUri) ? photoUri : (!photoUri ? 'pending' : 'pending');
      let photoUploadFailed = false;

      if (photoUri && (!id || photoUri !== initialPhotoUri)) {
        try {
          const rawCloudinaryUrl = await uploadToCloudinary(photoUri);
          uploadedPhotoUrl = getWatermarkedCloudinaryUrl(rawCloudinaryUrl, jobName, photoCapturedAt || undefined);
          downloadImageToDevice(uploadedPhotoUrl, `InternalVehicle_${jobName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.jpg`);
        } catch (err: any) {
          console.error('Cloudinary upload failed, saving entry without photo:', err);
          photoUploadFailed = true;
        }
      }

      const payload = { ...basePayload, internal_vehicle_photo_url: uploadedPhotoUrl };

      let error;
      if (id) {
        const { error: updateError } = await supabase.from('internal_vehicle_entries').update(payload).eq('id', id).eq('created_by', user?.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase.from('internal_vehicle_entries').insert(payload);
        error = insertError;
      }

      if (error) {
        if (error.code === '23503' && error.message?.includes('created_by')) {
          throw new Error('Your account profile is not fully set up. Please log out completely and log back in to fix this automatically.');
        }
        throw error;
      }

      if (photoUploadFailed) {
        setPhotoPendingReason('upload_failed');
      } else if (missingPhoto) {
        setPhotoPendingReason('missing');
      } else {
        setPhotoPendingReason(null);
      }
      setSuccessVisible(true);
    } catch (error: any) {
      console.error('Submit error:', error);
      setMessageModal({ title: 'Could Not Submit', message: error.message || 'Failed to submit entry. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-slate-50 justify-center items-center">
        <ActivityIndicator size="large" color="#6d28d9" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar barStyle="light-content" />

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
      <View className="flex-row items-center justify-between px-6 py-4 bg-[#6d28d9]">
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
          <Text className="text-white text-xl font-bold ml-2">Internal Vehicle Entry</Text>
        </View>
        <TouchableOpacity
          onPress={() => handleSubmit()}
          className="flex-row items-center active:opacity-70"
        >
          <Check size={20} color="#ffffff" />
          <Text className="text-white font-semibold ml-1">Save</Text>
        </TouchableOpacity>
      </View>

      <MessageModal content={messageModal} onDismiss={() => setMessageModal(null)} />

      <Modal visible={successVisible} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center px-6">
          <View className="bg-white rounded-3xl p-8 items-center w-full max-w-sm border border-slate-200 shadow-2xl">
            <View className={`p-4 rounded-full mb-4 ${photoPendingReason ? 'bg-amber-100' : 'bg-green-100'}`}>
              {photoPendingReason ? <Camera size={64} color="#d97706" /> : <Wrench size={64} color="#10b981" />}
            </View>
            <Text className="text-2xl font-black text-slate-900 mb-2">
              {photoPendingReason ? 'Submitted — Photo Needed' : 'Success!'}
            </Text>
            <Text className="text-slate-500 text-center mb-8">
              {photoPendingReason === 'missing'
                ? `Your entry has been ${id ? 'updated' : 'submitted'}, but no live photo was attached. Please edit this entry later to upload it.`
                : photoPendingReason === 'upload_failed'
                ? `Your entry has been ${id ? 'updated' : 'submitted'}, but the photo could not be uploaded (connection issue or storage limit). Edit this entry later to attach it.`
                : `Your entry has been ${id ? 'updated' : 'submitted'} successfully and is awaiting review.`}
            </Text>
            <TouchableOpacity
              className={`w-full bg-[#6d28d9] rounded-xl py-4 flex-row justify-center items-center ${navigating ? 'opacity-80' : ''}`}
              disabled={navigating}
              onPress={() => {
                setNavigating(true);
                setTimeout(() => {
                  setSuccessVisible(false);
                  setPhotoPendingReason(null);
                  setNavigating(false);
                  setFormData({
                    entry_date: getLocalDateString(),
                    company: formData.company,
                    vehicle_id: '',
                    job_id: '',
                    section: '',
                    basis: 'HOURLY',
                    start_time: '08:00',
                    start_am_pm: 'AM',
                    end_time: '05:00',
                    end_am_pm: 'PM',
                    break_hours: '1',
                    working_hours: '9',
                    number_of_trips: '',
                    requester_name: formData.requester_name,
                    driver_id: '',
                    rate_amount: '',
                    ist_timesheet_number: '',
                    remarks: '',
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

        {isOffline && (
          <View className="bg-slate-800 rounded-lg px-4 py-3 mb-4 flex-row items-center">
            <WifiOff size={16} color="#fbbf24" />
            <Text className="text-white text-xs font-bold ml-2">Offline -- showing saved data. Entries will upload once you're back online.</Text>
          </View>
        )}

        <View className="flex-row items-center mb-6">
          <Wrench size={24} color="#6d28d9" />
          <Text className="text-lg font-bold text-[#6d28d9] ml-2">Internal Vehicle Information</Text>
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

        <SectionHeader icon={Truck} label="Vehicle & Job" />

        <PillToggle
          label="Company"
          required={true}
          value={formData.company}
          options={COMPANY_OPTIONS}
          onSelect={(v: string) => {
            // Switching company can make the previously picked job/driver invalid
            // (they belong to a different company's Master Data), so clear them
            // rather than leave a stale, now-hidden selection in place. Vehicles
            // are a shared fleet across companies, so the vehicle pick carries over.
            setFormData(prev => ({ ...prev, company: v, job_id: '', driver_id: '', section: v === 'IST' ? prev.section : '' }));
            if (errors.company) setErrors(prev => ({ ...prev, company: '' }));
          }}
          error={errors.company}
        />
        {!!formData.company && (
          <Text className="text-slate-400 text-xs -mt-3 mb-4 ml-1">
            {COMPANY_OPTIONS.find(o => o.value === formData.company)?.fullName}
          </Text>
        )}

        <CustomPicker
          label="Vehicle No"
          required={true}
          value={formData.vehicle_id}
          options={vehicleOptions}
          onSelect={(v: string) => updateForm('vehicle_id', v)}
          placeholder="Select Vehicle"
          error={errors.vehicle_id}
        />

        {selectedVehicle && (
          <View className="mb-4">
            <Text className="text-sm font-medium text-slate-700 mb-1">Vehicle Type</Text>
            <TextInput
              value={selectedVehicle.vehicle_type}
              editable={false}
              className="bg-slate-100 border border-slate-200 text-slate-900 rounded-lg px-4 py-3.5"
            />
          </View>
        )}

        <CustomPicker
          label="Site / Project (Job)"
          required={true}
          value={formData.job_id}
          options={jobs}
          onSelect={(v: string) => updateForm('job_id', v)}
          placeholder="Select Job"
          error={errors.job_id}
        />

        {formData.company === 'IST' && (
          <PillToggle
            label="Section"
            required={true}
            value={formData.section}
            options={SECTION_OPTIONS}
            onSelect={(v: string) => updateForm('section', v)}
            error={errors.section}
          />
        )}

        <PillToggle
          label="Hourly / Trip Basis"
          required={true}
          value={formData.basis}
          options={BASIS_OPTIONS}
          onSelect={(v: string) => updateForm('basis', v)}
        />

        <SectionHeader icon={Clock} label="Timing" />

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
            <Text className="text-sm font-medium text-slate-700 mb-1">Total Working Hours</Text>
            <TextInput
              value={formData.working_hours}
              onChangeText={(t) => updateForm('working_hours', t)}
              className="bg-slate-100 border border-slate-200 text-slate-900 font-bold rounded-lg px-4 py-3.5"
              editable={false}
            />
          </View>
        </View>

        <View className="mb-4">
          <Text className="text-sm font-medium text-slate-700 mb-1">
            Trip <Text className="text-red-500">*</Text>
          </Text>
          <TextInput
            value={formData.number_of_trips}
            onChangeText={(t) => updateForm('number_of_trips', t)}
            className={`bg-white border ${errors.number_of_trips ? 'border-red-500' : 'border-slate-300'} text-slate-900 rounded-lg px-4 py-3.5`}
            placeholder="Number of trips"
            placeholderTextColor="#94a3b8"
            keyboardType="numeric"
          />
          {errors.number_of_trips ? <Text className="text-red-500 text-xs mt-1 ml-1">{errors.number_of_trips}</Text> : null}
        </View>

        <SectionHeader icon={Users} label="People & Billing" />

        <View className="mb-4">
          <Text className="text-sm font-medium text-slate-700 mb-1">
            Requester Name <Text className="text-red-500">*</Text>
          </Text>
          <TextInput
            value={formData.requester_name}
            onChangeText={(t) => updateForm('requester_name', t)}
            className={`bg-white border ${errors.requester_name ? 'border-red-500' : 'border-slate-300'} text-slate-900 rounded-lg px-4 py-3.5`}
            placeholder="Who requested this vehicle"
            placeholderTextColor="#94a3b8"
          />
          {errors.requester_name ? <Text className="text-red-500 text-xs mt-1 ml-1">{errors.requester_name}</Text> : null}
        </View>

        <CustomPicker
          label="Driver / Operator"
          required={true}
          value={formData.driver_id}
          options={driverOptions}
          onSelect={(v: string) => updateForm('driver_id', v)}
          placeholder="Select Driver / Operator"
          error={errors.driver_id}
        />

        <View className="mb-4">
          <Text className="text-sm font-medium text-slate-700 mb-1">Rate / Amount - AED (Optional)</Text>
          <TextInput
            value={formData.rate_amount}
            onChangeText={(t) => updateForm('rate_amount', t)}
            className="bg-white border border-slate-300 text-slate-900 rounded-lg px-4 py-3.5"
            placeholder="0.00"
            placeholderTextColor="#94a3b8"
            keyboardType="numeric"
          />
        </View>

        <View className="mb-4">
          <Text className="text-sm font-medium text-slate-700 mb-1">
            {COMPANY_OPTIONS.find(o => o.value === formData.company)?.label || formData.company} Timesheet Number (Optional)
          </Text>
          <TextInput
            value={formData.ist_timesheet_number}
            onChangeText={(t) => updateForm('ist_timesheet_number', t)}
            className="bg-white border border-slate-300 text-slate-900 rounded-lg px-4 py-3.5"
            placeholder="Timesheet number"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View className={`mb-6 bg-white border ${errors.photo ? 'border-red-500' : 'border-slate-200'} rounded-lg p-4`}>
            <Text className="text-slate-700 text-sm font-medium mb-3">
              Vehicle Photo <Text className="text-red-500">*</Text>
            </Text>
            {errors.photo ? <Text className="text-red-500 text-xs mb-3 -mt-1">{errors.photo}</Text> : null}

            {photoUri ? (
                <View className="relative w-full h-48 rounded-lg overflow-hidden border border-slate-200 bg-black">
                  <Image source={{ uri: photoUri }} className="w-full h-full opacity-90" resizeMode="cover" />

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
          <WebCamera onImageCaptured={(uri) => { setPhotoUri(uri); setPhotoCapturedAt(new Date()); }} colorTheme="violet" />
        ) : (
          <>
            <View className="flex-row" style={{ gap: 12 }}>
              <TouchableOpacity
                onPress={() => pickImage('camera')}
                className="flex-1 bg-slate-100 border-2 border-dashed border-slate-300 rounded-lg py-8 items-center justify-center active:bg-slate-200"
              >
                <Camera size={28} color="#6d28d9" className="mb-2" />
                <Text className="text-slate-900 font-bold text-sm text-center">Take Live Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => pickImage('gallery')}
                className="flex-1 bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg py-8 items-center justify-center active:bg-slate-100"
              >
                <ImageIcon size={28} color="#475569" className="mb-2" />
                <Text className="text-slate-700 font-bold text-sm text-center">Choose from Gallery</Text>
              </TouchableOpacity>
            </View>
            <Text className="text-slate-500 text-xs mt-2 text-center px-2">
              A live photo is preferred and gets time-stamped. Use Gallery only if you couldn't take one on-site.
            </Text>
          </>
        )}
      </View>

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
          onPress={() => handleSubmit()}
          disabled={submitting}
          className={`w-full py-4 rounded-xl flex-row justify-center items-center ${submitting ? 'bg-slate-400' : 'bg-[#6d28d9]'}`}
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
