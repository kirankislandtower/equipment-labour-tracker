import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Platform, Modal, Image, TextInput, useWindowDimensions, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Check, X, Download, Filter, Image as ImageIcon, Calendar } from 'lucide-react-native';
import ConfirmModal from '../../components/ConfirmModal';
import { useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getLocalDateString, getFirstOfMonthString } from '../../lib/dateUtils';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { buildCSV } from '../../lib/csv';

export default function AdminEquipment() {
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

  // When URL param changes, update the filter state
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
        .from('equipment_entries')
        .select(`
          *,
          jobs:job_id (job_number, job_name),
          suppliers:supplier_id (supplier_name),
          equipment_master:equipment_master_id (equipment_name)
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
      console.error('Error fetching equipment entries:', error);
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
        .from('equipment_entries')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
      
      // Update local state
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
      const headers = ['Date', 'Job Number', 'Job Name', 'Supplier', 'Equipment', 'Hours', 'Status', 'Foreman', 'Remarks', 'Fuel Provided', 'Fuel Qty', 'Fuel Unit'];
      const rows = entries.map(e => [
        e.entry_date || '', 
        e.jobs?.job_number || '',
        e.jobs?.job_name || '', 
        e.suppliers?.supplier_name || '', 
        e.equipment_master?.equipment_name || '',
        e.working_hours || 0,
        e.status || '',
        e.foreman_name || '',
        e.remarks || '',
        e.fuel_provided ? 'Yes' : 'No',
        e.fuel_quantity || '',
        e.fuel_unit || ''
      ]);

      const csvContent = buildCSV(headers, rows);
      const fileName = `equipment_entries_${getLocalDateString()}.csv`;

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
            dialogTitle: 'Export Equipment Entries',
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
                style={{ width: '100%', height: '100%', resizeMode: 'contain' }} 
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Reject Reason Modal */}
      <Modal visible={rejectModalVisible} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center p-8">
          <View className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl">
            <Text className="text-xl font-bold text-slate-900 mb-2">Reject Entry</Text>
            <Text className="text-slate-500 mb-4">Please provide a reason for rejecting this entry so the foreman can correct it.</Text>
            
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="e.g. Photo is blurry, hours incorrect..."
              placeholderTextColor="#94a3b8"
              className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 mb-6"
              multiline
              numberOfLines={3}
              style={{ textAlignVertical: 'top' }}
            />
            
            <View className="flex-row gap-x-3">
              <TouchableOpacity 
                onPress={() => {
                  setRejectModalVisible(false);
                  setRejectReason('');
                  setSelectedRejectId(null);
                }}
                className="flex-1 bg-slate-100 py-3 rounded-xl items-center"
              >
                <Text className="font-bold text-slate-700">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={submitReject}
                className="flex-1 bg-red-600 py-3 rounded-xl items-center shadow-sm"
              >
                <Text className="font-bold text-white">Confirm Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View className={`flex-row justify-between items-center mb-8 ${isMobile ? 'flex-wrap gap-y-4' : ''}`}>
        <View>
          <Text className="text-slate-900 text-3xl font-black tracking-tight">Equipment Entries</Text>
          <Text className="text-slate-500 text-base mt-2">Manage and review daily equipment logs.</Text>
        </View>
        
        <TouchableOpacity 
          onPress={exportToCSV}
          className="flex-row items-center bg-[#1e3a8a] px-5 py-3 rounded-xl active:bg-blue-800 shadow-sm"
        >
          <Download size={20} color="#ffffff" />
          <Text className="text-white font-bold ml-2">Export CSV</Text>
        </TouchableOpacity>
      </View>

      {/* Date Range Filter */}
      <View className={`mb-5 ${isMobile ? 'flex-col gap-3' : 'flex-row items-center gap-3'}`}>
        <TouchableOpacity 
          className="flex-row items-center bg-white border border-slate-200 rounded-xl px-4 py-3 flex-1"
          onPress={() => Platform.OS !== 'web' && setShowFromPicker(true)}
        >
          <Calendar size={16} color="#64748b" />
          <Text className="text-slate-500 text-xs font-bold ml-2 mr-3">FROM</Text>
          {Platform.OS === 'web' ? (
            // @ts-ignore
            <input
              type="date"
              value={fromDate}
              onChange={(e: any) => setFromDate(e.target.value)}
              style={{ border: 'none', outline: 'none', flex: 1, fontWeight: 'bold', backgroundColor: 'transparent', color: '#0f172a', fontSize: '16px' }}
            />
          ) : (
            <Text className="flex-1 text-slate-900 font-bold text-base h-6">{fromDate}</Text>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity 
          className="flex-row items-center bg-white border border-slate-200 rounded-xl px-4 py-3 flex-1"
          onPress={() => Platform.OS !== 'web' && setShowToPicker(true)}
        >
          <Calendar size={16} color="#64748b" />
          <Text className="text-slate-500 text-xs font-bold ml-2 mr-3">TO</Text>
          {Platform.OS === 'web' ? (
            // @ts-ignore
            <input
              type="date"
              value={toDate}
              onChange={(e: any) => setToDate(e.target.value)}
              style={{ border: 'none', outline: 'none', flex: 1, fontWeight: 'bold', backgroundColor: 'transparent', color: '#0f172a', fontSize: '16px' }}
            />
          ) : (
            <Text className="flex-1 text-slate-900 font-bold text-base h-6">{toDate}</Text>
          )}
        </TouchableOpacity>

        {showFromPicker && (
          <DateTimePicker
            value={new Date(fromDate)}
            mode="date"
            display="default"
            onChange={onFromDateChange}
          />
        )}
        {showToPicker && (
          <DateTimePicker
            value={new Date(toDate)}
            mode="date"
            display="default"
            onChange={onToDateChange}
          />
        )}
      </View>

      <View className={`flex-row mb-6 ${isMobile ? 'flex-wrap gap-2' : 'gap-x-2'}`}>
        {['SUBMITTED', 'APPROVED', 'REJECTED', 'ALL'].map((filter) => (
          <TouchableOpacity 
            key={filter}
            onPress={() => setStatusFilter(filter as any)}
            className={`px-4 py-2 rounded-lg border ${statusFilter === filter ? 'bg-slate-800 border-slate-800' : 'bg-white border-slate-300'}`}
          >
            <Text className={`font-semibold ${statusFilter === filter ? 'text-white' : 'text-slate-600'}`}>{filter}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View className="bg-transparent overflow-hidden">
        <View className={`${isMobile ? '' : 'bg-white rounded-2xl shadow-sm border border-slate-200'} pb-4`}>
          {!isMobile && (
            <View className="flex-row bg-slate-100 border-b border-slate-200 p-4 rounded-t-2xl">
              <Text className="flex-1 font-bold text-slate-700 text-sm">Date</Text>
              <Text className="flex-2 font-bold text-slate-700 text-sm" style={{flex: 2}}>Job</Text>
              <Text className="flex-2 font-bold text-slate-700 text-sm" style={{flex: 2}}>Equipment</Text>
              <Text className="flex-1 font-bold text-slate-700 text-sm">Foreman</Text>
              <Text className="flex-1 font-bold text-slate-700 text-sm text-center">Status</Text>
              <Text className="flex-1 font-bold text-slate-700 text-sm text-right">Actions</Text>
            </View>
          )}

          {loading ? (
            <View className="flex-1 justify-center items-center py-20">
              <ActivityIndicator size="large" color="#1e3a8a" />
            </View>
          ) : (
            <View className="flex-col">
              {entries.length === 0 ? (
                <View className="py-20 items-center">
                  <Text className="text-slate-500 font-medium">No entries found for this status.</Text>
                </View>
              ) : (
                entries.map((entry, index) => (
                  <TouchableOpacity 
                    key={entry.id} 
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedEntry(entry);
                      setDetailsModalVisible(true);
                    }}
                    className={`${isMobile ? 'bg-white mb-3 p-4 rounded-xl shadow-sm border border-slate-100 flex-col' : `flex-row items-center p-4 border-b border-slate-100 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}`}
                  >
                    {isMobile ? (
                      // Mobile Card View
                      <View className="flex-col">
                        <View className="flex-row justify-between items-center mb-3">
                          <Text className="text-slate-900 font-bold">{entry.entry_date}</Text>
                          <StatusPill status={entry.status} />
                        </View>
                        
                        <View className="flex-row justify-between mb-3 border-b border-slate-100 pb-3">
                          <View className="flex-1">
                            <Text className="text-xs font-bold text-slate-400 mb-1 uppercase">Job Details</Text>
                            <Text className="text-slate-900 font-bold">{entry.jobs?.job_number}</Text>
                            <Text className="text-slate-500 text-xs" numberOfLines={1}>{entry.jobs?.job_name}</Text>
                          </View>
                          <View className="items-end">
                            <Text className="text-xs font-bold text-slate-400 mb-1 uppercase">Hours</Text>
                            <Text className="text-slate-900 font-black text-lg">{entry.working_hours}</Text>
                          </View>
                        </View>

                        <View className="mb-4">
                          <Text className="text-xs font-bold text-slate-400 mb-1 uppercase">Equipment</Text>
                          <Text className="text-slate-900 font-bold">{entry.equipment_master?.equipment_name}</Text>
                          <Text className="text-slate-500 text-xs">{entry.suppliers?.supplier_name}</Text>
                        </View>
                        
                        <View className="flex-row justify-end space-x-3 pt-3 border-t border-slate-100">
                          {entry.equipment_photo_url && entry.equipment_photo_url !== 'pending' && entry.equipment_photo_url !== 'NOT_REQUIRED' && (
                            <TouchableOpacity 
                              onPress={() => {
                                setSelectedPhoto(entry.equipment_photo_url);
                                setPhotoModalVisible(true);
                              }}
                              className="bg-blue-100 p-2 rounded-lg border border-blue-200 active:bg-blue-200"
                            >
                              <ImageIcon size={18} color="#1e3a8a" />
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
                      </View>
                    ) : (
                      // Desktop Table View
                      <>
                        <Text className="flex-1 text-slate-900 font-medium">{entry.entry_date}</Text>
                        <View style={{flex: 2}}>
                          <Text className="text-slate-900 font-bold">{entry.jobs?.job_number}</Text>
                          <Text className="text-slate-500 text-xs" numberOfLines={1}>{entry.jobs?.job_name}</Text>
                        </View>
                        <View style={{flex: 2}}>
                          <Text className="text-slate-900 font-bold">{entry.equipment_master?.equipment_name}</Text>
                          <Text className="text-slate-500 text-xs">{entry.suppliers?.supplier_name}</Text>
                        </View>
                        <Text className="flex-1 text-slate-900 font-medium" numberOfLines={1}>{entry.foreman_name}</Text>
                        <View className="flex-1 items-center justify-center">
                          <StatusPill status={entry.status} />
                        </View>
                        <View className="flex-1 flex-row justify-end space-x-2">
                          {entry.equipment_photo_url && entry.equipment_photo_url !== 'pending' && entry.equipment_photo_url !== 'NOT_REQUIRED' && (
                            <TouchableOpacity 
                              onPress={() => {
                                setSelectedPhoto(entry.equipment_photo_url);
                                setPhotoModalVisible(true);
                              }}
                              className="bg-blue-100 p-2 rounded-lg border border-blue-200 active:bg-blue-200"
                            >
                              <ImageIcon size={18} color="#1e3a8a" />
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
                      </>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </View>
      </View>
      </ScrollView>

      {/* Details Modal */}
      <Modal visible={detailsModalVisible} transparent animationType="slide" onRequestClose={() => setDetailsModalVisible(false)}>
        <View className="flex-1 bg-slate-900/60 justify-end">
          <View className="bg-white rounded-t-[32px] p-6 max-h-[90%]">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-black text-slate-900">Entry Details</Text>
              <TouchableOpacity onPress={() => setDetailsModalVisible(false)} className="bg-slate-100 p-2 rounded-full active:bg-slate-200">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            
            {selectedEntry && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }} style={{ minHeight: 0 }}>
                <View className="flex-row justify-between mb-4">
                  <View>
                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Date</Text>
                    <Text className="text-slate-900 font-bold text-lg">{selectedEntry.entry_date}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Status</Text>
                    <StatusPill status={selectedEntry.status} />
                  </View>
                </View>
                
                <View className="h-px bg-slate-100 w-full mb-4" />
                
                <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Job Details</Text>
                <Text className="text-slate-900 font-bold text-base">{selectedEntry.jobs?.job_number}</Text>
                <Text className="text-slate-500 mb-4">{selectedEntry.jobs?.job_name}</Text>

                <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Equipment</Text>
                <Text className="text-slate-900 font-bold text-base">{selectedEntry.equipment_master?.equipment_name}</Text>
                <Text className="text-slate-500 mb-4">{selectedEntry.suppliers?.supplier_name}</Text>

                <View className="flex-row justify-between mb-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Start Time</Text>
                    <Text className="text-slate-900 font-bold text-lg">{selectedEntry.start_time || 'N/A'}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1">End Time</Text>
                    <Text className="text-slate-900 font-bold text-lg">{selectedEntry.end_time || 'N/A'}</Text>
                  </View>
                </View>

                <View className="flex-row justify-between mb-6">
                  <View className="flex-1 bg-slate-50 p-4 rounded-2xl border border-slate-100 mr-2">
                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Break</Text>
                    <Text className="text-slate-900 font-bold text-lg">{selectedEntry.break_hours || 0} hr</Text>
                  </View>
                  <View className="flex-1 bg-blue-50 p-4 rounded-2xl border border-blue-100 ml-2">
                    <Text className="text-xs font-bold text-blue-600 uppercase mb-1">Total</Text>
                    <Text className="text-blue-700 font-black text-2xl">{selectedEntry.working_hours} hr</Text>
                  </View>
                </View>

                {selectedEntry.fuel_provided && (
                  <View className="mb-4 bg-amber-50 p-4 rounded-2xl border border-amber-100 flex-row justify-between items-center">
                    <View>
                      <Text className="text-xs font-bold text-amber-600 uppercase mb-1">Fuel Provided</Text>
                      <Text className="text-amber-800 font-bold">Yes</Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-xs font-bold text-amber-600 uppercase mb-1">Quantity</Text>
                      <Text className="text-amber-800 font-bold">{selectedEntry.fuel_quantity} {selectedEntry.fuel_unit}</Text>
                    </View>
                  </View>
                )}

                {!!selectedEntry.remarks && (
                  <View className="mb-4">
                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Remarks</Text>
                    <View className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <Text className="text-slate-700 italic">"{selectedEntry.remarks}"</Text>
                    </View>
                  </View>
                )}

                {!!selectedEntry.rejection_reason && (
                  <View className="mb-4">
                    <Text className="text-xs font-bold text-red-400 uppercase mb-1">Rejection Reason</Text>
                    <View className="bg-red-50 p-4 rounded-2xl border border-red-100">
                      <Text className="text-red-700 font-medium">{selectedEntry.rejection_reason}</Text>
                    </View>
                  </View>
                )}
                
                <View className="mt-2 flex-row justify-between items-center">
                  <View>
                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Submitted By</Text>
                    <Text className="text-slate-700 font-medium">{selectedEntry.foreman_name}</Text>
                  </View>
                  <View>
                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1 text-right">Submitted At</Text>
                    <Text className="text-slate-700 font-medium text-right">
                      {new Date(selectedEntry.created_at).toLocaleDateString()} at {new Date(selectedEntry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>

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

      {/* Toast Notification */}
      {toastMessage && (
        <View className="absolute bottom-10 left-0 right-0 items-center pointer-events-none z-50">
          <View className="bg-slate-800 px-6 py-3 rounded-full flex-row items-center shadow-lg">
            <Check size={20} color="#4ade80" />
            <Text className="text-white font-bold ml-2">{toastMessage}</Text>
          </View>
        </View>
      )}
    </View>
  );
}
