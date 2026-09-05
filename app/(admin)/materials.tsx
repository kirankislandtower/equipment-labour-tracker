import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Platform, Modal, Image, TextInput, useWindowDimensions } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Check, X, Download, Filter, Image as ImageIcon, Building2, Truck, HardHat, Calendar, Clock, AlertCircle } from 'lucide-react-native';
import ConfirmModal from '../../components/ConfirmModal';
import { useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getLocalDateString, getFirstOfMonthString } from '../../lib/dateUtils';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { buildCSV } from '../../lib/csv';

export default function AdminMaterials() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { filter } = useLocalSearchParams<{ filter?: string }>();

  // Default: show current month
  const firstOfMonth = getFirstOfMonthString();
  const todayStr = getLocalDateString();

  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'>(
    (filter as 'ALL' | 'SUBMITTED' | 'APPROVED' | 'REJECTED') || 'SUBMITTED'
  );
  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(todayStr);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const onFromDateChange = (event: any, selectedDate?: Date) => {
    setShowFromPicker(false);
    if (selectedDate) setFromDate(getLocalDateString(selectedDate));
  };

  const onToDateChange = (event: any, selectedDate?: Date) => {
    setShowToPicker(false);
    if (selectedDate) setToDate(getLocalDateString(selectedDate));
  };

  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedRejectId, setSelectedRejectId] = useState<string | null>(null);

  const [confirmApproveId, setConfirmApproveId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    if (filter) {
      setStatusFilter(filter as any);
    }
  }, [filter]);

  useEffect(() => {
    fetchEntries();
  }, [statusFilter, fromDate, toDate]);

  const fetchEntries = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('material_transfers')
        .select(`
          *,
          from_job:from_job_id (job_number, job_name),
          to_job:to_job_id (job_number, job_name)
        `)
        .order('entry_date', { ascending: false });

      if (fromDate && fromDate.length === 10) query = query.gte('entry_date', fromDate);
      if (toDate && toDate.length === 10) query = query.lte('entry_date', toDate);

      if (statusFilter !== 'ALL') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error('Error fetching material entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string, reason: string = '') => {
    setIsUpdating(true);
    try {
      const updateData: any = { status: newStatus };
      if (reason) {
        updateData.rejection_reason = reason;
      }

      const { error } = await supabase
        .from('material_transfers')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
      
      setEntries(entries.map(e => e.id === id ? { ...e, status: newStatus, rejection_reason: reason } : e));
      if (rejectModalVisible) {
        setRejectModalVisible(false);
        setRejectReason('');
      }
      
      showToast(`Successfully marked as ${newStatus}`);
    } catch (error) {
      console.error('Error updating status:', error);
      showToast('Could not update status');
    } finally {
      setIsUpdating(false);
    }
  };

  const submitReject = () => {
    if (selectedRejectId) {
      handleUpdateStatus(selectedRejectId, 'REJECTED', rejectReason);
    }
  };

  const confirmApprove = (id: string) => {
    setConfirmApproveId(id);
  };

  const confirmModalApprove = () => {
    if (selectedEntry) {
      setConfirmApproveId(selectedEntry.id);
    }
  };

  const exportToCSV = async () => {
    try {
      const headers = ['Date', 'From Job', 'To Job', 'Material', 'Quantity', 'Unit', 'Vehicle Number', 'Driver Name', 'Status', 'Foreman', 'Remarks'];
      const rows = entries.map(e => [
        e.entry_date || '', 
        e.from_job?.job_number ? `${e.from_job.job_number} - ${e.from_job.job_name}` : '',
        e.to_job?.job_number ? `${e.to_job.job_number} - ${e.to_job.job_name}` : '',
        e.material_description || '',
        e.quantity || 0,
        e.unit || '',
        e.vehicle_number || '',
        e.driver_name || '',
        e.status || '',
        e.foreman_name || '',
        e.remarks || ''
      ]);

      const csvContent = buildCSV(headers, rows);
      const fileName = `material_transfers_${getLocalDateString()}.csv`;

      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const fileUri = `${FileSystem.documentDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, csvContent, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: 'Export Material Transfers',
          });
        } else {
          Alert.alert('Export Error', 'Sharing is not available on this device');
        }
      }
    } catch (error) {
      console.error('Export error:', error);
      showToast('Failed to generate CSV');
    }
  };

  const StatusPill = ({ status }: { status: string }) => {
    let bg = 'bg-slate-100', text = 'text-slate-600';
    if (status === 'SUBMITTED') { bg = 'bg-yellow-100'; text = 'text-yellow-700'; }
    if (status === 'APPROVED') { bg = 'bg-green-100'; text = 'text-green-700'; }
    if (status === 'REJECTED') { bg = 'bg-red-100'; text = 'text-red-700'; }
    return (
      <View className={`${bg} px-3 py-1 rounded-full self-start`}>
        <Text className={`${text} text-xs font-bold uppercase`}>{status}</Text>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: isMobile ? 16 : 32, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      
      <ConfirmModal 
        visible={!!confirmApproveId}
        title="Approve Entry"
        message="Are you sure you want to approve this entry?"
        confirmText="Approve"
        onConfirm={() => {
          if (confirmApproveId) {
            handleUpdateStatus(confirmApproveId, 'APPROVED');
            if (detailsModalVisible) setDetailsModalVisible(false);
          }
          setConfirmApproveId(null);
        }}
        onCancel={() => setConfirmApproveId(null)}
        isDestructive={false}
      />

      {/* Photo Viewer Modal */}
      <Modal visible={photoModalVisible} transparent animationType="fade" onRequestClose={() => setPhotoModalVisible(false)}>
        <View className="flex-1 bg-black/95">
          <View className="flex-row justify-end p-6 pt-12">
            <TouchableOpacity 
              className="bg-white/20 p-3 rounded-full active:bg-white/30 z-10"
              onPress={() => setPhotoModalVisible(false)}
            >
              <X size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>
          <View className="flex-1 justify-center items-center px-4 pb-12">
            {selectedPhoto && (
              <Image 
                source={{ uri: selectedPhoto }} 
                className="w-full h-full rounded-2xl" 
                resizeMode="contain" 
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Reject Modal */}
      <Modal visible={rejectModalVisible} transparent animationType="fade" onRequestClose={() => setRejectModalVisible(false)}>
        <View className="flex-1 bg-black/60 justify-center items-center p-6">
          <View className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl">
            <Text className="text-xl font-black text-slate-900 mb-2">Reject Transfer</Text>
            <Text className="text-slate-500 mb-6">Please provide a reason for rejecting this material transfer.</Text>
            
            <TextInput
              className="bg-slate-50 border border-slate-300 rounded-xl p-4 text-slate-900 mb-6 min-h-[100px]"
              placeholder="Reason for rejection..."
              placeholderTextColor="#94a3b8"
              multiline
              textAlignVertical="top"
              value={rejectReason}
              onChangeText={setRejectReason}
            />
            
            <View className="flex-row space-x-3">
              <TouchableOpacity 
                className="flex-1 py-3 rounded-xl border border-slate-300 bg-white items-center active:bg-slate-50 mr-2"
                onPress={() => {
                  setRejectModalVisible(false);
                  setRejectReason('');
                }}
              >
                <Text className="font-bold text-slate-700">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className={`flex-1 py-3 rounded-xl items-center flex-row justify-center ml-2 ${!rejectReason.trim() ? 'bg-red-300' : 'bg-red-600 active:bg-red-700'}`}
                disabled={!rejectReason.trim() || isUpdating}
                onPress={submitReject}
              >
                {isUpdating ? <ActivityIndicator size="small" color="#fff" /> : <Text className="font-bold text-white">Reject</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Details Modal */}
      <Modal visible={detailsModalVisible} transparent animationType="slide" onRequestClose={() => setDetailsModalVisible(false)}>
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-white rounded-t-3xl h-[85%] shadow-2xl">
            <View className="flex-row items-center justify-between p-5 border-b border-slate-100">
              <Text className="text-xl font-black text-slate-900">Transfer Details</Text>
              <TouchableOpacity onPress={() => setDetailsModalVisible(false)} className="p-2 bg-slate-100 rounded-full active:bg-slate-200">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            
            {selectedEntry && (
              <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
                <View className="flex-row items-center justify-between mb-8">
                  <StatusPill status={selectedEntry.status} />
                  <Text className="text-slate-500 font-bold">{selectedEntry.entry_date}</Text>
                </View>

                {selectedEntry.status === 'REJECTED' && !!selectedEntry.rejection_reason && (
                  <View className="bg-red-50 border border-red-200 p-4 rounded-xl mb-6 flex-row">
                    <X size={20} color="#dc2626" className="mt-0.5 mr-2" />
                    <View className="flex-1">
                      <Text className="text-red-800 font-bold mb-1">Rejection Reason</Text>
                      <Text className="text-red-600 leading-relaxed">{selectedEntry.rejection_reason}</Text>
                    </View>
                  </View>
                )}

                <View className="bg-slate-50 border border-slate-100 rounded-2xl p-5 mb-6">
                  <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Material</Text>
                  <Text className="text-lg font-bold text-slate-900 mb-1">{selectedEntry.material_description}</Text>
                  <Text className="text-indigo-600 font-bold">Qty: {selectedEntry.quantity} {selectedEntry.unit}</Text>
                </View>

                <View className="flex-row mb-6 gap-x-4">
                  <View className="flex-1 bg-slate-50 border border-slate-100 rounded-2xl p-5">
                    <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">From Site</Text>
                    <Text className="text-slate-900 font-bold">{selectedEntry.from_job?.job_number}</Text>
                    <Text className="text-slate-500 text-sm mt-1">{selectedEntry.from_job?.job_name}</Text>
                  </View>
                  <View className="flex-1 bg-slate-50 border border-slate-100 rounded-2xl p-5">
                    <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">To Site</Text>
                    <Text className="text-slate-900 font-bold">{selectedEntry.to_job?.job_number}</Text>
                    <Text className="text-slate-500 text-sm mt-1">{selectedEntry.to_job?.job_name}</Text>
                  </View>
                </View>

                <View className="bg-slate-50 border border-slate-100 rounded-2xl p-5 mb-6">
                  <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Vehicle Details</Text>
                  
                  <View className="flex-row justify-between items-center mb-4 border-b border-slate-100 pb-4">
                    <Text className="text-slate-500 font-medium">Vehicle Number</Text>
                    <Text className="text-slate-900 font-bold">{selectedEntry.vehicle_number}</Text>
                  </View>
                  <View className="flex-row justify-between items-center">
                    <Text className="text-slate-500 font-medium">Driver</Text>
                    <Text className="text-slate-900 font-bold">{selectedEntry.driver_name || 'N/A'}</Text>
                  </View>
                </View>

                <View className="bg-slate-50 border border-slate-100 rounded-2xl p-5 mb-6">
                  <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Personnel</Text>
                  <View className="flex-row justify-between items-center">
                    <Text className="text-slate-500 font-medium">Foreman</Text>
                    <Text className="text-slate-900 font-bold">{selectedEntry.foreman_name}</Text>
                  </View>
                </View>

                {!!selectedEntry.remarks && (
                  <View className="bg-slate-50 border border-slate-100 rounded-2xl p-5 mb-6">
                    <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Remarks</Text>
                    <Text className="text-slate-700 leading-relaxed">{selectedEntry.remarks}</Text>
                  </View>
                )}

                {!!selectedEntry.photo_url && selectedEntry.photo_url !== 'pending' && (
                  <View className="mb-6">
                    <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 ml-1">Live Photo Evidence</Text>
                    <TouchableOpacity 
                      onPress={() => {
                        setSelectedPhoto(selectedEntry.photo_url);
                        setPhotoModalVisible(true);
                      }}
                      className="border border-slate-200 rounded-2xl overflow-hidden active:opacity-80"
                    >
                      <Image 
                        source={{ uri: selectedEntry.photo_url }} 
                        className="w-full h-48 bg-slate-200" 
                        resizeMode="cover" 
                      />
                      <View className="absolute bottom-3 right-3 bg-black/60 px-3 py-1.5 rounded-full flex-row items-center">
                        <ImageIcon size={14} color="#fff" />
                        <Text className="text-white text-xs font-bold ml-1.5">View Full</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Action Buttons inside Modal */}
                <View className="mt-8 pt-6 border-t border-slate-100 flex-row space-x-3">
                  {selectedEntry.status !== 'REJECTED' && (
                    <TouchableOpacity 
                      onPress={() => {
                        setDetailsModalVisible(false);
                        setSelectedRejectId(selectedEntry.id);
                        setRejectModalVisible(true);
                      }}
                      className="flex-1 bg-red-50 border border-red-200 py-4 rounded-xl items-center active:bg-red-100 flex-row justify-center mr-2"
                    >
                      <X size={20} color="#dc2626" />
                      <Text className="text-red-700 font-bold ml-2">Reject</Text>
                    </TouchableOpacity>
                  )}

                  {selectedEntry.status !== 'APPROVED' && (
                    <TouchableOpacity 
                      onPress={confirmModalApprove}
                      disabled={isUpdating}
                      className="flex-1 bg-green-50 border border-green-200 py-4 rounded-xl items-center active:bg-green-100 flex-row justify-center ml-2"
                    >
                      {isUpdating ? <ActivityIndicator size="small" color="#16a34a" /> : <Check size={20} color="#16a34a" />}
                      <Text className="text-green-700 font-bold ml-2">{isUpdating ? 'Approving...' : 'Approve'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Header and Filters */}
      <View className="flex-row flex-wrap items-center justify-between mb-8 gap-y-4">
        <View>
          <Text className="text-3xl font-black text-slate-900 tracking-tight">Material Transfers</Text>
          <Text className="text-slate-500 mt-1 font-medium text-base">Review and manage material shifting</Text>
        </View>

        <TouchableOpacity 
          onPress={exportToCSV}
          className="bg-indigo-600 px-4 py-2.5 rounded-xl flex-row items-center active:bg-indigo-700 shadow-sm"
        >
          <Download size={18} color="#ffffff" />
          <Text className="text-white font-bold ml-2">Export CSV</Text>
        </TouchableOpacity>
      </View>

      <View className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-6">
        <View className={`flex-row ${isMobile ? 'flex-col gap-y-4' : 'items-center justify-between'}`}>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className={`flex-row ${isMobile ? '-mx-4 px-4' : ''}`}>
            <View className="flex-row items-center gap-x-2">
              {(['ALL', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const).map(status => (
                <TouchableOpacity
                  key={status}
                  onPress={() => setStatusFilter(status)}
                  className={`px-4 py-2 rounded-lg border ${statusFilter === status ? 'bg-slate-900 border-slate-900' : 'bg-slate-50 border-slate-200'}`}
                >
                  <Text className={`font-bold text-sm ${statusFilter === status ? 'text-white' : 'text-slate-600'}`}>
                    {status === 'ALL' ? 'All' : status}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View className={`flex-row ${isMobile ? 'flex-col gap-y-3' : 'items-center gap-x-3'}`}>
            <View className={`flex-row items-center ${isMobile ? 'justify-between' : ''}`}>
              <Text className="text-slate-500 font-medium mr-2">From</Text>
              {Platform.OS === 'web' ? (
                <View className={`bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex-row items-center ${isMobile ? 'flex-1 ml-2' : ''}`}>
                  <Calendar size={16} color="#64748b" className="mr-2" />
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', color: '#0f172a', fontWeight: '600', width: '100%' }}
                  />
                </View>
              ) : (
                <>
                  <TouchableOpacity 
                    onPress={() => setShowFromPicker(true)}
                    className={`bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex-row items-center ${isMobile ? 'flex-1 ml-2 justify-between' : ''}`}
                  >
                    <View className="flex-row items-center">
                      <Calendar size={16} color="#64748b" className="mr-2" />
                      <Text className="text-slate-900 font-semibold">{fromDate}</Text>
                    </View>
                  </TouchableOpacity>
                  {showFromPicker && (
                    <DateTimePicker
                      value={new Date(fromDate)}
                      mode="date"
                      onChange={onFromDateChange}
                    />
                  )}
                </>
              )}
            </View>

            <View className={`flex-row items-center ${isMobile ? 'justify-between' : ''}`}>
              <Text className="text-slate-500 font-medium mr-2 w-[34px]">To</Text>
              {Platform.OS === 'web' ? (
                <View className={`bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex-row items-center ${isMobile ? 'flex-1 ml-2' : ''}`}>
                  <Calendar size={16} color="#64748b" className="mr-2" />
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', color: '#0f172a', fontWeight: '600', width: '100%' }}
                  />
                </View>
              ) : (
                <>
                  <TouchableOpacity 
                    onPress={() => setShowToPicker(true)}
                    className={`bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex-row items-center ${isMobile ? 'flex-1 ml-2 justify-between' : ''}`}
                  >
                    <View className="flex-row items-center">
                      <Calendar size={16} color="#64748b" className="mr-2" />
                      <Text className="text-slate-900 font-semibold">{toDate}</Text>
                    </View>
                  </TouchableOpacity>
                  {showToPicker && (
                    <DateTimePicker
                      value={new Date(toDate)}
                      mode="date"
                      onChange={onToDateChange}
                    />
                  )}
                </>
              )}
            </View>
          </View>
        </View>
      </View>

      {toastMessage && (
        <View className="absolute top-8 left-1/2 -translate-x-1/2 z-50 bg-slate-900 px-6 py-3 rounded-full shadow-lg flex-row items-center">
          <Check size={18} color="#4ade80" />
          <Text className="text-white font-semibold ml-2">{toastMessage}</Text>
        </View>
      )}

      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#4f46e5" />
          <Text className="text-slate-500 mt-4 font-medium">Loading entries...</Text>
        </View>
      ) : entries.length === 0 ? (
        <View className="flex-1 justify-center items-center bg-white rounded-3xl border border-slate-200">
          <View className="bg-slate-50 p-6 rounded-full mb-4">
            <Filter size={48} color="#94a3b8" />
          </View>
          <Text className="text-xl font-bold text-slate-700 mb-1">No Entries Found</Text>
          <Text className="text-slate-500 text-center max-w-sm">
            Try adjusting your date range or status filters to find what you're looking for.
          </Text>
        </View>
      ) : (
        isMobile ? (
          <View className="flex-1 -mx-4 px-4">
            {entries.map((entry) => (
              <TouchableOpacity 
                key={entry.id} 
                onPress={() => {
                  setSelectedEntry(entry);
                  setDetailsModalVisible(true);
                }}
                className="bg-white rounded-2xl p-5 mb-4 border border-slate-200 shadow-sm active:opacity-70"
              >
                <View className="flex-row justify-between items-start mb-4">
                  <View>
                    <Text className="text-slate-500 text-xs font-bold mb-1">{entry.entry_date}</Text>
                    <Text className="text-slate-900 font-black text-lg">{entry.material_description}</Text>
                    <Text className="text-indigo-600 font-bold mt-1">Qty: {entry.quantity} {entry.unit}</Text>
                  </View>
                  <StatusPill status={entry.status} />
                </View>

                <View className="flex-row bg-slate-50 p-3 rounded-xl border border-slate-100 mb-4 gap-x-4">
                  <View className="flex-1">
                    <Text className="text-slate-400 text-[10px] font-bold uppercase">From Site</Text>
                    <Text className="text-slate-900 font-bold text-sm mt-0.5" numberOfLines={1}>{entry.from_job?.job_number}</Text>
                  </View>
                  <View className="w-px bg-slate-200" />
                  <View className="flex-1">
                    <Text className="text-slate-400 text-[10px] font-bold uppercase">To Site</Text>
                    <Text className="text-slate-900 font-bold text-sm mt-0.5" numberOfLines={1}>{entry.to_job?.job_number}</Text>
                  </View>
                </View>
                <View className="flex-row items-center pt-4 border-t border-slate-100 mb-3">
                  <View className="w-8 h-8 rounded-full bg-slate-200 items-center justify-center mr-2">
                    <Text className="text-slate-600 font-bold text-xs">
                      {entry.foreman_name ? entry.foreman_name.substring(0, 2).toUpperCase() : 'FM'}
                    </Text>
                  </View>
                  <View>
                    <Text className="text-slate-900 text-xs font-bold">{entry.foreman_name}</Text>
                    <Text className="text-slate-400 text-[10px]">Foreman</Text>
                  </View>
                </View>
                
                <View className="flex-row justify-end space-x-3 pt-3 border-t border-slate-100">
                  {entry.photo_url && entry.photo_url !== 'pending' && (
                    <TouchableOpacity 
                      onPress={(e) => {
                        e.stopPropagation();
                        setSelectedPhoto(entry.photo_url);
                        setPhotoModalVisible(true);
                      }}
                      className="bg-indigo-50 p-2 rounded-lg border border-indigo-100 mr-2"
                    >
                      <ImageIcon size={18} color="#4f46e5" />
                    </TouchableOpacity>
                  )}
                  {entry.status === 'SUBMITTED' && (
                    <TouchableOpacity 
                      onPress={() => confirmApprove(entry.id)}
                      className="bg-green-100 p-2 rounded-lg border border-green-200 active:bg-green-200 flex-row items-center px-3"
                    >
                      <Check size={18} color="#16a34a" />
                      <Text className="text-green-700 font-bold ml-1 text-xs">Approve</Text>
                    </TouchableOpacity>
                  )}
                  {entry.status === 'SUBMITTED' && (
                    <TouchableOpacity 
                      onPress={() => {
                        setSelectedRejectId(entry.id);
                        setRejectModalVisible(true);
                      }}
                      className="bg-red-100 p-2 rounded-lg border border-red-200 active:bg-red-200 flex-row items-center px-3"
                    >
                      <X size={18} color="#dc2626" />
                      <Text className="text-red-700 font-bold ml-1 text-xs">Reject</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                {/* Table Header */}
                <View className="flex-row border-b border-slate-200 bg-slate-50 py-4 px-6">
                  <Text className="w-28 text-xs font-black text-slate-500 uppercase tracking-widest">Date</Text>
                  <Text className="w-32 text-xs font-black text-slate-500 uppercase tracking-widest">Status</Text>
                  <Text className="w-48 text-xs font-black text-slate-500 uppercase tracking-widest">Material</Text>
                  <Text className="w-24 text-xs font-black text-slate-500 uppercase tracking-widest">Qty</Text>
                  <Text className="w-32 text-xs font-black text-slate-500 uppercase tracking-widest">From Job</Text>
                  <Text className="w-32 text-xs font-black text-slate-500 uppercase tracking-widest">To Job</Text>
                  <Text className="w-32 text-xs font-black text-slate-500 uppercase tracking-widest">Vehicle</Text>
                  <Text className="w-40 text-xs font-black text-slate-500 uppercase tracking-widest">Foreman</Text>
                  <Text className="w-40 text-xs font-black text-slate-500 uppercase tracking-widest text-center">Actions</Text>
                </View>

                {/* Table Body */}
                <View>
                  {entries.map((entry) => (
                    <TouchableOpacity 
                      key={entry.id} 
                      onPress={() => {
                        setSelectedEntry(entry);
                        setDetailsModalVisible(true);
                      }}
                      className="flex-row items-center border-b border-slate-100 py-4 px-6 hover:bg-slate-50 active:bg-slate-100"
                    >
                      <Text className="w-28 text-sm font-medium text-slate-900">{entry.entry_date}</Text>
                      <View className="w-32">
                        <StatusPill status={entry.status} />
                      </View>
                      <Text className="w-48 text-sm font-bold text-slate-900">{entry.material_description}</Text>
                      <Text className="w-24 text-sm font-bold text-indigo-600">{entry.quantity} {entry.unit}</Text>
                      <View className="w-32 pr-4">
                        <Text className="text-sm font-bold text-slate-900" numberOfLines={1}>{entry.from_job?.job_number}</Text>
                      </View>
                      <View className="w-32 pr-4">
                        <Text className="text-sm font-bold text-slate-900" numberOfLines={1}>{entry.to_job?.job_number}</Text>
                      </View>
                      <Text className="w-32 text-sm font-medium text-slate-600">{entry.vehicle_number}</Text>
                      <Text className="w-40 text-sm font-medium text-slate-900">{entry.foreman_name}</Text>
                      <View className="w-40 flex-row items-center justify-center space-x-2">
                        {entry.photo_url && entry.photo_url !== 'pending' && (
                          <TouchableOpacity 
                            onPress={(e) => {
                              e.stopPropagation();
                              setSelectedPhoto(entry.photo_url);
                              setPhotoModalVisible(true);
                            }}
                            className="bg-indigo-50 p-2 rounded-lg border border-indigo-100 mr-2"
                          >
                            <ImageIcon size={18} color="#4f46e5" />
                          </TouchableOpacity>
                        )}
                        {entry.status === 'SUBMITTED' && (
                          <TouchableOpacity 
                            onPress={() => confirmApprove(entry.id)}
                            className="bg-green-100 p-2 rounded-lg border border-green-200 active:bg-green-200"
                          >
                            <Check size={18} color="#16a34a" />
                          </TouchableOpacity>
                        )}
                        {entry.status === 'SUBMITTED' && (
                          <TouchableOpacity 
                            onPress={() => {
                              setSelectedRejectId(entry.id);
                              setRejectModalVisible(true);
                            }}
                            className="bg-red-100 p-2 rounded-lg border border-red-200 active:bg-red-200"
                          >
                            <X size={18} color="#dc2626" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>
          </View>
        )
      )}
      </ScrollView>
    </View>
  );
}
