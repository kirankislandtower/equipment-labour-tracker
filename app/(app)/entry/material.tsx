import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, ScrollView, 
  StatusBar, Modal, FlatList, ActivityIndicator, Alert, Platform, Image 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft, ChevronDown, Check, X, Camera, ArrowRightLeft, Calendar } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { getLocalDateString } from '../../../lib/dateUtils';
import { uploadToCloudinary, getWatermarkedCloudinaryUrl } from '../../../lib/cloudinary';
import { compressImageToDataUri } from '../../../lib/imageUtils';
import { downloadImageToDevice } from '../../../lib/download';
import WebCamera from '../../../components/WebCamera';
import NetInfo from '@react-native-community/netinfo';
import { enqueueEntry } from '../../../lib/offlineQueue';


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
                  <Text className={`text-base ${value === item.value ? 'text-[#d97706] font-bold tracking-tight' : 'text-slate-700 font-medium'}`}>
                    {item.label}
                  </Text>
                  {value === item.value && <Check size={20} color="#d97706" />}
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

export default function MaterialTransferEntryScreen() {
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
  // entry sits in the offline queue.
  const [photoCapturedAt, setPhotoCapturedAt] = useState<Date | null>(null);

  // viewShotRef removed

  const [jobs, setJobs] = useState<any[]>([]);
  
  const units = [
    { label: 'Tons', value: 'Tons' },
    { label: 'Bags', value: 'Bags' },
    { label: 'Pieces', value: 'Pieces' },
    { label: 'CBM', value: 'CBM' },
    { label: 'Liters', value: 'Liters' },
    { label: 'Gallons', value: 'Gallons' },
    { label: 'Other', value: 'Other' },
  ];
  
  const [formData, setFormData] = useState({
    entry_date: getLocalDateString(),
    from_job_id: '',
    to_job_id: '',
    material_description: '',
    quantity: '',
    unit: 'Tons',
    vehicle_number: '',
    driver_name: '',
    foreman_name: '',
    remarks: '',
  });

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [id])
  );

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need camera permissions to verify materials on-site!');
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

  const fetchData = async () => {
    try {
      const [jobsRes, { data: { user } }] = await Promise.all([
        supabase.from('jobs').select('id, job_number, job_name').eq('is_active', true).order('job_number'),
        supabase.auth.getUser()
      ]);

      if (jobsRes.data) {
        setJobs(jobsRes.data.map((j: any) => ({ label: `${j.job_number} - ${j.job_name}`, value: j.id })));
      }
      
      if (user) {
        const { data: userData } = await supabase.from('users').select('full_name, email').eq('id', user.id).maybeSingle();
        if (userData) {
          let name = userData.full_name || '';
          if (name === 'New User' && userData.email) {
            name = userData.email.split('@')[0];
          }
          setFormData(prev => ({ ...prev, foreman_name: name }));
        }
      }
      
      if (id) {
        const { data: entryData } = await supabase.from('material_transfers').select('*').eq('id', id).eq('created_by', user?.id).single();
        if (entryData) {
          setFormData({
            entry_date: entryData.entry_date,
            from_job_id: entryData.from_job_id,
            to_job_id: entryData.to_job_id,
            material_description: entryData.material_description,
            quantity: entryData.quantity ? entryData.quantity.toString() : '',
            unit: entryData.unit,
            vehicle_number: entryData.vehicle_number || '',
            driver_name: entryData.driver_name || '',
            foreman_name: entryData.foreman_name || '',
            remarks: entryData.remarks || ''
          });
          if (entryData.photo_url && entryData.photo_url !== 'pending') {
            setPhotoUri(entryData.photo_url);
            setInitialPhotoUri(entryData.photo_url);
          }
        }
      } else {
        // Reset form for a new entry
        setFormData(prev => ({
          ...prev,
          entry_date: getLocalDateString(),
          from_job_id: '',
          to_job_id: '',
          material_description: '',
          quantity: '',
          unit: 'Tons',
          vehicle_number: '',
          driver_name: '',
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
    if (key === 'from_job_id' && value === formData.to_job_id) {
      Alert.alert('Invalid Selection', 'Source and destination jobs cannot be the same.');
      return;
    }
    if (key === 'to_job_id' && value === formData.from_job_id) {
      Alert.alert('Invalid Selection', 'Source and destination jobs cannot be the same.');
      return;
    }
    setFormData(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
  };

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};
    if (!formData.from_job_id) newErrors.from_job_id = 'Source job is required';
    if (!formData.to_job_id) newErrors.to_job_id = 'Destination job is required';
    if (!formData.material_description) newErrors.material_description = 'Description is required';
    if (!formData.quantity) newErrors.quantity = 'Quantity is required';
    if (!formData.vehicle_number) newErrors.vehicle_number = 'Vehicle number is required';
    if (!formData.foreman_name) newErrors.foreman_name = 'Foreman name is required';
    
    if (formData.from_job_id && formData.to_job_id && formData.from_job_id === formData.to_job_id) {
      newErrors.to_job_id = 'Destination cannot be same as source';
    }
    if (!photoUri && !id) newErrors.photo = 'Live photo is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const selectedJob = jobs.find((j: any) => j.value === formData.from_job_id);
      const jobName = selectedJob ? selectedJob.label : 'Unknown Site';

      const basePayload = {
        entry_date: formData.entry_date,
        time: new Date().toISOString().split('T')[1].split('.')[0], // Added to bypass database constraint
        from_job_id: formData.from_job_id,
        to_job_id: formData.to_job_id,
        material_description: formData.material_description,
        material_type: formData.material_description, // Added to fix the database NOT NULL constraint
        quantity: parseFloat(formData.quantity) || 0,
        unit: formData.unit,
        vehicle_number: formData.vehicle_number,
        driver_name: formData.driver_name,
        foreman_name: formData.foreman_name,
        remarks: formData.remarks || null,
        created_by: user?.id || null,
        status: 'SUBMITTED',
        rejection_reason: null,
      };

      // New entries only (not edits) go through the offline queue -- an edit while
      // offline still fails today, asking the foreman to retry once connected. Photo
      // is always required for a new material entry, so photoUri is guaranteed here.
      if (!id) {
        const netState = await NetInfo.fetch();
        if (!netState.isConnected) {
          await enqueueEntry({
            type: 'material',
            table: 'material_transfers',
            photoColumn: 'photo_url',
            payload: { ...basePayload, photo_url: 'pending' },
            photoDataUri: photoUri,
            photoCapturedAt: photoCapturedAt ? photoCapturedAt.toISOString() : null,
            watermarkJobLabel: `From: ${jobName}`,
            downloadFilePrefix: 'Material',
            displayDate: formData.entry_date,
            display: {
              material_description: formData.material_description,
              from_job: { job_name: jobName },
              to_job: { job_name: jobs.find((j: any) => j.value === formData.to_job_id)?.label || 'Unknown Site' },
              quantity: basePayload.quantity,
              unit: formData.unit,
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

      let uploadedPhotoUrl = (id && photoUri === initialPhotoUri) ? photoUri : 'pending';
      let photoUploadFailed = false;

      if (photoUri && (!id || photoUri !== initialPhotoUri)) {
        try {
          const rawCloudinaryUrl = await uploadToCloudinary(photoUri);
          uploadedPhotoUrl = getWatermarkedCloudinaryUrl(rawCloudinaryUrl, `From: ${jobName}`, photoCapturedAt || undefined);
          downloadImageToDevice(uploadedPhotoUrl, `Material_${jobName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.jpg`);
        } catch (err: any) {
          // Don't let a Cloudinary failure (quota, network) lose the whole entry --
          // save it with the photo marked pending so it can be attached later on edit.
          console.error('Cloudinary upload failed, saving entry without photo:', err);
          photoUploadFailed = true;
        }
      } else if (!id) {
         setErrors(prev => ({ ...prev, photo: 'Live photo is required' }));
         setSubmitting(false);
         return;
      }

      const payload: any = {
        ...basePayload,
        photo_url: uploadedPhotoUrl !== 'pending' ? uploadedPhotoUrl : undefined, // Keep existing photo if not updated
      };

      if (uploadedPhotoUrl === 'pending' && !id) {
         payload.photo_url = 'pending';
      }

      let error;
      if (id) {
        const { error: updateError } = await supabase.from('material_transfers').update(payload).eq('id', id).eq('created_by', user?.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase.from('material_transfers').insert(payload);
        error = insertError;
      }
      
      if (error) {
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
      const errorMessage = error.message || (error.code ? `Error ${error.code}: ${error.details || ''}` : JSON.stringify(error));
      Alert.alert('Error Submitting Material', errorMessage || 'Failed to submit entry. Check console for details.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-slate-50 justify-center items-center">
        <ActivityIndicator size="large" color="#d97706" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4 bg-[#d97706]">
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
          <Text className="text-white text-xl font-bold ml-2">Material Transfer</Text>
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
            <View className="bg-amber-100 p-4 rounded-full mb-4">
              <ArrowRightLeft size={64} color="#d97706" />
            </View>
            <Text className="text-2xl font-black text-slate-900 mb-2">Success!</Text>
            <Text className="text-slate-500 text-center mb-8">
              Your material transfer has been {id ? 'updated' : 'submitted'} successfully and is awaiting review.
            </Text>
            <TouchableOpacity 
              className={`w-full bg-[#d97706] rounded-xl py-4 flex-row justify-center items-center ${navigating ? 'opacity-80' : ''}`}
              disabled={navigating}
              onPress={() => {
                setNavigating(true);
                setTimeout(() => {
                  setSuccessVisible(false);
                  setNavigating(false);
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
          <ArrowRightLeft size={24} color="#d97706" />
          <Text className="text-lg font-bold text-[#d97706] ml-2">Transfer Information</Text>
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
          label="From Job"
          required={true}
          value={formData.from_job_id}
          options={jobs}
          onSelect={(v: string) => updateForm('from_job_id', v)}
          placeholder="Select Source Job"
          error={errors.from_job_id}
        />

        <CustomPicker 
          label="To Job"
          required={true}
          value={formData.to_job_id}
          options={jobs}
          onSelect={(v: string) => updateForm('to_job_id', v)}
          placeholder="Select Destination Job"
          error={errors.to_job_id}
        />

        <View className="mb-4">
          <Text className="text-sm font-medium text-slate-700 mb-1">
            Material Description <Text className="text-red-500">*</Text>
          </Text>
          <TextInput
            value={formData.material_description}
            onChangeText={(t) => updateForm('material_description', t)}
            className={`bg-white border ${errors.material_description ? 'border-red-500' : 'border-slate-300'} text-slate-900 rounded-lg px-4 py-3.5`}
            placeholder="e.g. Steel Rebars 12mm"
            placeholderTextColor="#94a3b8"
          />
          {errors.material_description ? <Text className="text-red-500 text-xs mt-1 ml-1">{errors.material_description}</Text> : null}
        </View>

        <View className="flex-row space-x-4 mb-4">
          <View className="flex-1 mr-2">
            <Text className="text-sm font-medium text-slate-700 mb-1">Quantity <Text className="text-red-500">*</Text></Text>
            <TextInput
              value={formData.quantity}
              onChangeText={(t) => updateForm('quantity', t)}
              className={`bg-white border ${errors.quantity ? 'border-red-500' : 'border-slate-300'} text-slate-900 rounded-lg px-4 py-3.5`}
              placeholder="e.g. 5"
              placeholderTextColor="#94a3b8"
              keyboardType="numeric"
            />
            {errors.quantity ? <Text className="text-red-500 text-xs mt-1 ml-1">{errors.quantity}</Text> : null}
          </View>
          <View className="flex-1 ml-2">
            <CustomPicker 
              label="Unit"
              required={true}
              value={formData.unit}
              options={units}
              onSelect={(v: string) => updateForm('unit', v)}
              placeholder="Unit"
            />
          </View>
        </View>

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
            Driver Name
          </Text>
          <TextInput
            value={formData.driver_name}
            onChangeText={(t) => updateForm('driver_name', t)}
            className="bg-white border border-slate-300 text-slate-900 rounded-lg px-4 py-3.5"
            placeholder="Name of Driver"
            placeholderTextColor="#94a3b8"
          />
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

        <View className={`mb-6 bg-white border ${errors.photo ? 'border-red-500' : 'border-slate-200'} rounded-lg p-4`}>
          <Text className="text-slate-700 text-sm font-medium mb-3">
            Material Photo (Live Camera Only) <Text className="text-red-500">*</Text>
          </Text>
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
                    From: {jobs.find((j: any) => j.value === formData.from_job_id)?.label || 'Unknown'}
                  </Text>
                  <Text className="text-white text-xs font-semibold">
                    To: {jobs.find((j: any) => j.value === formData.to_job_id)?.label || 'Unknown'}
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
        <WebCamera onImageCaptured={(uri) => { setPhotoUri(uri); setPhotoCapturedAt(new Date()); }} colorTheme="amber" />
      ) : (
        <TouchableOpacity 
          onPress={pickImage}
          className="bg-amber-50 border-2 border-dashed border-amber-200 rounded-lg py-8 items-center justify-center active:bg-amber-100"
        >
          <Camera size={32} color="#d97706" className="mb-2" />
          <Text className="text-amber-900 font-bold text-base">Take Live Photo</Text>
          <Text className="text-amber-600 text-xs mt-1 text-center px-4">
            Photos are time and location stamped to prevent fraud.
          </Text>
        </TouchableOpacity>
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
          onPress={handleSubmit}
          disabled={submitting}
          className={`w-full py-4 rounded-xl flex-row justify-center items-center ${submitting ? 'bg-slate-400' : 'bg-[#d97706]'}`}
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
