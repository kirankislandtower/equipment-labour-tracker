import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, TextInput } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Search, MapPin, Truck, Users, UserPlus, X, ClipboardCheck } from 'lucide-react-native';
import { FadeInUp } from '../../components/Animations';

// Read-only view of what's currently allocated to a Job Site -- for when
// someone just needs to answer "what did we give job 1686/26", without
// opening Site Allocations (which is for editing/adding/removing).
export default function AllocationReportScreen() {
  const [loading, setLoading] = useState(true);
  const [activeCompany, setActiveCompany] = useState<'IST' | 'JAH' | 'HYDRO'>('IST');
  const [jobs, setJobs] = useState<{ id: string; job_number: string; job_name: string }[]>([]);
  const [allEquipment, setAllEquipment] = useState<any[]>([]);
  const [allSuppliers, setAllSuppliers] = useState<any[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState<{ id: string; job_number: string; job_name: string } | null>(null);

  const [detailLoading, setDetailLoading] = useState(false);
  const [allocatedEquipmentByScope, setAllocatedEquipmentByScope] = useState<Record<string, Set<string>>>({});
  const [allocatedSupplierIds, setAllocatedSupplierIds] = useState<Set<string>>(new Set());
  const [employeesByScope, setEmployeesByScope] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    fetchInitialData();
    setSelectedJob(null);
    setSearchQuery('');
  }, [activeCompany]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      // Deliberately not filtered to is_active -- an old job's allocation can
      // still point at equipment or a supplier that's since been deactivated
      // in Master Data, and the report should still be able to name it.
      const [jobsRes, equipRes, suppRes] = await Promise.all([
        supabase.from('jobs').select('id, job_number, job_name').eq('company', activeCompany).order('job_number'),
        supabase.from('equipment_master').select('id, equipment_category, equipment_name').eq('company', activeCompany),
        supabase.from('suppliers').select('id, supplier_name, supplier_type').eq('company', activeCompany),
      ]);
      setJobs(jobsRes.data || []);
      setAllEquipment(equipRes.data || []);
      setAllSuppliers(suppRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const equipmentById = useMemo(() => {
    const map: Record<string, { name: string; category: string }> = {};
    allEquipment.forEach((e) => {
      map[e.id] = { name: e.equipment_name, category: e.equipment_category || 'Uncategorized' };
    });
    return map;
  }, [allEquipment]);

  const supplierById = useMemo(() => {
    const map: Record<string, { name: string; type: string }> = {};
    allSuppliers.forEach((s) => {
      map[s.id] = { name: s.supplier_name, type: s.supplier_type };
    });
    return map;
  }, [allSuppliers]);

  const selectJob = async (job: { id: string; job_number: string; job_name: string }) => {
    setSelectedJob(job);
    setDetailLoading(true);
    try {
      const [equipAlloc, suppAlloc, empAlloc] = await Promise.all([
        supabase.from('job_equipment').select('equipment_master_id, supplier_id').eq('job_id', job.id),
        supabase.from('job_suppliers').select('supplier_id').eq('job_id', job.id),
        supabase.from('job_supplier_employees').select('supplier_id, employee_name').eq('job_id', job.id),
      ]);

      const byScope: Record<string, Set<string>> = { GENERAL: new Set() };
      (equipAlloc.data || []).forEach((row: any) => {
        const scope = row.supplier_id || 'GENERAL';
        if (!byScope[scope]) byScope[scope] = new Set();
        byScope[scope].add(row.equipment_master_id);
      });
      setAllocatedEquipmentByScope(byScope);

      setAllocatedSupplierIds(new Set((suppAlloc.data || []).map((d: any) => d.supplier_id)));

      const empByScope: Record<string, Set<string>> = {};
      (empAlloc.data || []).forEach((row: any) => {
        if (!empByScope[row.supplier_id]) empByScope[row.supplier_id] = new Set();
        empByScope[row.supplier_id].add(row.employee_name);
      });
      setEmployeesByScope(empByScope);
    } catch (err) {
      console.error('Failed to fetch allocation detail', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const filteredJobs = searchQuery.trim()
    ? jobs.filter((j) => {
        const q = searchQuery.trim().toLowerCase();
        return j.job_number?.toLowerCase().includes(q) || j.job_name?.toLowerCase().includes(q);
      })
    : jobs;

  const totalEquipment = Object.values(allocatedEquipmentByScope).reduce((sum, set) => sum + set.size, 0);
  const totalEmployees = Object.values(employeesByScope).reduce((sum, set) => sum + set.size, 0);

  // GENERAL first, then whichever allocated suppliers actually have equipment under them.
  const equipmentScopeOrder = ['GENERAL', ...Array.from(allocatedSupplierIds)].filter(
    (scope) => (allocatedEquipmentByScope[scope]?.size || 0) > 0
  );

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  return (
    <FadeInUp style={{ flex: 1 }}>
      <View className="flex-1 bg-slate-50">
        <ScrollView className="flex-1 p-4 md:p-8" showsVerticalScrollIndicator={false}>
          <View className="mb-8">
            <Text className="text-3xl font-black text-slate-900 tracking-tight mb-2">Allocation Report</Text>
            <Text className="text-slate-500 font-medium">
              Look up exactly what's currently allocated to a Job Site -- read-only. To add, remove, or change an
              allocation, use Site Allocations instead.
            </Text>
          </View>

          <View className="flex-row items-center bg-white rounded-xl shadow-sm border border-slate-200 p-1 mb-6 self-start">
            {(['IST', 'JAH', 'HYDRO'] as const).map((company) => (
              <TouchableOpacity
                key={company}
                onPress={() => setActiveCompany(company)}
                className={`py-2 px-5 rounded-lg ${activeCompany === company ? 'bg-slate-900' : 'bg-transparent'}`}
              >
                <Text className={`font-bold text-sm ${activeCompany === company ? 'text-white' : 'text-slate-500'}`}>{company}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm mb-6">
            <Text className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-1.5">Search Job Number or Name</Text>
            <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-4 h-12 mb-2">
              <Search size={18} color="#94a3b8" />
              <TextInput
                placeholder="e.g. 1686/26"
                placeholderTextColor="#94a3b8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                className="flex-1 ml-3 text-slate-900"
                style={{ outlineStyle: 'none' } as any}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1">
                  <X size={16} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled showsVerticalScrollIndicator={true}>
              {filteredJobs.length === 0 && (
                <Text className="text-slate-500 font-medium text-center py-6">No jobs match "{searchQuery}".</Text>
              )}
              {filteredJobs.map((job) => {
                const isSelected = selectedJob?.id === job.id;
                return (
                  <TouchableOpacity
                    key={job.id}
                    onPress={() => selectJob(job)}
                    className={`flex-row items-center p-3 mb-1 rounded-xl border ${isSelected ? 'border-blue-200 bg-blue-50' : 'border-transparent bg-slate-50'}`}
                  >
                    <MapPin size={16} color={isSelected ? '#1d4ed8' : '#94a3b8'} />
                    <Text className={`ml-2 font-semibold ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>
                      {job.job_number} - {job.job_name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {detailLoading && (
            <View className="items-center py-10">
              <ActivityIndicator size="large" color="#1e3a8a" />
            </View>
          )}

          {!detailLoading && selectedJob && (
            <View className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm mb-20">
              <View className="flex-row items-center mb-2">
                <ClipboardCheck size={20} color="#1d4ed8" />
                <Text className="text-xl font-black text-slate-900 ml-2">
                  {selectedJob.job_number} - {selectedJob.job_name}
                </Text>
              </View>
              <View className="flex-row flex-wrap mb-6">
                <View className="bg-slate-100 px-3 py-1.5 rounded-full mr-2 mb-2">
                  <Text className="text-slate-600 font-bold text-xs">{allocatedSupplierIds.size} Suppliers</Text>
                </View>
                <View className="bg-slate-100 px-3 py-1.5 rounded-full mr-2 mb-2">
                  <Text className="text-slate-600 font-bold text-xs">{totalEquipment} Equipment</Text>
                </View>
                <View className="bg-slate-100 px-3 py-1.5 rounded-full mr-2 mb-2">
                  <Text className="text-slate-600 font-bold text-xs">{totalEmployees} Employees</Text>
                </View>
              </View>

              {/* Suppliers */}
              <View className="mb-6">
                <Text className="text-lg font-black text-slate-900 mb-3">Suppliers Allocated</Text>
                {allocatedSupplierIds.size === 0 ? (
                  <View className="py-6 items-center justify-center bg-slate-50 rounded-xl border border-slate-100">
                    <Text className="text-slate-500 font-medium">No suppliers allocated to this job.</Text>
                  </View>
                ) : (
                  Array.from(allocatedSupplierIds).map((suppId) => {
                    const supp = supplierById[suppId];
                    return (
                      <View
                        key={suppId}
                        className="flex-row items-center justify-between p-4 mb-2 rounded-xl border border-slate-100 bg-slate-50"
                      >
                        <View className="flex-row items-center flex-1 pr-4">
                          <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-blue-100">
                            <Users size={18} color="#1d4ed8" />
                          </View>
                          <Text className="font-semibold text-base text-slate-700">{supp?.name || 'Unknown Supplier'}</Text>
                        </View>
                        {supp?.type && (
                          <View className="bg-white px-2.5 py-1 rounded-full border border-slate-200">
                            <Text className="text-slate-500 font-bold text-xs">{supp.type}</Text>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>

              {/* Equipment */}
              <View className="mb-6 pt-6 border-t border-slate-100">
                <Text className="text-lg font-black text-slate-900 mb-3">Equipment Allocated</Text>
                {equipmentScopeOrder.length === 0 ? (
                  <View className="py-6 items-center justify-center bg-slate-50 rounded-xl border border-slate-100">
                    <Text className="text-slate-500 font-medium">No equipment allocated to this job.</Text>
                  </View>
                ) : (
                  equipmentScopeOrder.map((scope) => {
                    const ids = Array.from(allocatedEquipmentByScope[scope] || []);
                    const scopeLabel = scope === 'GENERAL' ? 'General (Not Tied to a Supplier)' : supplierById[scope]?.name || 'Unknown Supplier';
                    const grouped = ids.reduce((acc, eid) => {
                      const info = equipmentById[eid];
                      const cat = info?.category || 'Uncategorized';
                      if (!acc[cat]) acc[cat] = [];
                      acc[cat].push(info?.name || 'Unknown Equipment');
                      return acc;
                    }, {} as Record<string, string[]>);

                    return (
                      <View key={scope} className="mb-5">
                        <Text className="text-xs font-black text-blue-700 uppercase tracking-widest mb-2 bg-blue-50 py-2 px-3 rounded-lg border border-blue-100 self-start">
                          {scopeLabel}
                        </Text>
                        {Object.keys(grouped).map((cat) => (
                          <View key={cat} className="mb-2">
                            <Text className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">{cat}</Text>
                            {grouped[cat].map((name, idx) => (
                              <View
                                key={`${cat}-${idx}`}
                                className="flex-row items-center p-3 mb-1.5 rounded-xl border border-slate-100 bg-slate-50"
                              >
                                <Truck size={16} color="#94a3b8" />
                                <Text className="ml-2 font-semibold text-slate-700">{name}</Text>
                              </View>
                            ))}
                          </View>
                        ))}
                      </View>
                    );
                  })
                )}
              </View>

              {/* Employees */}
              <View className="pt-6 border-t border-slate-100">
                <Text className="text-lg font-black text-slate-900 mb-3">Employees</Text>
                {Object.keys(employeesByScope).filter((s) => employeesByScope[s].size > 0).length === 0 ? (
                  <View className="py-6 items-center justify-center bg-slate-50 rounded-xl border border-slate-100">
                    <Text className="text-slate-500 font-medium">No employee rosters added for this job.</Text>
                  </View>
                ) : (
                  Object.keys(employeesByScope)
                    .filter((s) => employeesByScope[s].size > 0)
                    .map((suppId) => (
                      <View key={suppId} className="mb-5">
                        <Text className="text-xs font-black text-blue-700 uppercase tracking-widest mb-2 bg-blue-50 py-2 px-3 rounded-lg border border-blue-100 self-start">
                          {supplierById[suppId]?.name || 'Unknown Supplier'}
                        </Text>
                        {Array.from(employeesByScope[suppId])
                          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
                          .map((name) => (
                            <View key={name} className="flex-row items-center p-3 mb-1.5 rounded-xl border border-slate-100 bg-slate-50">
                              <UserPlus size={16} color="#94a3b8" />
                              <Text className="ml-2 font-semibold text-slate-700">{name}</Text>
                            </View>
                          ))}
                      </View>
                    ))
                )}
              </View>
            </View>
          )}

          {!detailLoading && !selectedJob && (
            <View className="bg-white rounded-3xl p-10 border border-slate-200 shadow-sm items-center justify-center mb-12">
              <View className="bg-slate-50 p-6 rounded-full mb-4">
                <Search size={48} color="#cbd5e1" />
              </View>
              <Text className="text-xl font-bold text-slate-700 mb-2">Search for a Job</Text>
              <Text className="text-slate-500 text-center max-w-xs">
                Type a job number or name above, then tap it to see everything currently allocated to it.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </FadeInUp>
  );
}
