import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, useWindowDimensions, Platform, Modal } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Download, Calendar, LogIn, LogOut, Search, ChevronRight, X } from 'lucide-react-native';
import { getLocalDateString } from '../../lib/dateUtils';
import DatePickerModal from '../../components/DatePickerModal';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { buildCSV } from '../../lib/csv';

interface GroupedUser {
  user_id: string;
  full_name: string;
  role: string;
  logs: any[];
  total_logs: number;
  latest_action: string;
  latest_time: string;
}

export default function AdminAttendance() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const todayStr = getLocalDateString();

  const [logs, setLogs] = useState<any[]>([]);
  const [groupedLogs, setGroupedLogs] = useState<GroupedUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<GroupedUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [filterDate, setFilterDate] = useState<string>(todayStr);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [modalFilterDate, setModalFilterDate] = useState<string>(''); 
  const [showModalDatePicker, setShowModalDatePicker] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, [filterDate]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('attendance_logs')
        .select(`
          *,
          users (full_name, role)
        `)
        .order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      
      setLogs(data || []);

      const userLogsMap: Record<string, any[]> = {};
      data?.forEach(log => {
        if (!userLogsMap[log.user_id]) userLogsMap[log.user_id] = [];
        userLogsMap[log.user_id].push(log);
      });

      const groups: Record<string, GroupedUser> = {};
      
      data?.forEach(log => {
        const d = new Date(log.created_at);
        const logDate = getLocalDateString(d);
        if (filterDate && logDate !== filterDate) return;

        const userId = log.user_id;
        if (!groups[userId]) {
          groups[userId] = {
            user_id: userId,
            full_name: log.users?.full_name || 'Unknown User',
            role: log.users?.role || 'FOREMAN',
            logs: userLogsMap[userId], 
            total_logs: 0,
            latest_action: log.action,
            latest_time: log.created_at,
          };
        }
        groups[userId].total_logs += 1;
      });
      
      setGroupedLogs(Object.values(groups));
    } catch (error) {
      console.error('Error fetching attendance logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = async () => {
    try {
      const headers = ['Date', 'Time', 'Employee Name', 'Role', 'Action'];
      const rows = logs.map(log => {
        const dateObj = new Date(log.created_at);
        return [
          dateObj.toLocaleDateString(),
          dateObj.toLocaleTimeString(),
          log.users?.full_name || 'Unknown User',
          log.users?.role || '',
          log.action
        ];
      });
      
      const csvContent = buildCSV(headers, rows);
      const fileName = `attendance_logs_${getLocalDateString()}.csv`;

      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        
        try {
          const file = new File([blob], fileName, { type: 'text/csv' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: 'Export Attendance Logs',
            });
            return;
          }
        } catch (err) {
          // Fall through
        }

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
            dialogTitle: 'Export Attendance Logs',
          });
        }
      }
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: isMobile ? 16 : 32, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      <View className={`flex-row justify-between items-center mb-8 ${isMobile ? 'flex-wrap gap-y-4' : ''}`}>
        <View>
          <Text className="text-slate-900 text-3xl font-black tracking-tight">Attendance</Text>
          <Text className="text-slate-500 text-base mt-2">Track foreman logins and logouts.</Text>
        </View>
        
        <TouchableOpacity 
          onPress={exportToCSV}
          className="flex-row items-center bg-indigo-600 px-5 py-3 rounded-xl active:bg-indigo-700 shadow-sm"
        >
          <Download size={20} color="#ffffff" />
          <Text className="text-white font-bold ml-2">Export CSV</Text>
        </TouchableOpacity>
      </View>

      {/* Date Filter */}
      <View className="mb-6">
        <TouchableOpacity 
          className="flex-row items-center bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm w-full md:w-64"
          onPress={() => setShowDatePicker(true)}
        >
          <Calendar size={16} color="#64748b" pointerEvents="none" />
          <Text className="text-slate-500 text-xs font-bold ml-2 mr-3" pointerEvents="none">DATE</Text>
          <Text className="flex-1 text-slate-900 font-bold text-base h-6" pointerEvents="none">{filterDate}</Text>
        </TouchableOpacity>
        
        <DatePickerModal
          visible={showDatePicker}
          date={filterDate}
          onClose={() => setShowDatePicker(false)}
          onSelect={(d) => setFilterDate(d)}
        />
      </View>

      {/* Main Content */}
      <View className="bg-transparent overflow-hidden">
        {loading ? (
          <View className="flex-1 justify-center items-center py-20">
            <ActivityIndicator size="large" color="#0f172a" />
          </View>
        ) : (
          <View className="flex-1 pb-6">
            {groupedLogs.length === 0 ? (
              <View className="py-20 items-center">
                <View className="bg-slate-100 p-4 rounded-full mb-4">
                  <Search size={32} color="#94a3b8" />
                </View>
                <Text className="text-slate-500 font-medium text-base">No attendance logs found for this date range.</Text>
              </View>
            ) : (
              <View className="flex-row flex-wrap gap-4">
                {groupedLogs.map((group) => {
                  const dateObj = new Date(group.latest_time);
                  const isLogin = group.latest_action === 'LOGIN';
                  
                  return (
                    <TouchableOpacity 
                      key={group.user_id} 
                      onPress={() => setSelectedUser(group)}
                      className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-5 ${isMobile ? 'w-full' : 'w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)]'} active:opacity-70`}
                    >
                      <View className="flex-row justify-between items-start mb-4">
                        <View className="flex-1 pr-3">
                          <Text className="text-slate-900 font-black text-lg tracking-tight mb-1" numberOfLines={1}>{group.full_name}</Text>
                          <View className="bg-slate-100 self-start px-2 py-1 rounded">
                            <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                              {group.role}
                            </Text>
                          </View>
                        </View>
                        <View className="bg-blue-50 w-10 h-10 rounded-full items-center justify-center">
                          <Text className="text-blue-700 font-black">{group.total_logs}</Text>
                        </View>
                      </View>
                      
                      <View className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <Text className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Latest Activity</Text>
                        <View className="flex-row justify-between items-center">
                          <View className={`flex-row items-center px-2.5 py-1 rounded-full ${isLogin ? 'bg-green-100' : 'bg-red-100'}`}>
                            {isLogin ? <LogIn size={12} color="#16a34a" /> : <LogOut size={12} color="#dc2626" />}
                            <Text className={`text-[10px] font-bold ml-1.5 uppercase tracking-wider ${isLogin ? 'text-green-700' : 'text-red-700'}`}>
                              {group.latest_action}
                            </Text>
                          </View>
                          <Text className="text-slate-600 font-medium text-sm">{dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </View>
      </ScrollView>

      {/* Details Modal */}
      <Modal visible={!!selectedUser} transparent animationType="slide" onRequestClose={() => setSelectedUser(null)}>
        <View className="flex-1 bg-black/60 justify-end">
          <View className={`bg-white h-[85%] rounded-t-3xl border-t border-slate-200 shadow-2xl flex-col ${!isMobile ? 'max-w-2xl w-full self-center' : ''}`}>
            {/* Modal Header */}
            <View className="flex-row items-center justify-between p-6 border-b border-slate-100">
              <View>
                <Text className="text-slate-900 text-2xl font-black tracking-tight mb-1">{selectedUser?.full_name}</Text>
                <Text className="text-slate-500 font-medium">Activity History</Text>
              </View>
              <View className="flex-row items-center gap-3">
                <TouchableOpacity 
                  onPress={() => setShowModalDatePicker(true)}
                  className={`flex-row items-center px-4 py-2.5 rounded-xl border ${modalFilterDate ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'} active:opacity-70`}
                >
                  <Calendar size={18} color={modalFilterDate ? '#4f46e5' : '#64748b'} />
                  {modalFilterDate ? (
                    <TouchableOpacity onPress={() => setModalFilterDate('')} className="ml-2 bg-indigo-100 p-1 rounded-full active:opacity-60">
                      <X size={12} color="#4f46e5" />
                    </TouchableOpacity>
                  ) : null}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectedUser(null)} className="p-3 bg-slate-100 rounded-full active:opacity-60">
                  <X size={24} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Modal Body */}
            <ScrollView className="flex-1 bg-slate-50 p-6">
              {(() => {
                const filteredLogs: any[] = modalFilterDate
                  ? (selectedUser?.logs || []).filter((log: any) => getLocalDateString(new Date(log.created_at)) === modalFilterDate)
                  : (selectedUser?.logs || []);

                const groupedByDate: Record<string, any[]> = filteredLogs.reduce((acc: Record<string, any[]>, log: any) => {
                  const dateObj = new Date(log.created_at);
                  const today = new Date();
                  const yesterday = new Date(today);
                  yesterday.setDate(yesterday.getDate() - 1);

                  let dateLabel = '';
                  if (dateObj.toDateString() === today.toDateString()) {
                    dateLabel = 'Today';
                  } else if (dateObj.toDateString() === yesterday.toDateString()) {
                    dateLabel = 'Yesterday';
                  } else {
                    dateLabel = dateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                  }

                  if (!acc[dateLabel]) acc[dateLabel] = [];
                  acc[dateLabel].push(log);
                  return acc;
                }, {});

                return Object.entries(groupedByDate).map(([dateLabel, logsForDate]) => (
                  <View key={dateLabel} className="mb-6">
                    <Text className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-3 ml-2">{dateLabel}</Text>
                    <View className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                      {logsForDate.map((log, idx) => {
                        const dObj = new Date(log.created_at);
                        const isLogLogin = log.action === 'LOGIN';
                        
                        return (
                          <View key={log.id} className={`p-4 flex-row items-center justify-between ${idx !== logsForDate.length - 1 ? 'border-b border-slate-100' : ''}`}>
                            <View className="flex-row items-center">
                              <View className={`w-12 h-12 rounded-full items-center justify-center mr-4 ${isLogLogin ? 'bg-green-100' : 'bg-red-100'}`}>
                                {isLogLogin ? <LogIn size={20} color="#16a34a" /> : <LogOut size={20} color="#dc2626" />}
                              </View>
                              <View>
                                <Text className="text-slate-900 font-bold text-base">{isLogLogin ? 'Logged In' : 'Logged Out'}</Text>
                                <Text className="text-slate-500 text-sm mt-0.5">{dObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                              </View>
                            </View>
                            <Text className={`font-black text-sm uppercase tracking-wider ${isLogLogin ? 'text-green-600' : 'text-red-600'}`}>
                              {log.action}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ));
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <DatePickerModal
        visible={showModalDatePicker}
        date={modalFilterDate || todayStr}
        onClose={() => setShowModalDatePicker(false)}
        onSelect={(d) => setModalFilterDate(d)}
      />
    </View>
  );
}
