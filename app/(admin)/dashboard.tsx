import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Truck, Users, CheckCircle, Clock, ChevronRight, LayoutDashboard, Calendar, Filter } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getLocalDateString } from '../../lib/dateUtils';
import DatePickerModal from '../../components/DatePickerModal';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Download } from 'lucide-react-native';
import * as XLSX from 'xlsx-js-style';

export default function AdminDashboard() {
  const router = useRouter();

  const todayStr = getLocalDateString();
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);

  const [stats, setStats] = useState({
    pendingEquipment: 0,
    approvedEquipment: 0,
    pendingLabour: 0,
    approvedLabour: 0,
  });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchStats();
  }, [fromDate, toDate]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      let equipQuery = supabase.from('equipment_entries').select('status');
      let labourQuery = supabase.from('labour_entries').select('status');
      
      if (fromDate) {
        equipQuery = equipQuery.gte('entry_date', fromDate);
        labourQuery = labourQuery.gte('entry_date', fromDate);
      }
      if (toDate) {
        equipQuery = equipQuery.lte('entry_date', toDate);
        labourQuery = labourQuery.lte('entry_date', toDate);
      }

      const { data: equipData } = await equipQuery;
      const { data: labourData } = await labourQuery;

      let pe = 0, ae = 0, pl = 0, al = 0;

      equipData?.forEach(e => {
        if (e.status === 'SUBMITTED') pe++;
        if (e.status === 'APPROVED') ae++;
      });

      labourData?.forEach(l => {
        if (l.status === 'SUBMITTED') pl++;
        if (l.status === 'APPROVED') al++;
      });

      setStats({
        pendingEquipment: pe,
        approvedEquipment: ae,
        pendingLabour: pl,
        approvedLabour: al,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportDailyReport = async () => {
    setExporting(true);
    try {
      // Fetch both equipment and labour data for the selected date, with every related field joined in
      let equipQuery = supabase
        .from('equipment_entries')
        .select(`
          entry_date, rental_type, start_time, end_time, break_hours, working_hours, number_of_trips,
          vehicle_number, foreman_name, engineer_name, fuel_provided, fuel_quantity, fuel_unit,
          remarks, status, rejection_reason, equipment_photo_url,
          jobs(job_number, job_name, location),
          suppliers(supplier_name),
          equipment_master(equipment_name)
        `);

      let labourQuery = supabase
        .from('labour_entries')
        .select(`
          entry_date, employee_name, start_time, end_time, break_hours, total_working_hours,
          foreman_name, engineer_name, remarks, status, rejection_reason, labour_photo_url,
          jobs(job_number, job_name, location),
          suppliers(supplier_name),
          labour_designations(designation_name)
        `);

      if (fromDate) {
        equipQuery = equipQuery.gte('entry_date', fromDate);
        labourQuery = labourQuery.gte('entry_date', fromDate);
      }
      if (toDate) {
        equipQuery = equipQuery.lte('entry_date', toDate);
        labourQuery = labourQuery.lte('entry_date', toDate);
      }

      const { data: equipData, error: eErr } = await equipQuery;
      const { data: labourData, error: lErr } = await labourQuery;

      if (eErr || lErr) throw new Error('Failed to fetch data for export.');

      if ((!equipData || equipData.length === 0) && (!labourData || labourData.length === 0)) {
        alert('No data available to export for this date.');
        setExporting(false);
        return;
      }

      const headers = [
        'Type', 'Date', 'Job Number', 'Job Name', 'Location', 'Supplier',
        'Equipment Name', 'Rental Type', 'Employee Name', 'Designation',
        'Vehicle Number', 'Number of Trips', 'Start Time', 'End Time', 'Break Hours', 'Working Hours',
        'Fuel Provided', 'Fuel Quantity', 'Fuel Unit',
        'Foreman', 'Engineer', 'Remarks', 'Status', 'Rejection Reason', 'Photo URL',
      ];
      const rows: unknown[][] = [];

      equipData?.forEach((e: any) => {
        rows.push([
          'Equipment', e.entry_date, e.jobs?.job_number || '', e.jobs?.job_name || '', e.jobs?.location || '',
          e.suppliers?.supplier_name || '',
          e.equipment_master?.equipment_name || '', e.rental_type, '', '',
          e.vehicle_number || '', e.number_of_trips ?? '', e.start_time || '', e.end_time || '', e.break_hours ?? '', e.working_hours ?? '',
          e.fuel_provided ? 'Yes' : 'No', e.fuel_quantity ?? '', e.fuel_unit || '',
          e.foreman_name || '', e.engineer_name || '', e.remarks || '', e.status, e.rejection_reason || '', e.equipment_photo_url || '',
        ]);
      });

      labourData?.forEach((l: any) => {
        rows.push([
          'Labour', l.entry_date, l.jobs?.job_number || '', l.jobs?.job_name || '', l.jobs?.location || '',
          l.suppliers?.supplier_name || '',
          '', '', l.employee_name || '', l.labour_designations?.designation_name || '',
          '', '', l.start_time || '', l.end_time || '', l.break_hours ?? '', l.total_working_hours ?? '',
          '', '', '',
          l.foreman_name || '', l.engineer_name || '', l.remarks || '', l.status, l.rejection_reason || '', l.labour_photo_url || '',
        ]);
      });

      // Build a styled worksheet so APPROVED rows can be shaded green
      const statusColIndex = headers.indexOf('Status');
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

      const columnWidths = [
        10, 12, 12, 20, 18, 22, 22, 12, 16, 14,
        14, 14, 10, 10, 11, 13, 12, 12, 10,
        14, 14, 24, 12, 20, 45,
      ];
      worksheet['!cols'] = columnWidths.map(wch => ({ wch }));

      headers.forEach((_, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
        if (worksheet[cellRef]) {
          worksheet[cellRef].s = { font: { bold: true }, fill: { fgColor: { rgb: 'FFE2E8F0' } } };
        }
      });

      rows.forEach((row, rowIndex) => {
        if (row[statusColIndex] !== 'APPROVED') return;
        headers.forEach((_, colIndex) => {
          const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
          if (worksheet[cellRef]) {
            worksheet[cellRef].s = {
              fill: { fgColor: { rgb: 'FFC6EFCE' } },
              font: { color: { rgb: 'FF006100' } },
            };
          }
        });
      });

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');

      if (Platform.OS === 'web') {
        const fileName = `Report_${fromDate}_to_${toDate}.xlsx`;
        const wbArray = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
        const blob = new Blob([wbArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const fileUri = `${FileSystem.documentDirectory}Report_${fromDate}_to_${toDate}.xlsx`;
        const wbBase64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
        await FileSystem.writeAsStringAsync(fileUri, wbBase64, { encoding: FileSystem.EncodingType.Base64 });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Export Daily Report',
          });
        } else {
          alert('Sharing is not available on this device.');
        }
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setExporting(false);
    }
  };

  const StatCard = ({ title, value, icon: Icon, colorClass, bgColorClass, iconColor, onPress }: any) => (
    <TouchableOpacity 
      onPress={onPress} 
      className="bg-white p-6 rounded-2xl border border-slate-200 mb-4 justify-between active:scale-[0.98] transition-transform shadow-sm"
      style={{ width: '48%' }}
    >
      <View className="flex-row justify-between items-start mb-4">
        <View className={`${bgColorClass} p-2.5 rounded-xl`}>
          <Icon size={20} color={iconColor} strokeWidth={2.5} />
        </View>
      </View>
      <View>
        <Text className={`text-5xl font-mono-bold ${colorClass} tracking-tighter mb-1`}>{value}</Text>
        <Text className="text-slate-500 text-[10px] font-outfit-bold uppercase tracking-widest leading-tight">{title}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-slate-50">
      <StatusBar barStyle="light-content" />
      
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false} bounces={false}>
        {/* Premium Header */}
        <View className="bg-slate-950 pt-16 pb-8 px-6 rounded-b-[32px] border-b border-slate-900 shadow-sm">
          <View className="flex-row items-center justify-between mb-2">
            <View>
              <Text className="text-white text-3xl font-outfit-black tracking-tight">Dashboard</Text>
              <Text className="text-indigo-400 text-xs font-outfit-bold uppercase tracking-widest mt-1">Island Tower Admin</Text>
            </View>
            <View className="bg-white/10 p-4 rounded-2xl">
              <LayoutDashboard size={28} color="#ffffff" strokeWidth={2} />
            </View>
          </View>
        </View>

        <View className="px-5 pt-6">
        {/* Date Range Header */}
        <View className="flex-row justify-between items-center mb-6 mt-[-10px] bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <View className="flex-1 mr-3">
            <Text className="text-slate-500 text-[10px] font-outfit-bold uppercase tracking-widest mb-1">Showing Data For</Text>
            <Text className="text-slate-900 font-mono-bold text-sm flex-wrap">
              {fromDate === toDate ? (
                <Text>
                  {fromDate} <Text className="text-slate-400 text-[10px] font-outfit-bold uppercase tracking-widest ml-1">{new Date(fromDate).toLocaleDateString('en-US', { weekday: 'long' })}</Text>
                </Text>
              ) : (
                <Text>
                  {fromDate} <Text className="text-slate-400 text-[10px] font-outfit-bold uppercase tracking-widest mx-1">{new Date(fromDate).toLocaleDateString('en-US', { weekday: 'short' })}</Text> 
                  <Text className="text-slate-400 mx-1">to</Text> 
                  {toDate} <Text className="text-slate-400 text-[10px] font-outfit-bold uppercase tracking-widest ml-1">{new Date(toDate).toLocaleDateString('en-US', { weekday: 'short' })}</Text>
                </Text>
              )}
            </Text>
          </View>
          <TouchableOpacity 
            onPress={() => setIsFilterExpanded(!isFilterExpanded)}
            className={`flex-shrink-0 px-3 py-2 rounded-full flex-row items-center border ${isFilterExpanded ? 'bg-slate-900 border-slate-900' : 'bg-indigo-50 border-indigo-100'}`}
          >
            <Filter size={14} color={isFilterExpanded ? '#ffffff' : '#4f46e5'} />
            <Text className={`font-outfit-bold text-[10px] ml-1.5 tracking-wide ${isFilterExpanded ? 'text-white' : 'text-indigo-600'}`}>
              {isFilterExpanded ? 'HIDE' : 'FILTER'}
            </Text>
          </TouchableOpacity>
        </View>

        {isFilterExpanded && (
          <View className={`mb-6 flex-row gap-3`}>
            <TouchableOpacity 
              className="flex-row items-center bg-white border border-slate-200 rounded-2xl p-4 flex-1 shadow-sm active:scale-[0.99] relative overflow-hidden"
              onPress={() => setShowFromPicker(true)}
            >
              <View className="bg-indigo-50 p-3 rounded-xl mr-3 border border-indigo-100" pointerEvents="none">
                <Calendar size={20} color="#4f46e5" />
              </View>
              <View className="flex-1" pointerEvents="none">
                <Text className="text-slate-400 text-[10px] font-outfit-bold uppercase tracking-widest mb-1">From Date</Text>
                <Text className="text-slate-900 font-mono-bold text-base">{fromDate}</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity 
              className="flex-row items-center bg-white border border-slate-200 rounded-2xl p-4 flex-1 shadow-sm active:scale-[0.99] relative overflow-hidden"
              onPress={() => setShowToPicker(true)}
            >
              <View className="bg-indigo-50 p-3 rounded-xl mr-3 border border-indigo-100" pointerEvents="none">
                <Calendar size={20} color="#4f46e5" />
              </View>
              <View className="flex-1" pointerEvents="none">
                <Text className="text-slate-400 text-[10px] font-outfit-bold uppercase tracking-widest mb-1">To Date</Text>
                <Text className="text-slate-900 font-mono-bold text-base">{toDate}</Text>
              </View>
            </TouchableOpacity>

            <DatePickerModal
              visible={showFromPicker}
              date={fromDate}
              onClose={() => setShowFromPicker(false)}
              onSelect={(d) => setFromDate(d)}
            />
            
            <DatePickerModal
              visible={showToPicker}
              date={toDate}
              onClose={() => setShowToPicker(false)}
              onSelect={(d) => setToDate(d)}
            />
          </View>
        )}
        
        {loading ? (
          <View className="py-20 items-center justify-center">
            <ActivityIndicator size="large" color="#1e3a8a" />
            <Text className="text-slate-500 mt-4 font-medium">Loading statistics...</Text>
          </View>
        ) : (
          <>
            {/* Statistics Grid */}
            <View className="flex-row flex-wrap justify-between">
              <StatCard 
                title="Pending Equipment" 
                value={stats.pendingEquipment} 
                icon={Clock} 
                colorClass="text-amber-600"
                bgColorClass="bg-amber-100"
                iconColor="#d97706"
                onPress={() => router.push({ pathname: '/(admin)/equipment', params: { filter: 'SUBMITTED' } })}
              />
              <StatCard 
                title="Pending Labour" 
                value={stats.pendingLabour} 
                icon={Clock} 
                colorClass="text-amber-600"
                bgColorClass="bg-amber-100"
                iconColor="#d97706"
                onPress={() => router.push({ pathname: '/(admin)/labour', params: { filter: 'SUBMITTED' } })}
              />
              <StatCard 
                title="Approved Equipment" 
                value={stats.approvedEquipment} 
                icon={CheckCircle} 
                colorClass="text-green-600"
                bgColorClass="bg-green-100"
                iconColor="#16a34a"
                onPress={() => router.push({ pathname: '/(admin)/equipment', params: { filter: 'APPROVED' } })}
              />
              <StatCard 
                title="Approved Labour" 
                value={stats.approvedLabour} 
                icon={CheckCircle} 
                colorClass="text-green-600"
                bgColorClass="bg-green-100"
                iconColor="#16a34a"
                onPress={() => router.push({ pathname: '/(admin)/labour', params: { filter: 'APPROVED' } })}
              />
            </View>

            {(!loading && stats.pendingEquipment === 0 && stats.pendingLabour === 0) && (
              <View className="mb-6 bg-emerald-50 p-6 rounded-2xl border border-emerald-200 items-center justify-center">
                <View className="bg-emerald-100 p-3 rounded-full mb-3">
                  <CheckCircle size={28} color="#10b981" />
                </View>
                <Text className="text-emerald-900 text-xl font-outfit-bold tracking-tight">All caught up!</Text>
                <Text className="text-emerald-700 text-center mt-1 text-sm font-outfit-medium">No pending entries require approval.</Text>
              </View>
            )}

            {/* Quick Actions */}
            <View className="mt-2 mb-8">
              <Text className="text-slate-900 text-sm font-outfit-bold uppercase tracking-widest mb-4 px-1">Quick Actions</Text>
              
              <TouchableOpacity 
                onPress={() => router.push('/(admin)/equipment')}
                className="bg-white flex-row items-center p-4 rounded-2xl border border-slate-200 mb-3 shadow-sm active:scale-[0.99] transition-transform"
              >
                <View className="bg-slate-50 p-3 rounded-xl mr-4 border border-slate-100">
                  <Truck size={20} color="#475569" />
                </View>
                <View className="flex-1">
                  <Text className="text-slate-900 font-outfit-bold text-[15px]">Manage Equipment</Text>
                  <Text className="text-slate-500 text-[11px] mt-0.5 font-outfit-medium">Review and approve daily entries</Text>
                </View>
                <ChevronRight size={18} color="#cbd5e1" />
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={() => router.push('/(admin)/labour')}
                className="bg-white flex-row items-center p-4 rounded-2xl border border-slate-200 shadow-sm active:scale-[0.99] transition-transform"
              >
                <View className="bg-slate-50 p-3 rounded-xl mr-4 border border-slate-100">
                  <Users size={20} color="#475569" />
                </View>
                <View className="flex-1">
                  <Text className="text-slate-900 font-outfit-bold text-[15px]">Manage Labour</Text>
                  <Text className="text-slate-500 text-[11px] mt-0.5 font-outfit-medium">Review and approve daily timesheets</Text>
                </View>
                <ChevronRight size={18} color="#cbd5e1" />
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={exportDailyReport}
                disabled={exporting}
                className="bg-slate-950 flex-row items-center p-4 rounded-2xl active:scale-[0.99] transition-transform mt-3 shadow-sm"
              >
                <View className="bg-slate-800 p-3 rounded-xl mr-4">
                  {exporting ? <ActivityIndicator color="#fff" size="small" /> : <Download size={20} color="#ffffff" />}
                </View>
                <View className="flex-1">
                  <Text className="text-white font-outfit-bold text-[15px]">Export Daily CSV</Text>
                  <Text className="text-slate-400 text-[11px] mt-0.5 font-outfit-medium">Download for Google Sheets or Excel</Text>
                </View>
                <ChevronRight size={18} color="#475569" />
              </TouchableOpacity>
            </View>
          </>
        )}
        </View>
      </ScrollView>
    </View>
  );
}
