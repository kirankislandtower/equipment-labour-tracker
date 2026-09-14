import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, useWindowDimensions, Platform, Modal } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Calendar, Briefcase, Building2, BarChart3 } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getLocalDateString, getFirstOfMonthString } from '../../lib/dateUtils';
import ExportCSVButton from '../../components/ExportCSVButton';

type GroupBy = 'job' | 'supplier';

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

  const [loading, setLoading] = useState(true);
  const [jobStats, setJobStats] = useState<Stat[]>([]);
  const [supplierStats, setSupplierStats] = useState<Stat[]>([]);

  useEffect(() => {
    fetchData();
  }, [fromDate, toDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [equipRes, labourRes, materialRes] = await Promise.all([
        supabase.from('equipment_entries').select('*, jobs:job_id(job_number, job_name), suppliers(supplier_name)').gte('entry_date', fromDate).lte('entry_date', toDate),
        supabase.from('labour_entries').select('*, jobs:job_id(job_number, job_name), suppliers(supplier_name)').gte('entry_date', fromDate).lte('entry_date', toDate),
        supabase.from('material_transfers').select('*, from_job:from_job_id(job_number, job_name)').gte('entry_date', fromDate).lte('entry_date', toDate),
      ]);

      if (equipRes.error) console.error('Error fetching equipment entries for reports:', equipRes.error);
      if (labourRes.error) console.error('Error fetching labour entries for reports:', labourRes.error);
      if (materialRes.error) console.error('Error fetching material transfers for reports:', materialRes.error);

      const equipData = equipRes.data || [];
      const labourData = labourRes.data || [];
      const materialData = materialRes.data || [];

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

      equipData.forEach((entry: any) => {
        if (entry.job_id) {
          const stat = jobAgg.ensure(entry.job_id, entry.jobs ? `${entry.jobs.job_number} - ${entry.jobs.job_name}` : 'Unknown Job');
          bumpStatus(stat, entry.status);
          stat.equipmentCount++;
          stat.equipmentHours += parseFloat(entry.working_hours) || 0;
        }
        if (entry.supplier_id) {
          const stat = supplierAgg.ensure(entry.supplier_id, entry.suppliers?.supplier_name || 'Unknown Supplier');
          bumpStatus(stat, entry.status);
          stat.equipmentCount++;
          stat.equipmentHours += parseFloat(entry.working_hours) || 0;
        }
      });

      labourData.forEach((entry: any) => {
        if (entry.job_id) {
          const stat = jobAgg.ensure(entry.job_id, entry.jobs ? `${entry.jobs.job_number} - ${entry.jobs.job_name}` : 'Unknown Job');
          bumpStatus(stat, entry.status);
          stat.labourCount++;
          stat.labourHours += parseFloat(entry.total_working_hours) || 0;
        }
        if (entry.supplier_id) {
          const stat = supplierAgg.ensure(entry.supplier_id, entry.suppliers?.supplier_name || 'Unknown Supplier');
          bumpStatus(stat, entry.status);
          stat.labourCount++;
          stat.labourHours += parseFloat(entry.total_working_hours) || 0;
        }
      });

      // Material has no supplier field -- attributed to its source job only.
      materialData.forEach((entry: any) => {
        if (entry.from_job_id) {
          const stat = jobAgg.ensure(entry.from_job_id, entry.from_job ? `${entry.from_job.job_number} - ${entry.from_job.job_name}` : 'Unknown Job');
          bumpStatus(stat, entry.status);
          stat.materialCount++;
          const unit = entry.unit || 'unit';
          stat.materialByUnit[unit] = (stat.materialByUnit[unit] || 0) + (parseFloat(entry.quantity) || 0);
        }
      });

      const toSorted = (agg: Record<string, Stat>) => Object.values(agg).sort((a, b) => b.total - a.total);

      setJobStats(toSorted(jobAgg.byKey));
      setSupplierStats(toSorted(supplierAgg.byKey));
    } catch (error) {
      console.error('Error fetching usage reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const stats = groupBy === 'job' ? jobStats : supplierStats;

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
    'Equipment Hours': stat.equipmentHours.toFixed(2),
    'Equipment Entries': stat.equipmentCount,
    'Labour Hours': stat.labourHours.toFixed(2),
    'Labour Entries': stat.labourCount,
    ...(groupBy === 'job' ? { 'Material Transfers': stat.materialCount, 'Material Quantity': materialSummary(stat) || '' } : {}),
  }));

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
            <Text className="text-slate-500 mt-1">No entries between {fromDate} and {toDate}.</Text>
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
                  <View className="flex-1 bg-amber-50 p-3 rounded-2xl border border-amber-100 items-center">
                    <Text className="text-amber-900 font-black text-xl">{stat.pending}</Text>
                    <Text className="text-amber-700 text-[10px] font-bold uppercase tracking-wider">Pending</Text>
                  </View>
                  <View className="flex-1 bg-green-50 p-3 rounded-2xl border border-green-100 items-center">
                    <Text className="text-green-900 font-black text-xl">{stat.approved}</Text>
                    <Text className="text-green-700 text-[10px] font-bold uppercase tracking-wider">Approved</Text>
                  </View>
                  <View className="flex-1 bg-red-50 p-3 rounded-2xl border border-red-100 items-center">
                    <Text className="text-red-900 font-black text-xl">{stat.rejected}</Text>
                    <Text className="text-red-700 text-[10px] font-bold uppercase tracking-wider">Rejected</Text>
                  </View>
                </View>

                <View className="flex-row border-t border-slate-100 pt-4">
                  <View className="flex-1 border-r border-slate-100 items-center py-1">
                    <Text className="text-slate-400 font-bold text-[10px] uppercase mb-1">Equipment</Text>
                    <Text className="text-slate-700 font-black text-lg">{stat.equipmentHours.toFixed(1)} hr</Text>
                    <Text className="text-slate-400 text-[10px] font-medium">{stat.equipmentCount} entries</Text>
                  </View>
                  <View className={`flex-1 items-center py-1 ${groupBy === 'job' ? 'border-r border-slate-100' : ''}`}>
                    <Text className="text-slate-400 font-bold text-[10px] uppercase mb-1">Labour</Text>
                    <Text className="text-slate-700 font-black text-lg">{stat.labourHours.toFixed(1)} hr</Text>
                    <Text className="text-slate-400 text-[10px] font-medium">{stat.labourCount} entries</Text>
                  </View>
                  {groupBy === 'job' && (
                    <View className="flex-1 items-center py-1">
                      <Text className="text-slate-400 font-bold text-[10px] uppercase mb-1">Material</Text>
                      <Text className="text-slate-700 font-black text-lg">{stat.materialCount}</Text>
                      <Text className="text-slate-400 text-[10px] font-medium text-center">{materialSummary(stat) || 'transfers'}</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
