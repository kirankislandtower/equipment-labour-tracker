import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, useWindowDimensions, Platform, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Calendar, User, Clock, CheckCircle, XCircle, ChevronRight, Activity, X, Check } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getLocalDateString } from '../../lib/dateUtils';
import { useRouter } from 'expo-router';

const StatusPill = ({ status }: { status: string }) => {
  if (status === 'APPROVED') return <View className="bg-green-100 px-3 py-1 rounded-full"><Text className="text-green-700 font-bold text-[10px] uppercase">Approved</Text></View>;
  if (status === 'REJECTED') return <View className="bg-red-100 px-3 py-1 rounded-full"><Text className="text-red-700 font-bold text-[10px] uppercase">Rejected</Text></View>;
  return <View className="bg-amber-100 px-3 py-1 rounded-full"><Text className="text-amber-700 font-bold text-[10px] uppercase">Submitted</Text></View>;
};

export default function ForemanReports() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const todayStr = getLocalDateString();
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [foremenStats, setForemenStats] = useState<any[]>([]);
  const [allData, setAllData] = useState<{equip: any[], labour: any[]}>({ equip: [], labour: [] });
  const [selectedForeman, setSelectedForeman] = useState<any>(null);
  const [selectedListType, setSelectedListType] = useState<'equipment' | 'labour' | null>(null);

  // Detail & Action States
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [entryType, setEntryType] = useState<'equipment' | 'labour' | null>(null);

  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    fetchData();
  }, [fromDate, toDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [equipRes, labourRes] = await Promise.all([
        supabase.from('equipment_entries').select('*, jobs:job_id(job_number, job_name), equipment_master(equipment_name), suppliers(supplier_name)').gte('entry_date', fromDate).lte('entry_date', toDate),
        supabase.from('labour_entries').select('*, jobs:job_id(job_number, job_name), labour_designations(designation_name), suppliers(supplier_name)').gte('entry_date', fromDate).lte('entry_date', toDate),
        new Promise(resolve => setTimeout(resolve, 300))
      ]);

      if (equipRes.error) console.error('Error fetching equipment entries for foreman reports:', equipRes.error);
      if (labourRes.error) console.error('Error fetching labour entries for foreman reports:', labourRes.error);

      const equipData = equipRes.data || [];
      const labourData = labourRes.data || [];
      setAllData({ equip: equipData, labour: labourData });
      
      const allEntries = [...equipData, ...labourData];
      const aggregated: Record<string, any> = {};

      // Grouped by the actual logged-in account (created_by), not the free-typed
      // "Foreman Name" text on each entry -- that field is an editable TextInput, so
      // the same person typing their name slightly differently across two entries
      // (extra space, different casing) used to fragment them into separate cards.
      // Falls back to the typed name only for legacy rows with no created_by.
      allEntries.forEach(entry => {
        const key = entry.created_by || entry.foreman_name || 'unknown';
        const displayName = entry.foreman_name || 'Unknown Foreman';
        if (!aggregated[key]) {
          aggregated[key] = { name: displayName, total: 0, pending: 0, approved: 0, rejected: 0, equipment: 0, labour: 0 };
        }

        aggregated[key].total++;
        if ((entry as any).equipment_master_id !== undefined || equipData.includes(entry)) {
          aggregated[key].equipment++;
        } else {
          aggregated[key].labour++;
        }

        if (entry.status === 'SUBMITTED') aggregated[key].pending++;
        else if (entry.status === 'APPROVED') aggregated[key].approved++;
        else if (entry.status === 'REJECTED') aggregated[key].rejected++;
      });

      const foremenArray = Object.keys(aggregated).map(key => ({
        key, ...aggregated[key]
      })).sort((a, b) => b.total - a.total);

      setForemenStats(foremenArray);
    } catch (error) {
      console.error('Error fetching foremen stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string, reason: string = '') => {
    setIsUpdating(true);
    try {
      const table = entryType === 'equipment' ? 'equipment_entries' : 'labour_entries';
      const { error } = await supabase.from(table).update({ status: newStatus, rejection_reason: reason }).eq('id', id);

      if (error) throw error;
      
      setAllData(prev => {
        const newData = { ...prev };
        const list = entryType === 'equipment' ? newData.equip : newData.labour;
        const index = list.findIndex(e => e.id === id);
        if (index > -1) {
          list[index] = { ...list[index], status: newStatus, rejection_reason: reason };
          if (selectedEntry?.id === id) {
             setSelectedEntry({ ...list[index] });
          }
        }
        return newData;
      });

      setTimeout(() => fetchData(), 500); 

      showToast(`Entry marked as ${newStatus}`);
      if (rejectModalVisible) {
        setRejectModalVisible(false);
        setRejectReason('');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      showToast('Error updating status');
    } finally {
      setIsUpdating(false);
    }
  };

  // Mirrors the fetchData aggregation key: match by the real account (created_by)
  // when the entry has one, falling back to the typed foreman_name for legacy rows
  // that predate created_by being reliably set.
  const matchesSelectedForeman = (entry: any) =>
    selectedForeman && (entry.created_by
      ? entry.created_by === selectedForeman.key
      : entry.foreman_name === selectedForeman.name);

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: isMobile ? 16 : 32, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      <View className="mb-6 flex-row justify-between items-end">
        <View>
          <Text className="text-3xl font-black text-slate-900 tracking-tight mb-1">Foreman Reports</Text>
          <Text className="text-slate-500 font-medium">Track individual foreman daily activity.</Text>
        </View>
      </View>

      <View className={isMobile ? 'flex-col mb-6' : 'flex-row items-center space-x-3 mb-6'}>
        <TouchableOpacity 
          onPress={() => setShowFromPicker(true)} 
          disabled={Platform.OS === 'web'}
          className={`bg-white flex-row items-center p-4 rounded-3xl border border-slate-200 ${isMobile ? 'w-full mb-3' : 'flex-1'}`}
          style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2 }}
        >
          <View className="bg-blue-50 p-3 rounded-2xl mr-3 border border-blue-100">
            <Calendar size={20} color="#1e3a8a" />
          </View>
          <View className="flex-1">
            <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">From Date</Text>
            {Platform.OS === 'web' ? (
              <input type="date" value={fromDate} onChange={(e: any) => setFromDate(e.target.value)} style={{ border: 'none', outline: 'none', width: '100%', fontWeight: '900', backgroundColor: 'transparent', color: '#0f172a', fontSize: '16px', padding: 0, margin: 0 }} />
            ) : (
              <Text className="text-slate-900 font-black text-base">{fromDate}</Text>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={() => setShowToPicker(true)} 
          disabled={Platform.OS === 'web'}
          className={`bg-white flex-row items-center p-4 rounded-3xl border border-slate-200 ${isMobile ? 'w-full' : 'flex-1'}`}
          style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2 }}
        >
          <View className="bg-blue-50 p-3 rounded-2xl mr-3 border border-blue-100">
            <Calendar size={20} color="#1e3a8a" />
          </View>
          <View className="flex-1">
            <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">To Date</Text>
            {Platform.OS === 'web' ? (
              <input type="date" value={toDate} onChange={(e: any) => setToDate(e.target.value)} style={{ border: 'none', outline: 'none', width: '100%', fontWeight: '900', backgroundColor: 'transparent', color: '#0f172a', fontSize: '16px', padding: 0, margin: 0 }} />
            ) : (
              <Text className="text-slate-900 font-black text-base">{toDate}</Text>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {Platform.OS === 'ios' ? (
        <Modal visible={showFromPicker || showToPicker} transparent animationType="slide">
          <View className="flex-1 justify-end bg-black/50">
            <View className="bg-white p-6 rounded-t-3xl pb-10">
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-xl font-black text-slate-900">Select Date</Text>
                <TouchableOpacity onPress={() => { setShowFromPicker(false); setShowToPicker(false); }} className="bg-blue-100 px-5 py-2.5 rounded-full">
                  <Text className="text-blue-700 font-bold">Done</Text>
                </TouchableOpacity>
              </View>
              {(showFromPicker || showToPicker) && (
                <DateTimePicker 
                  value={new Date(showFromPicker ? fromDate : toDate)} 
                  mode="date" 
                  display="spinner"
                  onChange={(e, d) => { 
                    if (d) {
                      if (showFromPicker) setFromDate(getLocalDateString(d));
                      if (showToPicker) setToDate(getLocalDateString(d));
                    }
                  }} 
                />
              )}
            </View>
          </View>
        </Modal>
      ) : (
        <>
          {showFromPicker && (
            <DateTimePicker value={new Date(fromDate)} mode="date" display="default" onChange={(e, d) => { setShowFromPicker(false); if (d) setFromDate(getLocalDateString(d)); }} />
          )}
          {showToPicker && (
            <DateTimePicker value={new Date(toDate)} mode="date" display="default" onChange={(e, d) => { setShowToPicker(false); if (d) setToDate(getLocalDateString(d)); }} />
          )}
        </>
      )}

      {loading ? (
        <View className="flex-1 justify-center items-center py-20">
          <ActivityIndicator size="large" color="#1e3a8a" />
          <Text className="text-slate-500 mt-4 font-medium">Analyzing foreman data...</Text>
        </View>
      ) : (
        <View className="flex-1 pb-6">
          {foremenStats.length === 0 ? (
            <View className="py-20 items-center justify-center bg-white rounded-3xl border border-slate-100 shadow-sm mt-4">
              <View className="bg-slate-50 p-4 rounded-full mb-4">
                <Activity size={32} color="#94a3b8" />
              </View>
              <Text className="text-slate-900 text-lg font-black tracking-tight">No Activity Found</Text>
              <Text className="text-slate-500 mt-1">No foremen submitted any data between {fromDate} and {toDate}.</Text>
            </View>
          ) : (
            <View className="flex-row flex-wrap justify-between">
              {foremenStats.map((foreman) => (
                <View 
                  key={foreman.key}
                  className="bg-white p-6 rounded-3xl border border-slate-200 mb-4 shadow-sm"
                  style={{ width: isMobile ? '100%' : '48%' }}
                >
                  <View className="flex-row justify-between items-center mb-6">
                    <View className="flex-row items-center">
                      <View className="bg-blue-50 w-12 h-12 rounded-full items-center justify-center border border-blue-100 mr-4">
                        <Text className="text-blue-900 font-black text-xl">{foreman.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View>
                        <Text className="text-slate-900 font-black text-xl tracking-tight">{foreman.name}</Text>
                        <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider">{foreman.total} Total Entries</Text>
                      </View>
                    </View>
                  </View>

                  <View className="flex-row justify-between mb-6 gap-2">
                    <View className="flex-1 bg-amber-50 p-3 rounded-2xl border border-amber-100 items-center">
                      <Clock size={16} color="#d97706" className="mb-1" />
                      <Text className="text-amber-900 font-black text-2xl">{foreman.pending}</Text>
                      <Text className="text-amber-700 text-[10px] font-bold uppercase tracking-wider">Pending</Text>
                    </View>
                    <View className="flex-1 bg-green-50 p-3 rounded-2xl border border-green-100 items-center">
                      <CheckCircle size={16} color="#16a34a" className="mb-1" />
                      <Text className="text-green-900 font-black text-2xl">{foreman.approved}</Text>
                      <Text className="text-green-700 text-[10px] font-bold uppercase tracking-wider">Approved</Text>
                    </View>
                    <View className="flex-1 bg-red-50 p-3 rounded-2xl border border-red-100 items-center">
                      <XCircle size={16} color="#dc2626" className="mb-1" />
                      <Text className="text-red-900 font-black text-2xl">{foreman.rejected}</Text>
                      <Text className="text-red-700 text-[10px] font-bold uppercase tracking-wider">Rejected</Text>
                    </View>
                  </View>

                  <View className="flex-row border-t border-slate-100 pt-4">
                    <TouchableOpacity 
                      onPress={() => {
                        setSelectedListType('equipment');
                        setSelectedForeman(foreman);
                      }}
                      className="flex-1 border-r border-slate-100 items-center py-2"
                    >
                      <Text className="text-slate-400 font-bold text-[10px] uppercase mb-1">Equipment</Text>
                      <Text className="text-slate-700 font-black text-lg">{foreman.equipment}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => {
                        setSelectedListType('labour');
                        setSelectedForeman(foreman);
                      }}
                      className="flex-1 items-center py-2"
                    >
                      <Text className="text-slate-400 font-bold text-[10px] uppercase mb-1">Labour</Text>
                      <Text className="text-slate-700 font-black text-lg">{foreman.labour}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
          </View>
        )}
      </ScrollView>

      {/* Foreman List Modal */}
      <Modal visible={!!selectedForeman && !detailsModalVisible} transparent animationType="slide" onRequestClose={() => setSelectedForeman(null)}>
        <View className="flex-1 bg-slate-900/60 justify-end">
          <View className="bg-white rounded-t-[32px] p-6 h-[90%]">
            <View className="flex-row justify-between items-center mb-6">
              <View>
                <Text className="text-2xl font-black text-slate-900">{selectedForeman?.name}</Text>
                <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider">{fromDate} to {toDate} • {selectedForeman?.total} Entries</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedForeman(null)} className="bg-slate-100 p-2 rounded-full active:bg-slate-200">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
              {selectedListType === 'equipment' && (
                <View className="mb-6">
                  <Text className="text-sm font-black text-slate-900 uppercase tracking-widest mb-3 px-1">Equipment</Text>
                  {allData.equip.filter(e => matchesSelectedForeman(e)).length === 0 ? (
                    <View className="py-10 items-center justify-center bg-slate-50 rounded-2xl border border-slate-100">
                      <Text className="text-slate-500 font-medium">No equipment entries today.</Text>
                    </View>
                  ) : (
                    allData.equip.filter(e => matchesSelectedForeman(e)).map(entry => (
                      <TouchableOpacity 
                        key={entry.id} 
                        activeOpacity={0.7}
                        onPress={() => {
                          setSelectedEntry(entry);
                          setEntryType('equipment');
                          setDetailsModalVisible(true);
                        }}
                        className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-3"
                      >
                        <View className="flex-row justify-between items-start mb-2">
                          <View className="flex-1 pr-2">
                            <Text className="text-slate-900 font-bold text-base leading-tight mb-1">{entry.equipment_master?.equipment_name}</Text>
                            <Text className="text-slate-500 text-sm">{entry.jobs?.job_number} • {entry.suppliers?.supplier_name}</Text>
                          </View>
                          <StatusPill status={entry.status} />
                        </View>
                        
                        <View className="flex-row justify-between bg-white p-3 rounded-xl border border-slate-100 mt-2">
                          <View>
                            <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Hours</Text>
                            <Text className="text-slate-800 font-black text-lg">{entry.working_hours} hr</Text>
                          </View>
                          <View className="items-end">
                            <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Time</Text>
                            <Text className="text-slate-800 font-black text-lg">{entry.start_time} - {entry.end_time}</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}

              {selectedListType === 'labour' && (
                <View className="mb-6">
                  <Text className="text-sm font-black text-slate-900 uppercase tracking-widest mb-3 px-1">Labour</Text>
                  {allData.labour.filter(e => matchesSelectedForeman(e)).length === 0 ? (
                    <View className="py-10 items-center justify-center bg-slate-50 rounded-2xl border border-slate-100">
                      <Text className="text-slate-500 font-medium">No labour entries today.</Text>
                    </View>
                  ) : (
                    allData.labour.filter(e => matchesSelectedForeman(e)).map(entry => (
                      <TouchableOpacity 
                        key={entry.id} 
                        activeOpacity={0.7}
                        onPress={() => {
                          setSelectedEntry(entry);
                          setEntryType('labour');
                          setDetailsModalVisible(true);
                        }}
                        className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-3"
                      >
                        <View className="flex-row justify-between items-start mb-2">
                          <View className="flex-1 pr-2">
                            <Text className="text-slate-900 font-bold text-base leading-tight mb-1">{entry.employee_name}</Text>
                            <Text className="text-slate-500 text-sm">{entry.labour_designations?.designation_name} • {entry.suppliers?.supplier_name}</Text>
                          </View>
                          <StatusPill status={entry.status} />
                        </View>
                        
                        <View className="flex-row justify-between bg-white p-3 rounded-xl border border-slate-100 mt-2">
                          <View>
                            <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Hours</Text>
                            <Text className="text-slate-800 font-black text-lg">{entry.total_working_hours} hr</Text>
                          </View>
                          <View className="items-end">
                            <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Time</Text>
                            <Text className="text-slate-800 font-black text-lg">{entry.start_time} - {entry.end_time}</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Full Details Modal */}
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

                {entryType === 'equipment' ? (
                  <>
                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Equipment</Text>
                    <Text className="text-slate-900 font-bold text-base">{selectedEntry.equipment_master?.equipment_name}</Text>
                  </>
                ) : (
                  <>
                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Labour</Text>
                    <Text className="text-slate-900 font-bold text-base">{selectedEntry.employee_name}</Text>
                    <Text className="text-slate-500 mb-4">{selectedEntry.labour_designations?.designation_name} • {selectedEntry.suppliers?.supplier_name}</Text>
                  </>
                )}
                {entryType === 'equipment' && <Text className="text-slate-500 mb-4">{selectedEntry.suppliers?.supplier_name}</Text>}

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
                  <View className={`flex-1 ${entryType === 'equipment' ? 'bg-blue-50 border-blue-100' : 'bg-emerald-50 border-emerald-100'} p-4 rounded-2xl border ml-2`}>
                    <Text className={`text-xs font-bold ${entryType === 'equipment' ? 'text-blue-600' : 'text-emerald-600'} uppercase mb-1`}>Total</Text>
                    <Text className={`${entryType === 'equipment' ? 'text-blue-700' : 'text-emerald-700'} font-black text-2xl`}>
                      {entryType === 'equipment' ? selectedEntry.working_hours : selectedEntry.total_working_hours} hr
                    </Text>
                  </View>
                </View>

                {entryType === 'labour' && selectedEntry.overtime_hours > 0 && (
                  <View className="mb-4 bg-amber-50 p-4 rounded-2xl border border-amber-100">
                    <Text className="text-xs font-bold text-amber-600 uppercase mb-1">Overtime</Text>
                    <Text className="text-amber-700 font-bold text-lg">{selectedEntry.overtime_hours} hours</Text>
                  </View>
                )}

                {entryType === 'equipment' && selectedEntry.fuel_provided && (
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

                {/* Action Buttons inside Details Modal */}
                {selectedEntry.status === 'SUBMITTED' && (
                  <View className="mt-8 pt-6 border-t border-slate-100 flex-row space-x-3">
                    <TouchableOpacity 
                      onPress={() => {
                        setDetailsModalVisible(false);
                        setRejectModalVisible(true);
                      }}
                      className="flex-1 bg-red-50 border border-red-200 py-4 rounded-xl items-center active:bg-red-100 flex-row justify-center mr-2"
                    >
                      <X size={20} color="#dc2626" />
                      <Text className="text-red-700 font-bold ml-2">Reject</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      onPress={() => handleUpdateStatus(selectedEntry.id, 'APPROVED')}
                      disabled={isUpdating}
                      className="flex-1 bg-green-50 border border-green-200 py-4 rounded-xl items-center active:bg-green-100 flex-row justify-center ml-2"
                    >
                      {isUpdating ? <ActivityIndicator size="small" color="#16a34a" /> : <Check size={20} color="#16a34a" />}
                      <Text className="text-green-700 font-bold ml-2">{isUpdating ? 'Approving...' : 'Approve'}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Reject Modal */}
      <Modal visible={rejectModalVisible} transparent animationType="fade" onRequestClose={() => setRejectModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-black/50 justify-center px-6">
          <View className="bg-white rounded-[32px] p-6 shadow-2xl">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-black text-slate-900">Reject Entry</Text>
              <TouchableOpacity onPress={() => setRejectModalVisible(false)} className="bg-slate-100 p-2 rounded-full">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text className="text-slate-600 mb-4 font-medium">Please provide a reason for rejecting this entry. This will be sent back to the foreman.</Text>
            <TextInput
              className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-900 text-base mb-6"
              placeholder="e.g. Hours don't match, wrong equipment..."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              value={rejectReason}
              onChangeText={setRejectReason}
              style={{ minHeight: 120 }}
            />
            <View className="flex-row space-x-3">
              <TouchableOpacity onPress={() => setRejectModalVisible(false)} className="flex-1 py-4 rounded-xl border border-slate-200 items-center mr-2">
                <Text className="text-slate-700 font-bold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => {
                  if (rejectReason.trim() && selectedEntry?.id) {
                    handleUpdateStatus(selectedEntry.id, 'REJECTED', rejectReason.trim());
                  }
                }}
                className={`flex-1 py-4 rounded-xl items-center ml-2 ${(!rejectReason.trim() || isUpdating) ? 'bg-red-300' : 'bg-red-600'}`}
                disabled={!rejectReason.trim() || isUpdating}
              >
                {isUpdating ? <ActivityIndicator size="small" color="#ffffff" /> : <Text className="text-white font-bold">Confirm Reject</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Toast */}
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
