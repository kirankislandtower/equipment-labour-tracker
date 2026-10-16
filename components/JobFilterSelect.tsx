import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, FlatList } from 'react-native';
import { Briefcase, ChevronDown, X, Search, Check } from 'lucide-react-native';

export interface JobOption {
  id: string;
  job_number: string;
  job_name: string;
}

interface JobFilterSelectProps {
  jobs: JobOption[];
  value: string; // 'ALL' or a job id
  onChange: (value: string) => void;
  className?: string;
}

// Filter-by-job control for the admin review screens, matching the existing
// From/To date filter's visual style. A styled, searchable list in a
// centered dialog -- same "Add New X" dialog pattern already used elsewhere
// in the admin portal -- instead of the browser's unstyleable native
// <select> popup.
export default function JobFilterSelect({ jobs, value, onChange, className = 'flex-1' }: JobFilterSelectProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState('');

  const selected = jobs.find(j => j.id === value);
  const label = selected ? `${selected.job_number} - ${selected.job_name}` : 'All Jobs';

  const filtered = search.trim()
    ? jobs.filter(j => j.job_number.toLowerCase().includes(search.trim().toLowerCase()) || j.job_name.toLowerCase().includes(search.trim().toLowerCase()))
    : jobs;

  return (
    <View className={className}>
      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        className="flex-row items-center bg-white border border-slate-200 rounded-xl px-4 py-3"
      >
        <Briefcase size={16} color="#64748b" />
        <Text className="text-slate-500 text-xs font-bold ml-2 mr-3">JOB</Text>
        <Text className="flex-1 text-slate-900 font-bold text-sm" numberOfLines={1}>{label}</Text>
        <ChevronDown size={16} color="#64748b" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade" onShow={() => setSearch('')} onRequestClose={() => setModalVisible(false)}>
        <View className="flex-1 bg-black/50 justify-center items-center p-8">
          <View className="bg-white w-full max-w-2xl rounded-2xl shadow-xl" style={{ maxHeight: '80%' }}>
            <View className="flex-row items-center justify-between p-5 border-b border-slate-100">
              <Text className="text-xl font-bold text-slate-900">Filter by Job</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} className="p-2 bg-slate-100 rounded-full active:opacity-60">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl mx-5 mt-4 mb-2 px-4 h-12">
              <Search size={18} color="#94a3b8" />
              <TextInput
                placeholder="Search jobs..."
                placeholderTextColor="#94a3b8"
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                className="flex-1 ml-3 text-slate-900"
                style={{ outlineStyle: 'none' } as any}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')} className="p-1">
                  <X size={16} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={[{ id: 'ALL', job_number: 'All Jobs', job_name: '' }, ...filtered]}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => { onChange(item.id); setModalVisible(false); }}
                  className="flex-row items-center justify-between px-5 py-3.5 border-b border-slate-50 active:bg-slate-50"
                >
                  <Text className={`text-sm flex-1 mr-2 ${value === item.id ? 'font-bold text-slate-900' : 'text-slate-700 font-medium'}`} numberOfLines={1}>
                    {item.id === 'ALL' ? 'All Jobs' : `${item.job_number} - ${item.job_name}`}
                  </Text>
                  {value === item.id && <Check size={18} color="#0f172a" />}
                </TouchableOpacity>
              )}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 12 }}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
