import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, useWindowDimensions, Platform, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Calendar, Briefcase, Building2, BarChart3, X, Check, Search } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getLocalDateString, getFirstOfMonthString } from '../../lib/dateUtils';
import ExportCSVButton from '../../components/ExportCSVButton';

type GroupBy = 'job' | 'supplier';
type StatusFilter = 'ALL' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

type Stat = {
  key: string;
  name: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  equipmentHours: number;
  equipmentCount: number;
  labourHours: number;
  labourCount: number;
  materialCount: number;
  materialByUnit: Record<string, number>;
};

const StatusPill = ({ status }: { status: string }) => {
  if (status === 'APPROVED') return <View className="bg-green-100 px-3 py-1 rounded-full"><Text className="text-green-700 font-bold text-[10px] uppercase">Approved</Text></View>;
  if (status === 'REJECTED') return <View className="bg-red-100 px-3 py-1 rounded-full"><Text className="text-red-700 font-bold text-[10px] uppercase">Rejected</Text></View>;
  return <View className="bg-amber-100 px-3 py-1 rounded-full"><Text className="text-amber-700 font-bold text-[10px] uppercase">Submitted</Text></View>;
};

export default function UsageReports() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const firstOfMonth = getFirstOfMonthString();
  const todayStr = getLocalDateString();

  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(todayStr);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('job');
  const [searchQuery, setSearchQuery] = useState('');

  const [loading, setLoading] = useState(true);
  const [jobStats, setJobStats] = useState<Stat[]>([]);
  const [supplierStats, setSupplierStats] = useState<Stat[]>([]);
  const [allData, setAllData] = useState<{ equip: any[], labour: any[], material: any[] }>({ equip: [], labour: [], material: [] });

  // Drill-down state
  const [selectedStat, setSelectedStat] = useState<Stat | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [entryType, setEntryType] = useState<'equipment' | 'labour' | 'material' | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

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
      const [equipRes, labourRes, materialRes] = await Promise.all([
        supabase.from('equipment_entries').select('*, jobs:job_id(job_number, job_name), equipment_master(equipment_name), suppliers(supplier_name)').gte('entry_date', fromDate).lte('entry_date', toDate),
        supabase.from('labour_entries').select('*, jobs:job_id(job_number, job_name), labour_designations(designation_name), suppliers(supplier_name)').gte('entry_date', fromDate).lte('entry_date', toDate),
        supabase.from('material_transfers').select('*, from_job:from_job_id(job_number, job_name), to_job:to_job_id(job_number, job_name)').gte('entry_date', fromDate).lte('entry_date', toDate),
      ]);

      if (equipRes.error) console.error('Error fetching equipment entries for reports:', equipRes.error);
      if (labourRes.error) console.error('Error fetching labour entries for reports:', labourRes.error);
      if (materialRes.error) console.error('Error fetching material transfers for reports:', materialRes.error);

      const equipData = equipRes.data || [];
      const labourData = labourRes.data || [];
      const materialData = materialRes.data || [];
      setAllData({ equip: equipData, labour: labourData, material: materialData });

      const makeAggregator = () => {
        const byKey: Record<string, Stat> = {};
        const ensure = (key: string, name: string) => {
          if (!byKey[key]) {
            byKey[key] = { key, name, total: 0, pending: 0, approved: 0, rejected: 0, equipmentHours: 0, equipmentCount: 0, labourHours: 0, labourCount: 0, materialCount: 0, materialByUnit: {} };
          }
          return byKey[key];
        };
        return { byKey, ensure };
      };

      const jobAgg = makeAggregator();
      const supplierAgg = makeAggregator();

      const bumpStatus = (stat: Stat, status: string) => {
        stat.total++;
        if (status === 'SUBMITTED') stat.pending++;
        else if (status === 'APPROVED') stat.approved++;
        else if (status === 'REJECTED') stat.rejected++;
      };

      // Hours/quantities only count APPROVED entries -- a rejected entry means that
      // claimed work was deemed invalid, so it shouldn't inflate a usage total. The
      // pending/approved/rejected pill counts still tally every entry regardless.
      equipData.forEach((entry: any) => {
        const isApproved = entry.status === 'APPROVED';
        if (entry.job_id) {
          const stat = jobAgg.ensure(entry.job_id, entry.jobs ? `${entry.jobs.job_number} - ${entry.jobs.job_name}` : 'Unknown Job');
          bumpStatus(stat, entry.status);
          if (isApproved) {
            stat.equipmentCount++;
            stat.equipmentHours += parseFloat(entry.working_hours) || 0;
          }
        }
        if (entry.supplier_id) {
          const stat = supplierAgg.ensure(entry.supplier_id, entry.suppliers?.supplier_name || 'Unknown Supplier');
          bumpStatus(stat, entry.status);
          if (isApproved) {
            stat.equipmentCount++;
            stat.equipmentHours += parseFloat(entry.working_hours) || 0;
          }
        }
      });

      labourData.forEach((entry: any) => {
        const isApproved = entry.status === 'APPROVED';
        if (entry.job_id) {
          const stat = jobAgg.ensure(entry.job_id, entry.jobs ? `${entry.jobs.job_number} - ${entry.jobs.job_name}` : 'Unknown Job');
          bumpStatus(stat, entry.status);
          if (isApproved) {
            stat.labourCount++;
            stat.labourHours += parseFloat(entry.total_working_hours) || 0;
          }
        }
        if (entry.supplier_id) {
          const stat = supplierAgg.ensure(entry.supplier_id, entry.suppliers?.supplier_name || 'Unknown Supplier');
          bumpStatus(stat, entry.status);
          if (isApproved) {
            stat.labourCount++;
            stat.labourHours += parseFloat(entry.total_working_hours) || 0;
          }
        }
      });

      // Material has no supplier field -- attributed to its source job only.
      materialData.forEach((entry: any) => {
        if (entry.from_job_id) {
          const stat = jobAgg.ensure(entry.from_job_id, entry.from_job ? `${entry.from_job.job_number} - ${entry.from_job.job_name}` : 'Unknown Job');
          bumpStatus(stat, entry.status);
          if (entry.status === 'APPROVED') {
            stat.materialCount++;
            const unit = entry.unit || 'unit';
            stat.materialByUnit[unit] = (stat.materialByUnit[unit] || 0) + (parseFloat(entry.quantity) || 0);
          }
        }
      });

      const toSorted = (agg: Record<string, Stat>) => Object.values(agg).sort((a, b) => b.total - a.total);

      const newJobStats = toSorted(jobAgg.byKey);
      const newSupplierStats = toSorted(supplierAgg.byKey);
      setJobStats(newJobStats);
      setSupplierStats(newSupplierStats);

      // Keep the open drill-down modal's counts in sync after an approve/reject.
      setSelectedStat(prev => {
        if (!prev) return prev;
        const refreshed = [...newJobStats, ...newSupplierStats].find(s => s.key === prev.key);
        return refreshed || prev;
      });
    } catch (error) {
      console.error('Error fetching usage reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string, reason: string = '') => {
    setIsUpdating(true);
    try {
      const table = entryType === 'equipment' ? 'equipment_entries' : entryType === 'labour' ? 'labour_entries' : 'material_transfers';
      const { error } = await supabase.from(table).update({ status: newStatus, rejection_reason: reason }).eq('id', id);

      if (error) throw error;

      setAllData(prev => {
        const newData = { ...prev };
        const list = entryType === 'equipment' ? newData.equip : entryType === 'labour' ? newData.labour : newData.material;
        const index = list.findIndex(e => e.id === id);
        if (index > -1) {
          list[index] = { ...list[index], status: newStatus, rejection_reason: reason };
          if (selectedEntry?.id === id) setSelectedEntry({ ...list[index] });
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

  const stats = (groupBy === 'job' ? jobStats : supplierStats).filter(stat =>
    stat.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const materialSummary = (stat: Stat) => {
    const parts = Object.entries(stat.materialByUnit).map(([unit, qty]) => `${qty} ${unit}`);
    return parts.length ? parts.join(', ') : null;
  };

  const csvData = stats.map(stat => ({
    [groupBy === 'job' ? 'Job' : 'Supplier']: stat.name,
    'Total Entries': stat.total,
    'Pending': stat.pending,
    'Approved': stat.approved,
    'Rejected': stat.rejected,
    'Equipment Hours (Approved)': stat.equipmentHours.toFixed(2),
    'Equipment Entries (Approved)': stat.equipmentCount,
    'Labour Hours (Approved)': stat.labourHours.toFixed(2),
    'Labour Entries (Approved)': stat.labourCount,
    ...(groupBy === 'job' ? { 'Material Transfers (Approved)': stat.materialCount, 'Material Quantity (Approved)': materialSummary(stat) || '' } : {}),
  }));

  const openDrillDown = (stat: Stat, filter: StatusFilter) => {
    setSelectedStat(stat);
    setStatusFilter(filter);
  };

  const matchesSelectedStat = (entry: any, isMaterial: boolean = false) => {
    if (!selectedStat) return false;
    const keyMatches = groupBy === 'job'
      ? (isMaterial ? entry.from_job_id === selectedStat.key : entry.job_id === selectedStat.key)
      : entry.supplier_id === selectedStat.key;
    if (!keyMatches) return false;
    return statusFilter === 'ALL' || entry.status === statusFilter;
  };

  const filteredEquip = allData.equip.filter(e => matchesSelectedStat(e, false));
  const filteredLabour = allData.labour.filter(e => matchesSelectedStat(e, false));
  const filteredMaterial = groupBy === 'job' ? allData.material.filter(e => matchesSelectedStat(e, true)) : [];

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: isMobile ? 16 : 32, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View className="mb-6 flex-row justify-between items-end">
          <View>
            <Text className="text-3xl font-black text-slate-900 tracking-tight mb-1">Usage Reports</Text>
            <Text className="text-slate-500 font-medium">Totals per job and supplier for a date range.</Text>
          </View>
        </View>

        <View className={isMobile ? 'flex-col mb-4' : 'flex-row items-center space-x-3 mb-4'}>
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

        <View className="flex-row items-center justify-between mb-6">
          <View className="flex-row bg-slate-200/70 rounded-2xl p-1 self-start">
            <TouchableOpacity
              onPress={() => setGroupBy('job')}
              className={`flex-row items-center px-4 py-2.5 rounded-xl ${groupBy === 'job' ? 'bg-white shadow-sm' : ''}`}
            >
              <Briefcase size={16} color={groupBy === 'job' ? '#1e3a8a' : '#64748b'} />
              <Text className={`ml-2 font-bold text-sm ${groupBy === 'job' ? 'text-slate-900' : 'text-slate-500'}`}>By Job</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setGroupBy('supplier')}
              className={`flex-row items-center px-4 py-2.5 rounded-xl ${groupBy === 'supplier' ? 'bg-white shadow-sm' : ''}`}
            >
              <Building2 size={16} color={groupBy === 'supplier' ? '#1e3a8a' : '#64748b'} />
              <Text className={`ml-2 font-bold text-sm ${groupBy === 'supplier' ? 'text-slate-900' : 'text-slate-500'}`}>By Supplier</Text>
            </TouchableOpacity>
          </View>

          <ExportCSVButton data={csvData} filename={`usage_report_by_${groupBy}`} label="Export CSV" />
        </View>

        <View className="bg-white flex-row items-center px-4 rounded-2xl border border-slate-200 mb-6" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 6, elevation: 1 }}>
          <Search size={18} color="#94a3b8" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={groupBy === 'job' ? 'Search by job number or name...' : 'Search by supplier name...'}
            placeholderTextColor="#94a3b8"
            className="flex-1 py-3.5 px-3 text-slate-900 font-medium"
            style={{ outlineStyle: 'none' } as any}
          />
          {!!searchQuery && (
            <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1">
              <X size={16} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        {groupBy === 'supplier' && (
          <Text className="text-slate-400 text-xs font-medium mb-4 -mt-2">
            Material transfers aren't linked to a supplier, so they only show up in the "By Job" view.
          </Text>
        )}

        {loading ? (
          <View className="flex-1 justify-center items-center py-20">
            <ActivityIndicator size="large" color="#1e3a8a" />
            <Text className="text-slate-500 mt-4 font-medium">Crunching totals...</Text>
          </View>
        ) : stats.length === 0 ? (
          <View className="py-20 items-center justify-center bg-white rounded-3xl border border-slate-100 shadow-sm mt-4">
            <View className="bg-slate-50 p-4 rounded-full mb-4">
              <BarChart3 size={32} color="#94a3b8" />
            </View>
            <Text className="text-slate-900 text-lg font-black tracking-tight">No Activity Found</Text>
            <Text className="text-slate-500 mt-1">
              {searchQuery.trim()
                ? `No ${groupBy === 'job' ? 'job' : 'supplier'} matching "${searchQuery}" between ${fromDate} and ${toDate}.`
                : `No entries between ${fromDate} and ${toDate}.`}
            </Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap justify-between">
            {stats.map((stat) => (
              <View
                key={stat.key}
                className="bg-white p-6 rounded-3xl border border-slate-200 mb-4 shadow-sm"
                style={{ width: isMobile ? '100%' : '48%' }}
              >
                <View className="flex-row justify-between items-start mb-5">
                  <Text className="text-slate-900 font-black text-lg tracking-tight flex-1 pr-2">{stat.name}</Text>
                  <Text className="text-slate-400 font-bold text-xs uppercase tracking-wider">{stat.total} entries</Text>
                </View>

                <View className="flex-row justify-between mb-5 gap-2">
                  <TouchableOpacity onPress={() => openDrillDown(stat, 'SUBMITTED')} className="flex-1 bg-amber-50 p-3 rounded-2xl border border-amber-100 items-center active:bg-amber-100">
                    <Text className="text-amber-900 font-black text-xl">{stat.pending}</Text>
                    <Text className="text-amber-700 text-[10px] font-bold uppercase tracking-wider">Pending</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openDrillDown(stat, 'APPROVED')} className="flex-1 bg-green-50 p-3 rounded-2xl border border-green-100 items-center active:bg-green-100">
                    <Text className="text-green-900 font-black text-xl">{stat.approved}</Text>
                    <Text className="text-green-700 text-[10px] font-bold uppercase tracking-wider">Approved</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openDrillDown(stat, 'REJECTED')} className="flex-1 bg-red-50 p-3 rounded-2xl border border-red-100 items-center active:bg-red-100">
                    <Text className="text-red-900 font-black text-xl">{stat.rejected}</Text>
                    <Text className="text-red-700 text-[10px] font-bold uppercase tracking-wider">Rejected</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={() => openDrillDown(stat, 'ALL')} className="flex-row border-t border-slate-100 pt-4 active:opacity-60">
                  <View className="flex-1 border-r border-slate-100 items-center py-1">
                    <Text className="text-slate-400 font-bold text-[10px] uppercase mb-1">Equipment (Approved)</Text>
                    <Text className="text-slate-700 font-black text-lg">{stat.equipmentHours.toFixed(1)} hr</Text>
                    <Text className="text-slate-400 text-[10px] font-medium">{stat.equipmentCount} entries</Text>
                  </View>
                  <View className={`flex-1 items-center py-1 ${groupBy === 'job' ? 'border-r border-slate-100' : ''}`}>
                    <Text className="text-slate-400 font-bold text-[10px] uppercase mb-1">Labour (Approved)</Text>
                    <Text className="text-slate-700 font-black text-lg">{stat.labourHours.toFixed(1)} hr</Text>
                    <Text className="text-slate-400 text-[10px] font-medium">{stat.labourCount} entries</Text>
                  </View>
                  {groupBy === 'job' && (
                    <View className="flex-1 items-center py-1">
                      <Text className="text-slate-400 font-bold text-[10px] uppercase mb-1">Material (Approved)</Text>
                      <Text className="text-slate-700 font-black text-lg">{stat.materialCount}</Text>
                      <Text className="text-slate-400 text-[10px] font-medium text-center">{materialSummary(stat) || 'transfers'}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Drill-down list modal */}
      <Modal visible={!!selectedStat && !detailsModalVisible} transparent animationType="slide" onRequestClose={() => setSelectedStat(null)}>
        <View className="flex-1 bg-slate-900/60 justify-end">
          <View className="bg-white rounded-t-[32px] p-6 h-[90%]">
            <View className="flex-row justify-between items-center mb-4">
              <View className="flex-1 pr-2">
                <Text className="text-2xl font-black text-slate-900" numberOfLines={2}>{selectedStat?.name}</Text>
                <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider">{fromDate} to {toDate}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedStat(null)} className="bg-slate-100 p-2 rounded-full active:bg-slate-200">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View className="flex-row bg-slate-100 rounded-2xl p-1 mb-4 self-start">
              {(['ALL', 'SUBMITTED', 'APPROVED', 'REJECTED'] as StatusFilter[]).map(f => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setStatusFilter(f)}
                  className={`px-3.5 py-2 rounded-xl ${statusFilter === f ? 'bg-white shadow-sm' : ''}`}
                >
                  <Text className={`text-xs font-bold ${statusFilter === f ? 'text-slate-900' : 'text-slate-500'}`}>
                    {f === 'ALL' ? 'All' : f === 'SUBMITTED' ? 'Pending' : f.charAt(0) + f.slice(1).toLowerCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
              <View className="mb-6">
                <Text className="text-sm font-black text-slate-900 uppercase tracking-widest mb-3 px-1">Equipment ({filteredEquip.length})</Text>
                {filteredEquip.length === 0 ? (
                  <View className="py-8 items-center justify-center bg-slate-50 rounded-2xl border border-slate-100">
                    <Text className="text-slate-500 font-medium">No matching equipment entries.</Text>
                  </View>
                ) : (
                  filteredEquip.map(entry => (
                    <TouchableOpacity
                      key={entry.id}
                      activeOpacity={0.7}
                      onPress={() => { setSelectedEntry(entry); setEntryType('equipment'); setDetailsModalVisible(true); }}
                      className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-3"
                    >
                      <View className="flex-row justify-between items-start mb-2">
                        <View className="flex-1 pr-2">
                          <Text className="text-slate-900 font-bold text-base leading-tight mb-1">{entry.equipment_master?.equipment_name}</Text>
                          <Text className="text-slate-500 text-sm">{entry.vehicle_number} • {entry.foreman_name}</Text>
                        </View>
                        <StatusPill status={entry.status} />
                      </View>
                      <View className="flex-row justify-between bg-white p-3 rounded-xl border border-slate-100 mt-2">
                        <View>
                          <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Date</Text>
                          <Text className="text-slate-800 font-black text-base">{entry.entry_date}</Text>
                        </View>
                        <View className="items-end">
                          <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Hours</Text>
                          <Text className="text-slate-800 font-black text-base">{entry.working_hours} hr</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>

              <View className="mb-6">
                <Text className="text-sm font-black text-slate-900 uppercase tracking-widest mb-3 px-1">Labour ({filteredLabour.length})</Text>
                {filteredLabour.length === 0 ? (
                  <View className="py-8 items-center justify-center bg-slate-50 rounded-2xl border border-slate-100">
                    <Text className="text-slate-500 font-medium">No matching labour entries.</Text>
                  </View>
                ) : (
                  filteredLabour.map(entry => (
                    <TouchableOpacity
                      key={entry.id}
                      activeOpacity={0.7}
                      onPress={() => { setSelectedEntry(entry); setEntryType('labour'); setDetailsModalVisible(true); }}
                      className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-3"
                    >
                      <View className="flex-row justify-between items-start mb-2">
                        <View className="flex-1 pr-2">
                          <Text className="text-slate-900 font-bold text-base leading-tight mb-1">{entry.employee_name}</Text>
                          <Text className="text-slate-500 text-sm">{entry.labour_designations?.designation_name} • {entry.foreman_name}</Text>
                        </View>
                        <StatusPill status={entry.status} />
                      </View>
                      <View className="flex-row justify-between bg-white p-3 rounded-xl border border-slate-100 mt-2">
                        <View>
                          <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Date</Text>
                          <Text className="text-slate-800 font-black text-base">{entry.entry_date}</Text>
                        </View>
                        <View className="items-end">
                          <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Hours</Text>
                          <Text className="text-slate-800 font-black text-base">{entry.total_working_hours} hr</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>

              {groupBy === 'job' && (
                <View className="mb-6">
                  <Text className="text-sm font-black text-slate-900 uppercase tracking-widest mb-3 px-1">Material ({filteredMaterial.length})</Text>
                  {filteredMaterial.length === 0 ? (
                    <View className="py-8 items-center justify-center bg-slate-50 rounded-2xl border border-slate-100">
                      <Text className="text-slate-500 font-medium">No matching material transfers.</Text>
                    </View>
                  ) : (
                    filteredMaterial.map(entry => (
                      <TouchableOpacity
                        key={entry.id}
                        activeOpacity={0.7}
                        onPress={() => { setSelectedEntry(entry); setEntryType('material'); setDetailsModalVisible(true); }}
                        className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-3"
                      >
                        <View className="flex-row justify-between items-start mb-2">
                          <View className="flex-1 pr-2">
                            <Text className="text-slate-900 font-bold text-base leading-tight mb-1">{entry.material_description}</Text>
                            <Text className="text-slate-500 text-sm">{entry.from_job?.job_number} → {entry.to_job?.job_number}</Text>
                          </View>
                          <StatusPill status={entry.status} />
                        </View>
                        <View className="flex-row justify-between bg-white p-3 rounded-xl border border-slate-100 mt-2">
                          <View>
                            <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Quantity</Text>
                            <Text className="text-slate-800 font-black text-base">{entry.quantity} {entry.unit}</Text>
                          </View>
                          <View className="items-end">
                            <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Vehicle</Text>
                            <Text className="text-slate-800 font-black text-base">{entry.vehicle_number || 'N/A'}</Text>
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

                {entryType === 'material' ? (
                  <>
                    <View className="flex-row justify-between mb-4">
                      <View className="flex-1 mr-2">
                        <Text className="text-xs font-bold text-slate-400 uppercase mb-1">From Job</Text>
                        <Text className="text-slate-900 font-bold text-base">{selectedEntry.from_job?.job_number}</Text>
                        <Text className="text-slate-500 text-sm">{selectedEntry.from_job?.job_name}</Text>
                      </View>
                      <View className="flex-1 ml-2">
                        <Text className="text-xs font-bold text-slate-400 uppercase mb-1">To Job</Text>
                        <Text className="text-slate-900 font-bold text-base">{selectedEntry.to_job?.job_number}</Text>
                        <Text className="text-slate-500 text-sm">{selectedEntry.to_job?.job_name}</Text>
                      </View>
                    </View>

                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Material</Text>
                    <Text className="text-slate-900 font-bold text-base mb-4">{selectedEntry.material_description}</Text>

                    <View className="flex-row justify-between mb-6">
                      <View className="flex-1 bg-slate-50 p-4 rounded-2xl border border-slate-100 mr-2">
                        <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Quantity</Text>
                        <Text className="text-slate-900 font-bold text-lg">{selectedEntry.quantity} {selectedEntry.unit}</Text>
                      </View>
                      <View className="flex-1 bg-amber-50 p-4 rounded-2xl border border-amber-100 ml-2">
                        <Text className="text-xs font-bold text-amber-600 uppercase mb-1">Vehicle</Text>
                        <Text className="text-amber-700 font-black text-lg">{selectedEntry.vehicle_number || 'N/A'}</Text>
                      </View>
                    </View>

                    {!!selectedEntry.driver_name && (
                      <View className="mb-4">
                        <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Driver</Text>
                        <Text className="text-slate-900 font-bold text-base">{selectedEntry.driver_name}</Text>
                      </View>
                    )}
                  </>
                ) : (
                  <>
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
                  </>
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

                {selectedEntry.status === 'SUBMITTED' && (
                  <View className="mt-8 pt-6 border-t border-slate-100 flex-row space-x-3">
                    <TouchableOpacity
                      onPress={() => { setDetailsModalVisible(false); setRejectModalVisible(true); }}
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
