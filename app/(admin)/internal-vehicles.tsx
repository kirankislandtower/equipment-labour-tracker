import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Platform, Modal, Image, TextInput, useWindowDimensions, Alert, Animated } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Check, X, Download, Image as ImageIcon, Calendar, AlertTriangle } from 'lucide-react-native';
import ConfirmModal from '../../components/ConfirmModal';
import { useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getLocalDateString, getFirstOfMonthString, getEarlySubmissionFlag, formatSubmittedAt } from '../../lib/dateUtils';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { buildCSV } from '../../lib/csv';
import { FadeInUp } from '../../components/Animations';
import JobFilterSelect, { JobOption } from '../../components/JobFilterSelect';
import ScrollToTopButton from '../../components/ScrollToTopButton';
import ScrollProgressBar from '../../components/ScrollProgressBar';

const COMPANY_LABELS: Record<string, string> = {
  IST: 'Island Tower Electromechanical (IST)',
  JAH: 'Jazeerat Al Hadeed (JAH)',
  HYDRO: 'Hydro',
};

export default function AdminInternalVehicles() {
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
  const [companyFilter, setCompanyFilter] = useState<'ALL' | 'IST' | 'JAH' | 'HYDRO'>('ALL');
  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(todayStr);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [jobFilter, setJobFilter] = useState('ALL');
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
  // Drivers don't know the rate, so the foreman-side input is locked at 0 --
  // only an admin can set it, here in the detail view.
  const [rateAmountInput, setRateAmountInput] = useState('');
  const [savingRate, setSavingRate] = useState(false);

  const handleSaveRate = async () => {
    if (!selectedEntry) return;
    const parsed = parseFloat(rateAmountInput);
    const newRate = isNaN(parsed) ? 0 : parsed;
    setSavingRate(true);
    try {
      const { error } = await supabase.from('internal_vehicle_entries').update({ rate_amount: newRate }).eq('id', selectedEntry.id);
      if (error) throw error;
      setSelectedEntry((prev: any) => prev ? { ...prev, rate_amount: newRate } : prev);
      setEntries(prev => prev.map(e => e.id === selectedEntry.id ? { ...e, rate_amount: newRate } : e));
      showToast('Rate updated');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not update rate');
    } finally {
      setSavingRate(false);
    }
  };

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
    supabase.from('jobs').select('id, job_number, job_name').order('job_number').then(({ data }) => {
      if (data) setJobs(data);
    });
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [companyFilter, fromDate, toDate, jobFilter]);

  const fetchEntries = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('internal_vehicle_entries')
        .select(`
          *,
          internal_vehicles:internal_vehicle_id (vehicle_number, vehicle_type),
          internal_vehicle_drivers:driver_id (name),
          jobs:job_id (job_number, job_name)
        `)
        .order('entry_date', { ascending: false });

      if (fromDate && fromDate.length === 10) query = query.gte('entry_date', fromDate);
      if (toDate && toDate.length === 10) query = query.lte('entry_date', toDate);
      if (jobFilter !== 'ALL') query = query.eq('job_id', jobFilter);

      // Status filter is applied client-side (see statusCounts/filteredEntries below)
      // so all status counts can be shown on the filter pills at once.

      if (companyFilter !== 'ALL') {
        query = query.eq('company', companyFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error('Error fetching internal vehicle entries:', error);
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
        .from('internal_vehicle_entries')
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
      const headers = ['Date', 'Company', 'Requester Name', 'Driver Name', 'Vehicle No', 'Vehicle Type', 'Job Number', 'Job Name', 'From Location', 'To Location', 'Section', 'Basis', 'Start', 'End', 'Total Working Hours', 'Trip', 'Rate / Amount - AED', 'IST Timesheet Number', 'Status', 'Remarks'];
      const rows = filteredEntries.map(e => [
        e.entry_date || '',
        COMPANY_LABELS[e.company] || e.company || '',
        e.requester_name || '',
        e.internal_vehicle_drivers?.name || '',
        e.internal_vehicles?.vehicle_number || '',
        e.internal_vehicles?.vehicle_type || '',
        e.jobs?.job_number || '',
        e.jobs?.job_name || '',
        e.from_location || '',
        e.to_location || '',
        e.section || '',
        e.basis === 'TRIP_BASIS' ? 'Trip Basis' : 'Hourly',
        e.start_time || '',
        e.end_time || '',
        e.working_hours || 0,
        e.number_of_trips || 0,
        e.rate_amount || '',
        e.ist_timesheet_number || '',
        e.status || '',
        e.remarks || '',
      ]);

      const csvContent = buildCSV(headers, rows);
      const fileName = `internal_vehicle_entries_${getLocalDateString()}.csv`;

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
            dialogTitle: 'Export Internal Vehicle Entries',
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

  // Flags an entry whose submission timestamp is earlier than the work period it
  // claims -- the exact fraud pattern of pre-filling a full day's hours and
  // submitting before the shift even begins.
  const EarlyFlagBadge = ({ entry, className = '' }: { entry: any; className?: string }) => {
    const flag = getEarlySubmissionFlag(entry);
    if (!flag) return null;
    const isSevere = flag === 'BEFORE_START';
    return (
      <View className={`${isSevere ? 'bg-red-100 border-red-200' : 'bg-amber-100 border-amber-200'} border px-2.5 py-1 rounded-full flex-row items-center self-start ${className}`}>
        <AlertTriangle size={11} color={isSevere ? '#dc2626' : '#d97706'} />
        <Text className={`${isSevere ? 'text-red-700' : 'text-amber-700'} text-[10px] font-bold uppercase ml-1`}>
          {isSevere ? 'Submitted Before Start' : 'Submitted Before Finish'}
        </Text>
      </View>
    );
  };

  const statusCounts = {
    SUBMITTED: entries.filter(e => e.status === 'SUBMITTED').length,
    APPROVED: entries.filter(e => e.status === 'APPROVED').length,
    REJECTED: entries.filter(e => e.status === 'REJECTED').length,
    ALL: entries.length,
  };
  const filteredEntries = statusFilter === 'ALL' ? entries : entries.filter(e => e.status === statusFilter);

  const scrollViewRef = useRef<ScrollView>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [scrollContainerHeight, setScrollContainerHeight] = useState(0);
  const [scrollContentHeight, setScrollContentHeight] = useState(0);

  return (
    <FadeInUp style={{ flex: 1 }}>
    <View className="flex-1 bg-slate-50">

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

      <ScrollProgressBar scrollY={scrollY} contentHeight={scrollContentHeight} containerHeight={scrollContainerHeight} color="#6d28d9" />

      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        contentContainerStyle={{ padding: isMobile ? 16 : 32, paddingBottom: 100 }}
        showsVerticalScrollIndicator={!isMobile}
        onLayout={(e) => setScrollContainerHeight(e.nativeEvent.layout.height)}
        onContentSizeChange={(w, h) => setScrollContentHeight(h)}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false, listener: (e: any) => setShowScrollTop(e.nativeEvent.contentOffset.y > 400) }
        )}
        scrollEventThrottle={16}
      >
      <View className={`flex-row justify-between items-center mb-8 ${isMobile ? 'flex-wrap gap-y-4' : ''}`}>
        <View>
          <Text className="text-slate-900 text-3xl font-black tracking-tight">Internal Vehicle Entries</Text>
          <Text className="text-slate-500 text-base mt-2">Manage and review daily internal vehicle usage logs.</Text>
        </View>

        <TouchableOpacity
          onPress={exportToCSV}
          className="flex-row items-center bg-[#6d28d9] px-5 py-3 rounded-xl active:bg-violet-800 shadow-sm"
        >
          <Download size={20} color="#ffffff" />
          <Text className="text-white font-bold ml-2">Export CSV</Text>
        </TouchableOpacity>
      </View>

      {/* Sticky: stays pinned at the top once scrolled past, while the table keeps scrolling underneath it */}
      <View style={{ position: 'sticky' as any, top: 0, zIndex: 10, backgroundColor: '#f8fafc', paddingTop: 8, paddingBottom: 8 }}>
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

          <JobFilterSelect jobs={jobs} value={jobFilter} onChange={setJobFilter} />

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

        <View className={`flex-row mb-3 ${isMobile ? 'flex-wrap gap-2' : 'gap-x-2'}`}>
          {['SUBMITTED', 'APPROVED', 'REJECTED', 'ALL'].map((filterOpt) => (
            <TouchableOpacity
              key={filterOpt}
              onPress={() => setStatusFilter(filterOpt as any)}
              className={`px-4 py-2 rounded-lg border ${statusFilter === filterOpt ? 'bg-slate-800 border-slate-800' : 'bg-white border-slate-300'}`}
            >
              <Text className={`font-semibold ${statusFilter === filterOpt ? 'text-white' : 'text-slate-600'}`}>{filterOpt} ({statusCounts[filterOpt as keyof typeof statusCounts]})</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View className={`flex-row ${isMobile ? 'flex-wrap gap-2' : 'gap-x-2'}`}>
          {['ALL', 'IST', 'JAH', 'HYDRO'].map((opt) => (
            <TouchableOpacity
              key={opt}
              onPress={() => setCompanyFilter(opt as any)}
              className={`px-4 py-2 rounded-lg border ${companyFilter === opt ? 'bg-[#6d28d9] border-[#6d28d9]' : 'bg-white border-slate-300'}`}
            >
              <Text className={`font-semibold ${companyFilter === opt ? 'text-white' : 'text-slate-600'}`}>{opt === 'ALL' ? 'All Companies' : opt === 'HYDRO' ? 'Hydro' : opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View className="bg-transparent overflow-hidden mt-6">
        <View className={`${isMobile ? '' : 'bg-white rounded-2xl shadow-sm border border-slate-200'} pb-4`}>
          {!isMobile && (
            <View className="flex-row bg-slate-100 border-b border-slate-200 p-4 rounded-t-2xl">
              <Text className="flex-1 font-bold text-slate-700 text-sm">Date</Text>
              <Text className="w-20 font-bold text-slate-700 text-sm">Co.</Text>
              <Text className="flex-2 font-bold text-slate-700 text-sm" style={{flex: 2}}>Vehicle</Text>
              <Text className="flex-2 font-bold text-slate-700 text-sm" style={{flex: 2}}>Job</Text>
              <Text className="flex-1 font-bold text-slate-700 text-sm">Requester</Text>
              <Text className="flex-1 font-bold text-slate-700 text-sm text-center">Status</Text>
              <Text className="flex-1 font-bold text-slate-700 text-sm text-right">Actions</Text>
            </View>
          )}

          {loading ? (
            <View className="flex-1 justify-center items-center py-20">
              <ActivityIndicator size="large" color="#6d28d9" />
            </View>
          ) : (
            <View className="flex-col">
              {filteredEntries.length === 0 ? (
                <View className="py-20 items-center">
                  <Text className="text-slate-500 font-medium">No entries found for this status.</Text>
                </View>
              ) : (
                filteredEntries.map((entry, index) => (
                  <TouchableOpacity
                    key={entry.id}
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedEntry(entry);
                      setRateAmountInput(entry.rate_amount != null ? String(entry.rate_amount) : '0');
                      setDetailsModalVisible(true);
                    }}
                    className={`${isMobile ? 'bg-white mb-3 p-4 rounded-xl shadow-sm border border-slate-100 flex-col' : `flex-row items-center p-4 border-b border-slate-100 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}`}
                  >
                    {isMobile ? (
                      // Mobile Card View
                      <View className="flex-col">
                        <View className="flex-row justify-between items-center mb-3">
                          <View className="flex-row items-center">
                            <Text className="text-slate-900 font-bold mr-2">{entry.entry_date}</Text>
                            <View className="bg-violet-100 px-2 py-0.5 rounded-full">
                              <Text className="text-violet-700 text-[10px] font-bold">{entry.company}</Text>
                            </View>
                          </View>
                          <StatusPill status={entry.status} />
                        </View>
                        <EarlyFlagBadge entry={entry} className="mb-3" />

                        <View className="flex-row justify-between mb-3 border-b border-slate-100 pb-3">
                          <View className="flex-1">
                            <Text className="text-xs font-bold text-slate-400 mb-1 uppercase">Job Details</Text>
                            <Text className="text-slate-900 font-bold">{entry.jobs?.job_number}</Text>
                            <Text className="text-slate-500 text-xs" numberOfLines={1}>{entry.jobs?.job_name}</Text>
                          </View>
                          <View className="items-end">
                            <Text className="text-xs font-bold text-slate-400 mb-1 uppercase">Hours / Trips</Text>
                            <Text className="text-slate-900 font-black text-lg">{entry.working_hours} / {entry.number_of_trips}</Text>
                          </View>
                        </View>

                        <View className="mb-4">
                          <Text className="text-xs font-bold text-slate-400 mb-1 uppercase">Vehicle</Text>
                          <Text className="text-slate-900 font-bold">{entry.internal_vehicles?.vehicle_number} - {entry.internal_vehicles?.vehicle_type}</Text>
                          <Text className="text-slate-500 text-xs">Section: {entry.section}</Text>
                        </View>

                        <View className="flex-row justify-end space-x-3 pt-3 border-t border-slate-100">
                          {entry.internal_vehicle_photo_url && entry.internal_vehicle_photo_url !== 'pending' && (
                            <TouchableOpacity
                              onPress={() => {
                                setSelectedPhoto(entry.internal_vehicle_photo_url);
                                setPhotoModalVisible(true);
                              }}
                              className="bg-blue-100 p-2 rounded-lg border border-blue-200 active:bg-blue-200"
                            >
                              <ImageIcon size={18} color="#1e3a8a" />
                            </TouchableOpacity>
                          )}
                          {entry.internal_vehicle_photo_url === 'pending' && (
                            <View className="bg-amber-100 p-2 rounded-lg border border-amber-200 flex-row items-center px-3">
                              <AlertTriangle size={16} color="#d97706" />
                              <Text className="text-amber-700 font-bold ml-1 text-xs">Photo Pending</Text>
                            </View>
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
                        <View className="w-20">
                          <View className="bg-violet-100 px-2 py-0.5 rounded-full self-start">
                            <Text className="text-violet-700 text-[10px] font-bold">{entry.company}</Text>
                          </View>
                        </View>
                        <View style={{flex: 2}}>
                          <Text className="text-slate-900 font-bold">{entry.internal_vehicles?.vehicle_number}</Text>
                          <Text className="text-slate-500 text-xs" numberOfLines={1}>{entry.internal_vehicles?.vehicle_type}</Text>
                        </View>
                        <View style={{flex: 2}}>
                          <Text className="text-slate-900 font-bold">{entry.jobs?.job_number}</Text>
                          <Text className="text-slate-500 text-xs" numberOfLines={1}>{entry.jobs?.job_name}</Text>
                        </View>
                        <Text className="flex-1 text-slate-900 font-medium" numberOfLines={1}>{entry.requester_name}</Text>
                        <View className="flex-1 items-center justify-center" style={{ gap: 4 }}>
                          <StatusPill status={entry.status} />
                          <EarlyFlagBadge entry={entry} />
                        </View>
                        <View className="flex-1 flex-row justify-end space-x-2">
                          {entry.internal_vehicle_photo_url && entry.internal_vehicle_photo_url !== 'pending' && (
                            <TouchableOpacity
                              onPress={() => {
                                setSelectedPhoto(entry.internal_vehicle_photo_url);
                                setPhotoModalVisible(true);
                              }}
                              className="bg-blue-100 p-2 rounded-lg border border-blue-200 active:bg-blue-200"
                            >
                              <ImageIcon size={18} color="#1e3a8a" />
                            </TouchableOpacity>
                          )}
                          {entry.internal_vehicle_photo_url === 'pending' && (
                            <View className="bg-amber-100 p-2 rounded-lg border border-amber-200">
                              <AlertTriangle size={18} color="#d97706" />
                            </View>
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

      <ScrollToTopButton
        visible={showScrollTop}
        onPress={() => scrollViewRef.current?.scrollTo({ y: 0, animated: true })}
      />

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
                    <EarlyFlagBadge entry={selectedEntry} className="mt-2" />
                  </View>
                </View>

                <View className="mb-4 bg-violet-50 px-4 py-3 rounded-2xl border border-violet-100">
                  <Text className="text-xs font-bold text-violet-500 uppercase mb-1">Company</Text>
                  <Text className="text-violet-900 font-bold text-base">{COMPANY_LABELS[selectedEntry.company] || selectedEntry.company}</Text>
                </View>

                <View className="h-px bg-slate-100 w-full mb-4" />

                <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Job Details</Text>
                <Text className="text-slate-900 font-bold text-base">{selectedEntry.jobs?.job_number}</Text>
                <Text className="text-slate-500 mb-4">{selectedEntry.jobs?.job_name}</Text>

                <View className="flex-row justify-between mb-4">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Vehicle No</Text>
                    <Text className="text-slate-900 font-bold text-base">{selectedEntry.internal_vehicles?.vehicle_number || 'N/A'}</Text>
                  </View>
                  <View className="flex-1 items-end">
                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Vehicle Type</Text>
                    <Text className="text-slate-900 font-bold text-base">{selectedEntry.internal_vehicles?.vehicle_type || 'N/A'}</Text>
                  </View>
                </View>

                {(selectedEntry.from_location || selectedEntry.to_location) && (
                  <View className="flex-row justify-between mb-4">
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-slate-400 uppercase mb-1">From Location</Text>
                      <Text className="text-slate-900 font-bold text-base">{selectedEntry.from_location || 'N/A'}</Text>
                    </View>
                    <View className="flex-1 items-end">
                      <Text className="text-xs font-bold text-slate-400 uppercase mb-1">To Location</Text>
                      <Text className="text-slate-900 font-bold text-base">{selectedEntry.to_location || 'N/A'}</Text>
                    </View>
                  </View>
                )}

                <View className="flex-row justify-between mb-4">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Section</Text>
                    <Text className="text-slate-900 font-bold text-base">{selectedEntry.section || 'N/A'}</Text>
                  </View>
                  <View className="flex-1 items-end">
                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Basis</Text>
                    <Text className="text-slate-900 font-bold text-base">{selectedEntry.basis === 'TRIP_BASIS' ? 'Trip Basis' : 'Hourly'}</Text>
                  </View>
                </View>

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
                  <View className="flex-1 bg-blue-50 p-4 rounded-2xl border border-blue-100 mx-2">
                    <Text className="text-xs font-bold text-blue-600 uppercase mb-1">Total</Text>
                    <Text className="text-blue-700 font-black text-2xl">{selectedEntry.working_hours} hr</Text>
                  </View>
                  <View className="flex-1 bg-amber-50 p-4 rounded-2xl border border-amber-100 ml-2">
                    <Text className="text-xs font-bold text-amber-600 uppercase mb-1">Trips</Text>
                    <Text className="text-amber-700 font-black text-2xl">{selectedEntry.number_of_trips ?? 0}</Text>
                  </View>
                </View>

                {selectedEntry.internal_vehicle_photo_url === 'pending' && (
                  <View className="mb-4 bg-amber-50 p-4 rounded-2xl border border-amber-100 flex-row items-center">
                    <AlertTriangle size={18} color="#d97706" />
                    <Text className="text-amber-800 font-medium ml-2 flex-1 text-sm">
                      Photo upload didn't finish when this was submitted (likely a weak connection). The foreman needs to edit this entry to attach it.
                    </Text>
                  </View>
                )}

                <View className="flex-row justify-between mb-4">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Requester Name</Text>
                    <Text className="text-slate-900 font-bold text-base">{selectedEntry.requester_name || 'N/A'}</Text>
                  </View>
                  <View className="flex-1 items-end">
                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Driver / Operator</Text>
                    <Text className="text-slate-900 font-bold text-base">{selectedEntry.internal_vehicle_drivers?.name || 'N/A'}</Text>
                  </View>
                </View>

                <View className="flex-row justify-between mb-4">
                  <View className="flex-1 mr-3">
                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Rate / Amount (AED)</Text>
                    <Text className="text-slate-400 text-xs mb-2">Drivers can't set this -- admin only.</Text>
                    <View className="flex-row items-center">
                      <TextInput
                        value={rateAmountInput}
                        onChangeText={setRateAmountInput}
                        keyboardType="numeric"
                        placeholder="0.00"
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-bold mr-2"
                      />
                      <TouchableOpacity
                        onPress={handleSaveRate}
                        disabled={savingRate}
                        className={`px-3 py-2.5 rounded-xl ${savingRate ? 'bg-slate-200' : 'bg-slate-900 active:bg-slate-800'}`}
                      >
                        {savingRate ? <ActivityIndicator size="small" color="#64748b" /> : <Text className="text-white font-bold text-sm">Save</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                  {!!selectedEntry.ist_timesheet_number && (
                    <View className="flex-1 items-end">
                      <Text className="text-xs font-bold text-slate-400 uppercase mb-1">IST Timesheet Number</Text>
                      <Text className="text-slate-900 font-bold text-base">{selectedEntry.ist_timesheet_number}</Text>
                    </View>
                  )}
                </View>

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
                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Submitted At</Text>
                    <Text className="text-slate-700 font-medium">
                      {formatSubmittedAt(selectedEntry.created_at)}
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
    </FadeInUp>
  );
}
