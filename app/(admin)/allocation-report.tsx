import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Modal, Alert, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Search, MapPin, Truck, Users, UserPlus, X, ClipboardCheck, PowerOff, Power, Trash2, History, Clock, Pencil } from 'lucide-react-native';
import { FadeInUp } from '../../components/Animations';
import {
  fetchOffHireStatusForJob,
  fetchOffHireHistory,
  logOffHireAction,
  offHireKey,
  OffHireLogRow,
} from '../../lib/equipmentOffHire';
import {
  RentalBasis,
  RentalInfoRow,
  RENTAL_BASIS_OPTIONS,
  fetchRentalInfoForJob,
  setRentalInfo,
  clearRentalInfo,
  formatDueLabel,
  formatRentalPeriod,
} from '../../lib/equipmentRental';

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

  const [detailTab, setDetailTab] = useState<'suppliers' | 'equipment' | 'employees'>('suppliers');
  const [detailSearch, setDetailSearch] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [allocatedEquipmentByScope, setAllocatedEquipmentByScope] = useState<Record<string, Set<string>>>({});
  const [allocatedSupplierIds, setAllocatedSupplierIds] = useState<Set<string>>(new Set());
  const [employeesByScope, setEmployeesByScope] = useState<Record<string, Set<string>>>({});
  const [offHireKeys, setOffHireKeys] = useState<Set<string>>(new Set());
  const [rentalInfoByKey, setRentalInfoByKey] = useState<Map<string, RentalInfoRow>>(new Map());

  // Equipment row modal -- off-hire toggle, remove-from-allocation, rental
  // details, and history, all scoped to one (job, supplier, equipment) combo.
  const [equipmentModal, setEquipmentModal] = useState<{ scope: string; equipmentId: string; name: string } | null>(null);
  const [modalHistory, setModalHistory] = useState<OffHireLogRow[]>([]);
  const [modalHistoryLoading, setModalHistoryLoading] = useState(false);
  const [modalActionLoading, setModalActionLoading] = useState(false);
  const [editingRental, setEditingRental] = useState(false);
  const [rentalBasisInput, setRentalBasisInput] = useState<RentalBasis>('DAILY');
  const [rentalStartInput, setRentalStartInput] = useState('');
  const [rentalDueInput, setRentalDueInput] = useState('');

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
    setDetailTab('suppliers');
    setDetailSearch('');
    setDetailLoading(true);
    try {
      const [equipAlloc, suppAlloc, empAlloc, offHireSet, rentalMap] = await Promise.all([
        supabase.from('job_equipment').select('equipment_master_id, supplier_id').eq('job_id', job.id),
        supabase.from('job_suppliers').select('supplier_id').eq('job_id', job.id),
        supabase.from('job_supplier_employees').select('supplier_id, employee_name').eq('job_id', job.id),
        fetchOffHireStatusForJob(job.id),
        fetchRentalInfoForJob(job.id),
      ]);
      setOffHireKeys(offHireSet);
      setRentalInfoByKey(rentalMap);

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

  const openEquipmentModal = async (scope: string, equipmentId: string, name: string) => {
    setEquipmentModal({ scope, equipmentId, name });
    setEditingRental(false);
    const supplierId = scope === 'GENERAL' ? null : scope;
    const existingRental = rentalInfoByKey.get(offHireKey(supplierId, equipmentId));
    setRentalBasisInput(existingRental?.rental_basis || 'DAILY');
    setRentalStartInput(existingRental?.rental_start_at ? existingRental.rental_start_at.slice(0, 16) : '');
    setRentalDueInput(existingRental?.rental_due_at ? existingRental.rental_due_at.slice(0, 16) : '');
    setModalHistoryLoading(true);
    try {
      const history = await fetchOffHireHistory(selectedJob!.id, supplierId, equipmentId);
      setModalHistory(history);
    } finally {
      setModalHistoryLoading(false);
    }
  };

  const closeEquipmentModal = () => {
    setEquipmentModal(null);
    setModalHistory([]);
    setEditingRental(false);
  };

  const handleSaveRentalInModal = async () => {
    if (!equipmentModal || !selectedJob) return;
    let dueDate: Date | null = null;
    if (rentalDueInput) {
      dueDate = new Date(rentalDueInput);
      if (isNaN(dueDate.getTime())) {
        Alert.alert('Invalid Date', 'That due date/time could not be read.');
        return;
      }
    }
    let startDate: Date | null = null;
    if (rentalStartInput) {
      startDate = new Date(rentalStartInput);
      if (isNaN(startDate.getTime())) {
        Alert.alert('Invalid Date', 'That start date/time could not be read.');
        return;
      }
    }
    const supplierId = equipmentModal.scope === 'GENERAL' ? null : equipmentModal.scope;
    setModalActionLoading(true);
    try {
      const { error } = await setRentalInfo(selectedJob.id, supplierId, equipmentModal.equipmentId, rentalBasisInput, dueDate, startDate);
      if (error) throw error;
      setRentalInfoByKey((prev) => {
        const next = new Map(prev);
        next.set(offHireKey(supplierId, equipmentModal.equipmentId), {
          id: '',
          job_id: selectedJob.id,
          supplier_id: supplierId,
          equipment_master_id: equipmentModal.equipmentId,
          rental_basis: rentalBasisInput,
          rental_start_at: startDate ? startDate.toISOString() : null,
          rental_due_at: dueDate ? dueDate.toISOString() : null,
          set_by: null,
          set_by_name: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        return next;
      });
      setEditingRental(false);
    } catch (err: any) {
      console.error('Failed to save rental info', err);
      Alert.alert('Error', err?.message || 'Failed to save rental details.');
    } finally {
      setModalActionLoading(false);
    }
  };

  const handleClearRentalInModal = async () => {
    if (!equipmentModal || !selectedJob) return;
    const supplierId = equipmentModal.scope === 'GENERAL' ? null : equipmentModal.scope;
    setModalActionLoading(true);
    try {
      const { error } = await clearRentalInfo(selectedJob.id, supplierId, equipmentModal.equipmentId);
      if (error) throw error;
      setRentalInfoByKey((prev) => {
        const next = new Map(prev);
        next.delete(offHireKey(supplierId, equipmentModal.equipmentId));
        return next;
      });
      setRentalStartInput('');
      setRentalDueInput('');
      setEditingRental(false);
    } catch (err: any) {
      console.error('Failed to clear rental info', err);
      Alert.alert('Error', err?.message || 'Failed to clear rental details.');
    } finally {
      setModalActionLoading(false);
    }
  };

  const handleToggleOffHire = async () => {
    if (!equipmentModal || !selectedJob) return;
    const supplierId = equipmentModal.scope === 'GENERAL' ? null : equipmentModal.scope;
    const key = offHireKey(supplierId, equipmentModal.equipmentId);
    const isCurrentlyOffHire = offHireKeys.has(key);
    setModalActionLoading(true);
    try {
      const { error } = await logOffHireAction(
        selectedJob.id,
        supplierId,
        equipmentModal.equipmentId,
        isCurrentlyOffHire ? 'ON_HIRE' : 'OFF_HIRE'
      );
      if (error) throw error;

      setOffHireKeys((prev) => {
        const next = new Set(prev);
        if (isCurrentlyOffHire) next.delete(key);
        else next.add(key);
        return next;
      });
      const history = await fetchOffHireHistory(selectedJob.id, supplierId, equipmentModal.equipmentId);
      setModalHistory(history);
    } catch (err: any) {
      console.error('Failed to update off-hire status', err);
      Alert.alert('Error', err?.message || 'Failed to update off-hire status.');
    } finally {
      setModalActionLoading(false);
    }
  };

  const handleRemoveFromAllocation = async () => {
    if (!equipmentModal || !selectedJob) return;
    const supplierId = equipmentModal.scope === 'GENERAL' ? null : equipmentModal.scope;

    Alert.alert(
      'Remove from Allocation',
      `Remove "${equipmentModal.name}" from this job's equipment allocation? This only removes it here -- to add it back later, use Site Allocations.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setModalActionLoading(true);
            try {
              let delQuery = supabase.from('job_equipment').delete().eq('job_id', selectedJob.id).eq('equipment_master_id', equipmentModal.equipmentId);
              delQuery = supplierId ? delQuery.eq('supplier_id', supplierId) : delQuery.is('supplier_id', null);
              const { error: delError } = await delQuery;
              if (delError) throw delError;

              await logOffHireAction(selectedJob.id, supplierId, equipmentModal.equipmentId, 'REMOVED');

              setAllocatedEquipmentByScope((prev) => {
                const next = { ...prev };
                const current = new Set(next[equipmentModal.scope] || []);
                current.delete(equipmentModal.equipmentId);
                next[equipmentModal.scope] = current;
                return next;
              });
              closeEquipmentModal();
            } catch (err: any) {
              console.error('Failed to remove allocation', err);
              Alert.alert('Error', err?.message || 'Failed to remove from allocation.');
            } finally {
              setModalActionLoading(false);
            }
          },
        },
      ]
    );
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

  const getEquipmentScopeLabel = (scope: string) =>
    scope === 'GENERAL' ? 'General (Not Tied to a Supplier)' : supplierById[scope]?.name || 'Unknown Supplier';

  // Filters within the selected job's detail card -- searches supplier name on the
  // Suppliers tab. On the Equipment tab it matches either the equipment's own name
  // OR the supplier it's under -- typing a supplier name shows everything allocated
  // under that supplier, not just equipment whose name happens to contain it.
  // Cleared whenever the job or the tab changes so a stale filter doesn't hide
  // everything on a fresh view.
  const detailSearchLower = detailSearch.trim().toLowerCase();
  const filteredSupplierIds = detailSearchLower
    ? Array.from(allocatedSupplierIds).filter((id) => (supplierById[id]?.name || '').toLowerCase().includes(detailSearchLower))
    : Array.from(allocatedSupplierIds);
  const filteredEquipmentByScope: Record<string, string[]> = {};
  equipmentScopeOrder.forEach((scope) => {
    const ids = Array.from(allocatedEquipmentByScope[scope] || []);
    if (!detailSearchLower) {
      filteredEquipmentByScope[scope] = ids;
      return;
    }
    const scopeMatches = getEquipmentScopeLabel(scope).toLowerCase().includes(detailSearchLower);
    filteredEquipmentByScope[scope] = scopeMatches
      ? ids
      : ids.filter((eid) => (equipmentById[eid]?.name || '').toLowerCase().includes(detailSearchLower));
  });
  const filteredEquipmentScopeOrder = equipmentScopeOrder.filter((scope) => filteredEquipmentByScope[scope].length > 0);

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
              <View className="flex-row bg-slate-100 p-1 rounded-xl mb-6 self-start">
                {([
                  { key: 'suppliers' as const, label: 'Suppliers', count: allocatedSupplierIds.size },
                  { key: 'equipment' as const, label: 'Equipment', count: totalEquipment },
                  { key: 'employees' as const, label: 'Employees', count: totalEmployees },
                ]).map((tab) => (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={() => setDetailTab(tab.key)}
                    className={`flex-row items-center py-2.5 px-4 rounded-lg ${detailTab === tab.key ? 'bg-white shadow-sm' : ''}`}
                  >
                    <Text className={`font-bold text-sm ${detailTab === tab.key ? 'text-slate-900' : 'text-slate-500'}`}>
                      {tab.label} ({tab.count})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {(detailTab === 'suppliers' || detailTab === 'equipment') && (
                <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-4 h-12 mb-5">
                  <Search size={16} color="#94a3b8" />
                  <TextInput
                    placeholder={detailTab === 'suppliers' ? 'Search allocated suppliers...' : 'Search equipment or supplier name...'}
                    placeholderTextColor="#94a3b8"
                    value={detailSearch}
                    onChangeText={setDetailSearch}
                    autoCapitalize="none"
                    className="flex-1 ml-3 text-slate-900"
                    style={{ outlineStyle: 'none' } as any}
                  />
                  {detailSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setDetailSearch('')} className="p-1">
                      <X size={16} color="#94a3b8" />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Suppliers */}
              {detailTab === 'suppliers' && (
              <View className="mb-2">
                <Text className="text-lg font-black text-slate-900 mb-3">Suppliers Allocated</Text>
                {allocatedSupplierIds.size === 0 ? (
                  <View className="py-6 items-center justify-center bg-slate-50 rounded-xl border border-slate-100">
                    <Text className="text-slate-500 font-medium">No suppliers allocated to this job.</Text>
                  </View>
                ) : filteredSupplierIds.length === 0 ? (
                  <View className="py-6 items-center justify-center bg-slate-50 rounded-xl border border-slate-100">
                    <Text className="text-slate-500 font-medium">No suppliers match "{detailSearch}".</Text>
                  </View>
                ) : (
                  filteredSupplierIds.map((suppId) => {
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
              )}

              {/* Equipment */}
              {detailTab === 'equipment' && (
              <View className="mb-2">
                <Text className="text-lg font-black text-slate-900 mb-3">Equipment Allocated</Text>
                {equipmentScopeOrder.length === 0 ? (
                  <View className="py-6 items-center justify-center bg-slate-50 rounded-xl border border-slate-100">
                    <Text className="text-slate-500 font-medium">No equipment allocated to this job.</Text>
                  </View>
                ) : filteredEquipmentScopeOrder.length === 0 ? (
                  <View className="py-6 items-center justify-center bg-slate-50 rounded-xl border border-slate-100">
                    <Text className="text-slate-500 font-medium">No equipment matches "{detailSearch}".</Text>
                  </View>
                ) : (
                  filteredEquipmentScopeOrder.map((scope) => {
                    const ids = filteredEquipmentByScope[scope];
                    const scopeLabel = getEquipmentScopeLabel(scope);
                    const scopeSupplierId = scope === 'GENERAL' ? null : scope;
                    const grouped = ids.reduce((acc, eid) => {
                      const info = equipmentById[eid];
                      const cat = info?.category || 'Uncategorized';
                      if (!acc[cat]) acc[cat] = [];
                      acc[cat].push({ id: eid, name: info?.name || 'Unknown Equipment' });
                      return acc;
                    }, {} as Record<string, { id: string; name: string }[]>);

                    return (
                      <View key={scope} className="mb-5">
                        <Text className="text-xs font-black text-blue-700 uppercase tracking-widest mb-2 bg-blue-50 py-2 px-3 rounded-lg border border-blue-100 self-start">
                          {scopeLabel}
                        </Text>
                        {Object.keys(grouped).map((cat) => (
                          <View key={cat} className="mb-2">
                            <Text className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">{cat}</Text>
                            {grouped[cat].map((item) => {
                              const isOffHire = offHireKeys.has(offHireKey(scopeSupplierId, item.id));
                              const rentalInfo = rentalInfoByKey.get(offHireKey(scopeSupplierId, item.id));
                              const dueInfo = rentalInfo ? formatDueLabel(rentalInfo.rental_due_at) : null;
                              return (
                                <TouchableOpacity
                                  key={item.id}
                                  onPress={() => openEquipmentModal(scope, item.id, item.name)}
                                  className={`flex-row items-center justify-between p-3 mb-1.5 rounded-xl border active:opacity-70 ${isOffHire ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50'}`}
                                >
                                  <View className="flex-row items-center flex-1 pr-3 flex-wrap">
                                    <Truck size={16} color={isOffHire ? '#b45309' : '#94a3b8'} />
                                    <Text className={`ml-2 font-semibold ${isOffHire ? 'text-amber-800' : 'text-slate-700'}`}>{item.name}</Text>
                                    {rentalInfo && (
                                      <View className={`px-2 py-1 rounded-full border flex-row items-center ml-2 ${dueInfo ? (dueInfo.overdue ? 'bg-red-100 border-red-200' : 'bg-blue-50 border-blue-200') : 'bg-slate-100 border-slate-200'}`}>
                                        <Text className={`font-bold text-[10px] uppercase tracking-wider ${dueInfo ? (dueInfo.overdue ? 'text-red-700' : 'text-blue-700') : 'text-slate-600'}`}>
                                          {dueInfo ? dueInfo.label : formatRentalPeriod(rentalInfo)}
                                        </Text>
                                      </View>
                                    )}
                                  </View>
                                  {isOffHire && (
                                    <View className="bg-amber-100 px-2.5 py-1 rounded-full border border-amber-200 flex-row items-center">
                                      <PowerOff size={11} color="#b45309" />
                                      <Text className="text-amber-700 font-bold text-[10px] ml-1 uppercase tracking-wider">Off-Hire</Text>
                                    </View>
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ))}
                      </View>
                    );
                  })
                )}
              </View>
              )}

              {/* Employees */}
              {detailTab === 'employees' && (
              <View>
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
              )}
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

      <Modal visible={!!equipmentModal} transparent animationType="fade" onRequestClose={closeEquipmentModal}>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl" style={{ maxHeight: '85%' }}>
            {equipmentModal && (() => {
              const supplierId = equipmentModal.scope === 'GENERAL' ? null : equipmentModal.scope;
              const isOffHire = offHireKeys.has(offHireKey(supplierId, equipmentModal.equipmentId));
              const rentalInfo = rentalInfoByKey.get(offHireKey(supplierId, equipmentModal.equipmentId));
              const dueInfo = rentalInfo ? formatDueLabel(rentalInfo.rental_due_at) : null;
              return (
                <>
                  <View className="flex-row items-start justify-between mb-1">
                    <Text className="text-lg font-black text-slate-900 flex-1 pr-3">{equipmentModal.name}</Text>
                    <TouchableOpacity onPress={closeEquipmentModal} className="p-1 -mr-1 -mt-1">
                      <X size={20} color="#64748b" />
                    </TouchableOpacity>
                  </View>
                  <Text className="text-slate-400 font-medium text-xs mb-5">{getEquipmentScopeLabel(equipmentModal.scope)}</Text>

                  <View className={`flex-row items-center justify-between p-4 rounded-2xl border mb-4 ${isOffHire ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                    <View className="flex-row items-center flex-1 pr-3">
                      {isOffHire ? <PowerOff size={18} color="#b45309" /> : <Power size={18} color="#059669" />}
                      <View className="ml-2.5">
                        <Text className={`font-black ${isOffHire ? 'text-amber-800' : 'text-emerald-800'}`}>
                          {isOffHire ? 'Off-Hire' : 'On-Hire'}
                        </Text>
                        <Text className="text-slate-500 text-xs font-medium mt-0.5">
                          {isOffHire ? 'Hidden from the Foreman app for this job.' : 'Active and selectable in the Foreman app.'}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={handleToggleOffHire}
                      disabled={modalActionLoading}
                      className={`px-3.5 py-2 rounded-xl ${isOffHire ? 'bg-emerald-600' : 'bg-amber-600'} ${modalActionLoading ? 'opacity-60' : ''}`}
                    >
                      {modalActionLoading ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text className="text-white font-bold text-xs">{isOffHire ? 'Set On-Hire' : 'Set Off-Hire'}</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  {isOffHire && (
                    <TouchableOpacity
                      onPress={handleRemoveFromAllocation}
                      disabled={modalActionLoading}
                      className={`flex-row items-center justify-center py-3 rounded-xl border border-red-200 bg-red-50 mb-5 active:bg-red-100 ${modalActionLoading ? 'opacity-60' : ''}`}
                    >
                      <Trash2 size={15} color="#dc2626" />
                      <Text className="text-red-600 font-bold text-sm ml-2">Remove from Equipment Allocated</Text>
                    </TouchableOpacity>
                  )}

                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center">
                      <Clock size={14} color="#64748b" />
                      <Text className="text-slate-500 font-bold text-xs uppercase tracking-widest ml-1.5">Rental Due</Text>
                    </View>
                    {!editingRental && (
                      <TouchableOpacity onPress={() => setEditingRental(true)} className="p-1">
                        <Pencil size={14} color="#1d4ed8" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {editingRental ? (
                    <View className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-5">
                      <View className="flex-row bg-slate-100 p-1 rounded-xl mb-3">
                        {RENTAL_BASIS_OPTIONS.map((opt) => (
                          <TouchableOpacity
                            key={opt.value}
                            onPress={() => setRentalBasisInput(opt.value)}
                            className={`flex-1 py-2 rounded-lg items-center ${rentalBasisInput === opt.value ? 'bg-white shadow-sm' : ''}`}
                          >
                            <Text className={`font-bold text-xs ${rentalBasisInput === opt.value ? 'text-slate-900' : 'text-slate-500'}`}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 ml-1">Start (Optional)</Text>
                      <View className="bg-white border border-slate-200 rounded-xl px-4 h-12 justify-center mb-3">
                        {Platform.OS === 'web' ? (
                          <input
                            type="datetime-local"
                            value={rentalStartInput}
                            onChange={(e: any) => setRentalStartInput(e.target.value)}
                            style={{ border: 'none', outline: 'none', background: 'transparent', color: '#0f172a', fontSize: '15px', fontWeight: '600', fontFamily: 'inherit', width: '100%' }}
                          />
                        ) : (
                          <TextInput
                            value={rentalStartInput}
                            onChangeText={setRentalStartInput}
                            placeholder="YYYY-MM-DDTHH:mm"
                            placeholderTextColor="#94a3b8"
                            className="text-slate-900 font-semibold"
                          />
                        )}
                      </View>
                      <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 ml-1">Due Back By (Optional)</Text>
                      <View className="bg-white border border-slate-200 rounded-xl px-4 h-12 justify-center mb-3">
                        {Platform.OS === 'web' ? (
                          <input
                            type="datetime-local"
                            value={rentalDueInput}
                            onChange={(e: any) => setRentalDueInput(e.target.value)}
                            style={{ border: 'none', outline: 'none', background: 'transparent', color: '#0f172a', fontSize: '15px', fontWeight: '600', fontFamily: 'inherit', width: '100%' }}
                          />
                        ) : (
                          <TextInput
                            value={rentalDueInput}
                            onChangeText={setRentalDueInput}
                            placeholder="YYYY-MM-DDTHH:mm"
                            placeholderTextColor="#94a3b8"
                            className="text-slate-900 font-semibold"
                          />
                        )}
                      </View>
                      <View className="flex-row" style={{ gap: 8 }}>
                        <TouchableOpacity
                          onPress={handleSaveRentalInModal}
                          disabled={modalActionLoading}
                          className={`flex-1 py-2.5 rounded-xl items-center ${modalActionLoading ? 'bg-blue-300' : 'bg-[#1e3a8a]'}`}
                        >
                          {modalActionLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-white font-bold text-xs">Save</Text>}
                        </TouchableOpacity>
                        {rentalInfo && (
                          <TouchableOpacity
                            onPress={handleClearRentalInModal}
                            disabled={modalActionLoading}
                            className="flex-1 py-2.5 rounded-xl items-center border border-red-200 bg-red-50"
                          >
                            <Text className="text-red-600 font-bold text-xs">Clear</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          onPress={() => setEditingRental(false)}
                          disabled={modalActionLoading}
                          className="flex-1 py-2.5 rounded-xl items-center border border-slate-200"
                        >
                          <Text className="text-slate-600 font-bold text-xs">Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : rentalInfo ? (
                    <View className={`flex-row items-center justify-between p-3.5 rounded-2xl border mb-5 ${dueInfo ? (dueInfo.overdue ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200') : 'bg-slate-50 border-slate-200'}`}>
                      <View>
                        {dueInfo && (
                          <Text className={`font-black text-sm ${dueInfo.overdue ? 'text-red-800' : 'text-blue-800'}`}>{dueInfo.label}</Text>
                        )}
                        <Text className={dueInfo ? 'text-slate-500 text-xs font-medium mt-0.5' : 'text-slate-700 font-black text-sm'}>
                          {formatRentalPeriod(rentalInfo)}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <Text className="text-slate-400 font-medium text-sm mb-5">No rental info set -- tap the pencil to add it.</Text>
                  )}

                  <View className="flex-row items-center mb-2">
                    <History size={14} color="#64748b" />
                    <Text className="text-slate-500 font-bold text-xs uppercase tracking-widest ml-1.5">History</Text>
                  </View>
                  <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                    {modalHistoryLoading ? (
                      <View className="py-6 items-center">
                        <ActivityIndicator size="small" color="#1e3a8a" />
                      </View>
                    ) : modalHistory.length === 0 ? (
                      <Text className="text-slate-400 font-medium text-sm py-3">No off-hire history for this item yet.</Text>
                    ) : (
                      modalHistory.map((row) => {
                        const label = row.action === 'OFF_HIRE' ? 'Set Off-Hire' : row.action === 'ON_HIRE' ? 'Set On-Hire' : 'Removed from Allocation';
                        const dotColor = row.action === 'OFF_HIRE' ? 'bg-amber-500' : row.action === 'ON_HIRE' ? 'bg-emerald-500' : 'bg-red-500';
                        return (
                          <View key={row.id} className="flex-row items-start py-2 border-b border-slate-50">
                            <View className={`w-2 h-2 rounded-full mt-1.5 mr-2.5 ${dotColor}`} />
                            <View className="flex-1">
                              <Text className="text-slate-700 font-semibold text-sm">{label}</Text>
                              <Text className="text-slate-400 text-xs mt-0.5">
                                {new Date(row.created_at).toLocaleString()}{row.changed_by_name ? ` · ${row.changed_by_name}` : ''}
                              </Text>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </ScrollView>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </FadeInUp>
  );
}
