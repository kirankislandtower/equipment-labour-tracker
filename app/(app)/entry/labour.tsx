import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Modal, FlatList, ActivityIndicator, Platform, Image, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { ArrowLeft, ChevronDown, Clock, User, Briefcase, Calendar, Check, Camera, Image as ImageIcon, X, Users, WifiOff } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { getLocalDateString } from '../../../lib/dateUtils';
import { uploadToCloudinary, getWatermarkedCloudinaryUrl } from '../../../lib/cloudinary';
import { compressImageToDataUri } from '../../../lib/imageUtils';
import { downloadImageToDevice } from '../../../lib/download';
import WebCamera from '../../../components/WebCamera';
import TimePickerModal from '../../../components/TimePickerModal';
import { resolveSupplierId } from '../../../lib/masterData';
import { isStoreForeman } from '../../../lib/foremanFlags';
import NetInfo from '@react-native-community/netinfo';
import { enqueueEntry } from '../../../lib/offlineQueue';
import { fetchWithCache } from '../../../lib/dataCache';

type Job = { id: string; job_number: string; job_name: string; location?: string };
type Supplier = { id: string; supplier_name: string };
type Designation = { id: string; designation_name: string };

export default function LabourEntryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [entryDate, setEntryDate] = useState(getLocalDateString());
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [employeeName, setEmployeeName] = useState('');
  const [employeeOptions, setEmployeeOptions] = useState<string[]>([]);
  const [employeeManualEntry, setEmployeeManualEntry] = useState(false);
  const [selectedDesignation, setSelectedDesignation] = useState<Designation | null>(null);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [breakHours, setBreakHours] = useState('1');
  const [foremanName, setForemanName] = useState('');
  const [engineerName, setEngineerName] = useState('');
  const [remarks, setRemarks] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [assignedJob, setAssignedJob] = useState<Job | null>(null);

  const [jobModalVisible, setJobModalVisible] = useState(false);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [supplierModalVisible, setSupplierModalVisible] = useState(false);
  const [employeeModalVisible, setEmployeeModalVisible] = useState(false);
  const [designationModalVisible, setDesignationModalVisible] = useState(false);
  const [assignedJobModalVisible, setAssignedJobModalVisible] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [initialPhotoUri, setInitialPhotoUri] = useState<string | null>(null);
  // The exact moment the photo was taken -- used for the watermark stamp instead of
  // whenever the upload happens to complete, since those can differ by hours when an
  // entry sits in the offline queue.
  const [photoCapturedAt, setPhotoCapturedAt] = useState<Date | null>(null);
  const [isStoreUser, setIsStoreUser] = useState(false);

  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  // viewShotRef removed

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need camera permissions to verify labour on-site!');
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

  useFocusEffect(
    useCallback(() => {
      fetchFormData();
    }, [id])
  );

  const [isOffline, setIsOffline] = useState(false);
  useEffect(() => {
    NetInfo.fetch().then(s => setIsOffline(!s.isConnected));
    const unsubscribe = NetInfo.addEventListener(s => setIsOffline(!s.isConnected));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (selectedJob && errors.job) setErrors(prev => ({ ...prev, job: '' }));
    // Reset dependent fields when job changes
    setSelectedLocation(null);
    setSelectedSupplier(null);

    // Supplier options are what's allocated to this job in Site Allocations, excluding
    // suppliers explicitly tagged as equipment-only in Master Data -- an untagged
    // supplier (supplier_type null) still shows here, same as before that tag existed.
    const loadSuppliersForJob = async () => {
      if (!selectedJob) {
        setAllSuppliers([]);
        setSuppliers([]);
        return;
      }
      const { data } = await fetchWithCache(`labour-suppliers-for-job:${selectedJob.id}`, () =>
        supabase
          .from('job_suppliers')
          .select('supplier_id, suppliers!inner(id, supplier_name, supplier_type)')
          .eq('job_id', selectedJob.id)
          .eq('suppliers.is_active', true)
      );

      const options = (data || [])
        .filter((row: any) => row.suppliers && row.suppliers.supplier_type !== 'EQUIPMENT')
        .map((row: any) => ({ id: row.suppliers.id, supplier_name: row.suppliers.supplier_name }))
        .sort((a, b) => a.supplier_name.localeCompare(b.supplier_name, undefined, { sensitivity: 'base' }));
      setAllSuppliers(options);
      setSuppliers(options);
    };
    loadSuppliersForJob();
  }, [selectedJob]);
  
  useEffect(() => {
    if (selectedSupplier && errors.supplier) setErrors(prev => ({ ...prev, supplier: '' }));
    setEmployeeManualEntry(false);

    // Suppliers with a known employee roster for this specific job get a picker
    // instead of free text -- the same supplier can bring different employees to
    // different jobs, so this is scoped to (job, supplier), not supplier alone.
    const loadEmployeesForSupplier = async () => {
      if (!selectedJob || !selectedSupplier) {
        setEmployeeOptions([]);
        return;
      }
      const { data } = await fetchWithCache(`employees-for-job-supplier:${selectedJob.id}:${selectedSupplier.id}`, () =>
        supabase
          .from('job_supplier_employees')
          .select('employee_name')
          .eq('job_id', selectedJob.id)
          .eq('supplier_id', selectedSupplier.id)
      );

      const options = Array.from(new Set((data || []).map((row: any) => row.employee_name)))
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      setEmployeeOptions(options);
    };

    loadEmployeesForSupplier();
  }, [selectedJob, selectedSupplier]);
  
  useEffect(() => {
    if (selectedDesignation && errors.designation) setErrors(prev => ({ ...prev, designation: '' }));
  }, [selectedDesignation]);

  const fetchFormData = async () => {
    try {
      setFetching(true);
      const [jobsRes, suppliersRes, designationsRes, { data: { user } }] = await Promise.all([
        fetchWithCache('jobs', () => supabase.from('jobs').select('id, job_number, job_name, location').eq('is_active', true).order('job_number')),
        supabase.from('suppliers').select('id, supplier_name').order('supplier_name'),
        fetchWithCache('labour_designations', () => supabase.from('labour_designations').select('id, designation_name').order('designation_name')),
        supabase.auth.getUser()
      ]);

      setJobs((jobsRes.data || []).map((j: any) => ({
        id: j.id,
        job_number: j.job_number,
        job_name: j.job_name,
        location: j.location
      })));
      
      if (designationsRes.data) setDesignations(designationsRes.data);

      if (user) {
        const { data: userData } = await supabase.from('users').select('full_name, email').eq('id', user.id).maybeSingle();
        if (userData) {
          // If full_name is just "New User" from the trigger fallback, try to extract from email
          if (userData.full_name === 'New User' && userData.email) {
            setForemanName(userData.email.split('@')[0]);
          } else {
            setForemanName(userData.full_name || '');
          }
          setIsStoreUser(isStoreForeman(userData.email));
        }
      }

      if (id) {
        const { data: entryData } = await supabase.from('labour_entries').select('*').eq('id', id).eq('created_by', user!.id).single();
        if (entryData) {
          setEntryDate(entryData.entry_date);
          if (jobsRes.data) setSelectedJob(jobsRes.data.find((j: any) => j.id === entryData.job_id) || null);
          if (suppliersRes.data) setSelectedSupplier(suppliersRes.data.find((s: any) => s.id === entryData.supplier_id) || null);
          setEmployeeName(entryData.employee_name);
          if (designationsRes.data) setSelectedDesignation(designationsRes.data.find((d: any) => d.id === entryData.designation_id) || null);
          
          setStartTime(entryData.start_time ? entryData.start_time.substring(0, 5) : '08:00');
          setEndTime(entryData.end_time ? entryData.end_time.substring(0, 5) : '17:00');
          setBreakHours(entryData.break_hours ? entryData.break_hours.toString() : '1');
          setForemanName(entryData.foreman_name || '');
          setEngineerName(entryData.engineer_name || '');
          setRemarks(entryData.remarks || '');
          setRequestedBy(entryData.requested_by || '');
          if (jobsRes.data) setAssignedJob(jobsRes.data.find((j: any) => j.id === entryData.assigned_job_id) || null);

          if (entryData.labour_photo_url && entryData.labour_photo_url !== 'pending' && entryData.labour_photo_url !== 'NOT_REQUIRED') {
            setPhotoUri(entryData.labour_photo_url);
            setInitialPhotoUri(entryData.labour_photo_url);
          }
        }
      } else {
        // Tabs.Screen keeps this component mounted across tab switches, so a fresh
        // "new entry" visit (no id) needs an explicit reset -- otherwise the last
        // submission's values would still be sitting in every field.
        setEntryDate(getLocalDateString());
        setSelectedJob(null);
        setSelectedLocation(null);
        setSelectedSupplier(null);
        setEmployeeName('');
        setSelectedDesignation(null);
        setStartTime('08:00');
        setEndTime('17:00');
        setBreakHours('1');
        setEngineerName('');
        setRemarks('');
        setRequestedBy('');
        setAssignedJob(null);
        setPhotoUri(null);
        setPhotoCapturedAt(null);
        setInitialPhotoUri(null);
        setErrors({});
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to load form data');
    } finally {
      setFetching(false);
    }
  };

  const calculateTotalHours = () => {
    try {
      const start = startTime.split(':');
      const end = endTime.split(':');
      if (start.length === 2 && end.length === 2) {
        const startTotal = parseInt(start[0], 10) + parseInt(start[1], 10) / 60;
        const endTotal = parseInt(end[0], 10) + parseInt(end[1], 10) / 60;
        let diff = endTotal - startTotal;
        if (diff < 0) diff += 24;
        const brk = parseFloat(breakHours) || 0;
        const total = diff - brk;
        return total > 0 ? total.toFixed(2) : '0.00';
      }
    } catch (e) {
      // Ignore parsing errors
    }
    return '0.00';
  };

  const totalWorkingHours = calculateTotalHours();

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};
    if (!selectedJob) newErrors.job = 'Job is required';
    if (!selectedSupplier) newErrors.supplier = 'Supplier is required';
    if (!employeeName) newErrors.employee_name = 'Employee Name is required';
    if (!selectedDesignation) newErrors.designation = 'Designation is required';
    if (!isStoreUser && !startTime) newErrors.start_time = 'Start Time is required';
    if (!isStoreUser && !endTime) newErrors.end_time = 'End Time is required';
    if (!foremanName) newErrors.foreman_name = 'Foreman Name is required';
    if (!isStoreUser && !photoUri && !id) newErrors.photo = 'Live photo is required';
    if (isStoreUser) {
      if (!requestedBy) newErrors.requested_by = 'Requested By is required';
      if (!assignedJob) newErrors.assigned_job = 'Assign to Job is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();

      // selectedSupplier.id already holds the real suppliers table UUID (the picker is
      // built from that table's rows), so this hits a synchronous fast-path with no
      // network call -- safe to run even while offline.
      const resolvedSupplierId = await resolveSupplierId(selectedSupplier!.id);
      const jobName = selectedJob ? selectedJob.job_name : 'Unknown Site';

      const basePayload = {
        entry_date: entryDate,
        job_id: selectedJob!.id,
        supplier_id: resolvedSupplierId,
        employee_name: employeeName,
        designation_id: selectedDesignation!.id,
        start_time: startTime,
        end_time: endTime,
        break_hours: parseFloat(breakHours) || 0,
        total_working_hours: parseFloat(totalWorkingHours),
        foreman_name: foremanName,
        engineer_name: engineerName || null,
        remarks: remarks || null,
        created_by: userData?.user?.id || null,
        status: 'SUBMITTED',
        rejection_reason: null,
        requested_by: isStoreUser ? requestedBy : null,
        assigned_job_id: isStoreUser ? (assignedJob?.id || null) : null
      };

      // New entries only (not edits) go through the offline queue -- an edit while
      // offline still fails today, asking the foreman to retry once connected.
      if (!id) {
        const netState = await NetInfo.fetch();
        if (!netState.isConnected) {
          await enqueueEntry({
            type: 'labour',
            table: 'labour_entries',
            photoColumn: 'labour_photo_url',
            payload: { ...basePayload, labour_photo_url: isStoreUser && !photoUri ? 'NOT_REQUIRED' : 'pending' },
            photoDataUri: photoUri,
            photoCapturedAt: photoCapturedAt ? photoCapturedAt.toISOString() : null,
            watermarkJobLabel: jobName,
            downloadFilePrefix: 'Labour',
            displayDate: entryDate,
            display: {
              employee_name: employeeName,
              jobs: { job_name: jobName },
              labour_designations: { designation_name: selectedDesignation?.designation_name },
              total_working_hours: basePayload.total_working_hours,
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
          downloadImageToDevice(uploadedPhotoUrl, `Labour_${jobName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.jpg`);
        } catch (err: any) {
          // Don't let a Cloudinary failure (quota, network) lose the whole entry --
          // save it with the photo marked pending so it can be attached later on edit.
          console.error('Cloudinary upload failed, saving entry without photo:', err);
          photoUploadFailed = true;
        }
      }

      const payload = { ...basePayload, labour_photo_url: uploadedPhotoUrl };

      let error;
      if (id) {
        const { error: updateError } = await supabase.from('labour_entries').update(payload).eq('id', id).eq('created_by', userData?.user?.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase.from('labour_entries').insert(payload);
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
      console.error(error);
      Alert.alert('Error', error.message || 'Failed to submit entry');
    } finally {
      setLoading(false);
    }
  };


  const renderModal = (
    visible: boolean, 
    setVisible: (v: boolean) => void, 
    data: any[], 
    keyExtractor: (item: any) => string, 
    onSelect: (item: any) => void, 
    title: string
  ) => (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View className="flex-1 justify-end bg-black/60">
        <View className="bg-white rounded-t-3xl h-[60%] border-t border-slate-200 shadow-2xl">
          <View className="flex-row items-center justify-between p-5 border-b border-slate-100">
            <Text className="text-slate-900 text-lg font-black tracking-tight">{title}</Text>
            <TouchableOpacity onPress={() => setVisible(false)} className="p-2 bg-slate-100 rounded-full active:opacity-60">
              <X size={20} color="#64748b" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={data}
            keyExtractor={keyExtractor}
            renderItem={({ item }) => (
              <TouchableOpacity
                className="flex-row items-center justify-between p-4 border-b border-slate-100 active:bg-slate-50"
                onPress={() => {
                  onSelect(item);
                  setVisible(false);
                }}
              >
                <Text className="text-slate-700 text-lg font-medium">
                  {item.supplier_name || item.designation_name || item.location_name || item.job_number || item.employee_name || ''}
                </Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </View>
      </View>
    </Modal>
  );

  if (fetching) {
    return (
      <View className="flex-1 bg-slate-50 justify-center items-center">
        <ActivityIndicator size="large" color="#166534" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar barStyle="light-content" />
      
      {/* Modals */}
      <TimePickerModal 
        visible={showStartTimePicker}
        time={startTime}
        onClose={() => setShowStartTimePicker(false)}
        onSelect={(t) => {
          setStartTime(t);
          if (errors.start_time) setErrors(prev => ({ ...prev, start_time: '' }));
        }}
      />

      <TimePickerModal 
        visible={showEndTimePicker}
        time={endTime}
        onClose={() => setShowEndTimePicker(false)}
        onSelect={(t) => {
          setEndTime(t);
          if (errors.end_time) setErrors(prev => ({ ...prev, end_time: '' }));
        }}
      />

      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4 bg-[#166534]">
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
          <Text className="text-white text-xl font-bold ml-2">Labour Supply Entry</Text>
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
              <Users size={64} color="#10b981" />
            </View>
            <Text className="text-2xl font-black text-slate-900 mb-2">Success!</Text>
            <Text className="text-slate-500 text-center mb-8">
              Your labour entry has been {id ? 'updated' : 'submitted'} successfully and is awaiting review.
            </Text>
            <TouchableOpacity 
              className="w-full bg-[#166534] rounded-xl py-4 items-center"
              onPress={() => {
                setSuccessVisible(false);
                router.replace('/(app)/home');
              }}
            >
              <Text className="text-white font-bold text-lg">Continue to Dashboard</Text>
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
          <Users size={24} color="#166534" />
          <Text className="text-lg font-bold text-[#166534] ml-2">Labour Information</Text>
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
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: '#0f172a', fontSize: '16px', fontWeight: '500', fontFamily: 'inherit' }}
              />
            ) : (
              <TextInput
                className="flex-1 text-slate-900 text-base font-medium"
                value={entryDate}
                onChangeText={setEntryDate}
                placeholder="YYYY-MM-DD"
              />
            )}
          </View>
        </View>

        <View className="mb-4">
          <Text className="text-sm font-medium text-slate-700 mb-1">
            Job Number <Text className="text-red-500">*</Text>
          </Text>
          <TouchableOpacity 
            onPress={() => setJobModalVisible(true)}
            className={`flex-row items-center bg-white border ${errors.job ? 'border-red-500' : 'border-slate-300'} rounded-lg px-4 py-3 h-14 active:opacity-70`}
          >
            <View className="mr-3">
              <Briefcase size={20} color={errors.job ? "#ef4444" : "#94a3b8"} />
            </View>
            <Text className={`flex-1 text-base ${selectedJob ? 'text-slate-900' : 'text-slate-400'}`}>
              {selectedJob ? selectedJob.job_number : 'Select Job'}
            </Text>
            <ChevronDown size={20} color={errors.job ? "#ef4444" : "#94a3b8"} />
          </TouchableOpacity>
          {errors.job ? <Text className="text-red-500 text-xs mt-1 ml-1">{errors.job}</Text> : null}
        </View>

        {(() => {
          if (!selectedJob) return null;
          
          const locationsArray = selectedJob.location && selectedJob.location !== 'N/A' 
            ? selectedJob.location.split(',').map(l => l.trim()).filter(l => l) 
            : [];
            
          return (
            <>
              <View className="mb-4">
                <Text className="text-sm font-medium text-slate-700 mb-1">Project Name</Text>
                <TextInput
                  value={selectedJob.job_name}
                  editable={false}
                  multiline
                  className="bg-slate-100 border border-slate-200 text-slate-900 rounded-lg px-4 py-3.5"
                />
              </View>

              {locationsArray.length > 0 && (
                <View className="mb-4">
                  <Text className="text-sm font-medium text-slate-700 mb-1">
                    Location <Text className="text-red-500">*</Text>
                  </Text>
                  <TouchableOpacity 
                    onPress={() => setLocationModalVisible(true)}
                    className="flex-row items-center bg-white border border-slate-300 rounded-lg px-4 py-3 h-14 active:opacity-70"
                  >
                    <Text className={`flex-1 text-base ${selectedLocation ? 'text-slate-900' : 'text-slate-400'}`}>
                      {selectedLocation || 'Select Location'}
                    </Text>
                    <ChevronDown size={20} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
              )}
            </>
          );
        })()}

        <View className={`mb-4 ${!selectedJob ? 'opacity-50' : ''}`}>
          <Text className="text-sm font-medium text-slate-700 mb-1">
            Supplier <Text className="text-red-500">*</Text>
          </Text>
          <TouchableOpacity 
            onPress={() => selectedJob && setSupplierModalVisible(true)}
            className={`flex-row items-center bg-white border ${errors.supplier ? 'border-red-500' : 'border-slate-300'} rounded-lg px-4 py-3 h-14 active:opacity-70`}
          >
            <View className="mr-3">
              <User size={20} color={errors.supplier ? "#ef4444" : "#94a3b8"} />
            </View>
            <Text className={`flex-1 text-base ${selectedSupplier ? 'text-slate-900' : 'text-slate-400'}`}>
              {selectedSupplier?.supplier_name || (selectedJob ? 'Select Supplier' : 'Please select a Job Number first')}
            </Text>
            <ChevronDown size={20} color={errors.supplier ? "#ef4444" : "#94a3b8"} />
          </TouchableOpacity>
          {errors.supplier ? <Text className="text-red-500 text-xs mt-1 ml-1">{errors.supplier}</Text> : null}
        </View>

        <View className="mb-4">
          <Text className="text-sm font-medium text-slate-700 mb-1">
            Employee Name <Text className="text-red-500">*</Text>
          </Text>
          {employeeOptions.length > 0 && !employeeManualEntry ? (
            <>
              <TouchableOpacity
                onPress={() => setEmployeeModalVisible(true)}
                className={`flex-row items-center bg-white border ${errors.employee_name ? 'border-red-500' : 'border-slate-300'} rounded-lg px-4 py-3 h-14 active:opacity-70`}
              >
                <View className="mr-3">
                  <User size={20} color={errors.employee_name ? "#ef4444" : "#94a3b8"} />
                </View>
                <Text className={`flex-1 text-base ${employeeName ? 'text-slate-900' : 'text-slate-400'}`}>
                  {employeeName || 'Select Employee'}
                </Text>
                <ChevronDown size={20} color={errors.employee_name ? "#ef4444" : "#94a3b8"} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEmployeeManualEntry(true)} className="mt-1.5 ml-1">
                <Text className="text-xs text-slate-500 underline">Not listed? Enter name manually</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View className={`flex-row items-center bg-white border ${errors.employee_name ? 'border-red-500' : 'border-slate-300'} rounded-lg px-4 h-14`}>
                <User size={20} color={errors.employee_name ? "#ef4444" : "#94a3b8"} className="mr-3" />
                <TextInput
                  className="flex-1 text-slate-900 text-base font-medium"
                  placeholder="Enter employee name"
                  placeholderTextColor="#94a3b8"
                  value={employeeName}
                  onChangeText={(t) => {
                    setEmployeeName(t);
                    if (errors.employee_name) setErrors(prev => ({ ...prev, employee_name: '' }));
                  }}
                />
              </View>
              {employeeOptions.length > 0 && (
                <TouchableOpacity onPress={() => setEmployeeManualEntry(false)} className="mt-1.5 ml-1">
                  <Text className="text-xs text-slate-500 underline">Choose from list instead</Text>
                </TouchableOpacity>
              )}
            </>
          )}
          {errors.employee_name ? <Text className="text-red-500 text-xs mt-1 ml-1">{errors.employee_name}</Text> : null}
        </View>

        <View className="mb-4">
          <Text className="text-sm font-medium text-slate-700 mb-1">
            Designation <Text className="text-red-500">*</Text>
          </Text>
          <TouchableOpacity 
            onPress={() => setDesignationModalVisible(true)}
            className={`flex-row items-center bg-white border ${errors.designation ? 'border-red-500' : 'border-slate-300'} rounded-lg px-4 py-3 h-14 active:opacity-70`}
          >
            <View className="mr-3">
              <Briefcase size={20} color={errors.designation ? "#ef4444" : "#94a3b8"} />
            </View>
            <Text className={`flex-1 text-base ${selectedDesignation ? 'text-slate-900' : 'text-slate-400'}`}>
              {selectedDesignation?.designation_name || 'Select Designation'}
            </Text>
            <ChevronDown size={20} color={errors.designation ? "#ef4444" : "#94a3b8"} />
          </TouchableOpacity>
          {errors.designation ? <Text className="text-red-500 text-xs mt-1 ml-1">{errors.designation}</Text> : null}
        </View>

        {isStoreUser && (
          <>
            <View className="mb-4">
              <Text className="text-sm font-medium text-slate-700 mb-1">
                Requested By <Text className="text-red-500">*</Text>
              </Text>
              <View className={`bg-white border ${errors.requested_by ? 'border-red-500' : 'border-slate-300'} rounded-lg px-4 h-14 justify-center`}>
                <TextInput
                  className="flex-1 text-slate-900 text-base"
                  placeholder="Who requested this labour"
                  placeholderTextColor="#94a3b8"
                  value={requestedBy}
                  onChangeText={(t) => {
                    setRequestedBy(t);
                    if (errors.requested_by) setErrors(prev => ({ ...prev, requested_by: '' }));
                  }}
                />
              </View>
              {errors.requested_by ? <Text className="text-red-500 text-xs mt-1 ml-1">{errors.requested_by}</Text> : null}
            </View>

            <View className="mb-4">
              <Text className="text-sm font-medium text-slate-700 mb-1">
                Assign to Job <Text className="text-red-500">*</Text>
              </Text>
              <TouchableOpacity
                onPress={() => setAssignedJobModalVisible(true)}
                className={`flex-row items-center bg-white border ${errors.assigned_job ? 'border-red-500' : 'border-slate-300'} rounded-lg px-4 py-3 h-14 active:opacity-70`}
              >
                <View className="mr-3">
                  <Briefcase size={20} color={errors.assigned_job ? "#ef4444" : "#94a3b8"} />
                </View>
                <Text className={`flex-1 text-base ${assignedJob ? 'text-slate-900' : 'text-slate-400'}`}>
                  {assignedJob ? assignedJob.job_number : 'Select Job to Assign'}
                </Text>
                <ChevronDown size={20} color={errors.assigned_job ? "#ef4444" : "#94a3b8"} />
              </TouchableOpacity>
              {errors.assigned_job ? <Text className="text-red-500 text-xs mt-1 ml-1">{errors.assigned_job}</Text> : null}
            </View>
          </>
        )}

        {!isStoreUser && (
          <>
            <View className="flex-row mb-4 gap-x-4">
              <View className="flex-1">
                <Text className="text-sm font-medium text-slate-700 mb-1">
                  Start Time <Text className="text-red-500">*</Text>
                </Text>
                <TouchableOpacity
                  onPress={() => setShowStartTimePicker(true)}
                  className={`flex-row items-center bg-white border ${errors.start_time ? 'border-red-500' : 'border-slate-300'} rounded-lg px-4 h-14`}
                >
                  <Clock size={18} color="#94a3b8" className="mr-2" />
                  <Text className="flex-1 text-slate-900 text-base font-medium">{startTime}</Text>
                </TouchableOpacity>
                {errors.start_time ? <Text className="text-red-500 text-xs mt-1 ml-1">{errors.start_time}</Text> : null}
              </View>

              <View className="flex-1">
                <Text className="text-sm font-medium text-slate-700 mb-1">
                  End Time <Text className="text-red-500">*</Text>
                </Text>
                <TouchableOpacity
                  onPress={() => setShowEndTimePicker(true)}
                  className={`flex-row items-center bg-white border ${errors.end_time ? 'border-red-500' : 'border-slate-300'} rounded-lg px-4 h-14`}
                >
                  <Clock size={18} color="#94a3b8" className="mr-2" />
                  <Text className="flex-1 text-slate-900 text-base font-medium">{endTime}</Text>
                </TouchableOpacity>
                {errors.end_time ? <Text className="text-red-500 text-xs mt-1 ml-1">{errors.end_time}</Text> : null}
              </View>
            </View>

            <View className="flex-row mb-4 gap-x-4">
              <View className="flex-1">
                <Text className="text-sm font-medium text-slate-700 mb-1">Break Hours</Text>
                <View className="bg-white border border-slate-300 rounded-lg px-4 h-14 justify-center">
                  <TextInput
                    className="flex-1 text-slate-900 text-base font-medium"
                    placeholder="1"
                    placeholderTextColor="#94a3b8"
                    value={breakHours}
                    onChangeText={setBreakHours}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View className="flex-1">
                <Text className="text-sm font-medium text-slate-700 mb-1">Total Hours</Text>
                <View className="bg-slate-100 border border-slate-200 rounded-lg px-4 h-14 justify-center">
                  <Text className="text-slate-900 text-base font-bold tracking-tight">{totalWorkingHours}</Text>
                </View>
              </View>
            </View>
          </>
        )}

        <View className="mb-4">
          <Text className="text-sm font-medium text-slate-700 mb-1">
            Foreman Name <Text className="text-red-500">*</Text>
          </Text>
          <View className={`bg-white border ${errors.foreman_name ? 'border-red-500' : 'border-slate-300'} rounded-lg px-4 h-14 justify-center`}>
            <TextInput
              className="flex-1 text-slate-900 text-base"
              placeholder="Enter foreman name"
              placeholderTextColor="#94a3b8"
              value={foremanName}
              onChangeText={(t) => {
                setForemanName(t);
                if (errors.foreman_name) setErrors(prev => ({ ...prev, foreman_name: '' }));
              }}
            />
          </View>
          {errors.foreman_name ? <Text className="text-red-500 text-xs mt-1 ml-1">{errors.foreman_name}</Text> : null}
        </View>

        <View className="mb-4">
          <Text className="text-sm font-medium text-slate-700 mb-1">Engineer Name (Optional)</Text>
          <View className="bg-white border border-slate-300 rounded-lg px-4 h-14 justify-center">
            <TextInput
              className="flex-1 text-slate-900 text-base font-medium"
              placeholder="Enter engineer name"
              placeholderTextColor="#94a3b8"
              value={engineerName}
              onChangeText={setEngineerName}
            />
          </View>
        </View>

        {!isStoreUser && (
          <View className={`mb-6 bg-white border ${errors.photo ? 'border-red-500' : 'border-slate-200'} rounded-lg p-4`}>
            <Text className="text-slate-700 text-sm font-medium mb-3">Attach Timesheet Photo (Live Camera Only) <Text className="text-red-500">*</Text></Text>
            {errors.photo ? <Text className="text-red-500 text-xs mb-3 -mt-1">{errors.photo}</Text> : null}

            {photoUri ? (
              <View className="mb-3">
                <View className="relative w-full h-48 rounded-lg overflow-hidden border border-slate-200 bg-black">
                  <Image source={{ uri: photoUri }} className="w-full h-full opacity-90" resizeMode="cover" />

                  {/* Watermark Overlay (Visual Preview) */}
                  <View className="absolute bottom-2 left-2 bg-black/60 px-3 py-2 rounded-lg">
                    <Text className="text-white text-xs font-bold">
                      {(photoCapturedAt || new Date()).toLocaleString()}
                    </Text>
                    <Text className="text-white text-xs font-semibold">
                      {selectedJob ? `${selectedJob.job_number} - ${selectedJob.job_name}` : 'Unknown Site'}
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
              </View>
            ) : Platform.OS === 'web' ? (
              <WebCamera onImageCaptured={(uri) => { setPhotoUri(uri); setPhotoCapturedAt(new Date()); }} colorTheme="green" />
            ) : (
              <TouchableOpacity
                onPress={pickImage}
                className="bg-green-50 border-2 border-dashed border-green-200 rounded-lg py-8 items-center justify-center active:bg-green-100"
              >
                <Camera size={32} color="#16a34a" className="mb-2" />
                <Text className="text-green-900 font-bold text-base">Take Live Photo</Text>
                <Text className="text-green-600 text-xs mt-1 text-center px-4">
                  Photos are time and location stamped to prevent fraud.
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View className="mb-8">
          <Text className="text-sm font-medium text-slate-700 mb-1">Remarks (Optional)</Text>
          <View className="bg-white border border-slate-300 rounded-lg px-4 py-3 min-h-[100px]">
            <TextInput
              className="flex-1 text-slate-900 text-base font-medium text-left"
              placeholder="Enter remarks (optional)"
              placeholderTextColor="#94a3b8"
              value={remarks}
              onChangeText={setRemarks}
              multiline
              textAlignVertical="top"
            />
          </View>
        </View>

        <TouchableOpacity 
          onPress={handleSubmit}
          disabled={loading}
          className={`w-full py-4 rounded-xl flex-row justify-center items-center ${loading ? 'bg-slate-400' : 'bg-[#1e3a8a]'}`}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-lg">{id ? 'Update Entry' : 'Submit Entry'}</Text>
          )}
        </TouchableOpacity>

      </ScrollView>

      {renderModal(jobModalVisible, setJobModalVisible, jobs, (item) => item.id, setSelectedJob, 'Select Job')}
      
      {selectedJob && renderModal(
        locationModalVisible, 
        setLocationModalVisible, 
        (selectedJob.location && selectedJob.location !== 'N/A' ? selectedJob.location.split(',').map(l => ({ id: l.trim(), location_name: l.trim() })).filter(l => l.id) : []), 
        (item) => item.id, 
        (item) => setSelectedLocation(item.location_name), 
        'Select Location'
      )}

      {renderModal(supplierModalVisible, setSupplierModalVisible, suppliers, (item) => item.id, setSelectedSupplier, 'Select Supplier')}
      {renderModal(
        employeeModalVisible,
        setEmployeeModalVisible,
        [...employeeOptions.map(e => ({ id: e, employee_name: e })), { id: '__manual__', employee_name: 'Other (enter manually)' }],
        (item) => item.id,
        (item) => {
          if (item.id === '__manual__') {
            setEmployeeManualEntry(true);
          } else {
            setEmployeeName(item.employee_name);
            if (errors.employee_name) setErrors(prev => ({ ...prev, employee_name: '' }));
          }
        },
        'Select Employee'
      )}
      {renderModal(designationModalVisible, setDesignationModalVisible, designations, (item) => item.id, setSelectedDesignation, 'Select Designation')}
      {renderModal(assignedJobModalVisible, setAssignedJobModalVisible, jobs, (item) => item.id, (item) => {
        setAssignedJob(item);
        if (errors.assigned_job) setErrors(prev => ({ ...prev, assigned_job: '' }));
      }, 'Assign to Job')}
    </SafeAreaView>
  );
}
