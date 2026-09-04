import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Modal, Switch, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/crossAlert';
import { Truck, ChevronDown, Check, X, Search, Save, MapPin, Users, Plus, UserPlus } from 'lucide-react-native';

// Helper for modal picker
const CustomPicker = ({ label, value, options, onSelect, placeholder }: any) => {
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <View className="mb-4">
      <Text className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-1.5">{label}</Text>
      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex-row items-center justify-between shadow-sm active:opacity-70"
      >
        <Text className={value ? "text-slate-900 font-bold" : "text-slate-400 font-medium"}>
          {value ? options.find((o: any) => o.value === value)?.label || placeholder : placeholder}
        </Text>
        <ChevronDown size={20} color="#64748b" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl h-[70%] shadow-2xl">
            <View className="flex-row items-center justify-between p-6 border-b border-slate-100">
              <Text className="text-slate-900 text-xl font-black tracking-tight">Select {label}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} className="p-2 bg-slate-100 rounded-full active:opacity-60">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              {options.map((item: any) => (
                <TouchableOpacity
                  key={item.value}
                  onPress={() => {
                    onSelect(item.value);
                    setModalVisible(false);
                  }}
                  className="flex-row items-center justify-between p-5 border-b border-slate-50 active:bg-blue-50"
                >
                  <Text className={`text-base ${value === item.value ? 'text-blue-700 font-black tracking-tight' : 'text-slate-700 font-semibold'}`}>
                    {item.label}
                  </Text>
                  {value === item.value && <Check size={20} color="#1d4ed8" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default function SiteAllocationsScreen() {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);

  const [allEquipment, setAllEquipment] = useState<any[]>([]);
  // Keyed by supplier_id, or the literal string 'GENERAL' for equipment not tied to
  // any one supplier (job-wide, matches how allocations worked before per-supplier
  // scoping existed).
  const [allocatedEquipmentByScope, setAllocatedEquipmentByScope] = useState<Record<string, Set<string>>>({ GENERAL: new Set() });
  const [equipmentScope, setEquipmentScope] = useState('GENERAL');
  const [equipmentSearch, setEquipmentSearch] = useState('');

  const [allSuppliers, setAllSuppliers] = useState<any[]>([]);
  const [allocatedSupplierIds, setAllocatedSupplierIds] = useState<Set<string>>(new Set());
  const [supplierSearch, setSupplierSearch] = useState('');

  // Employee rosters are always scoped to one specific supplier (job_supplier_employees.supplier_id
  // is NOT NULL) -- unlike equipment there's no job-wide "General" bucket for employees.
  const [employeesByScope, setEmployeesByScope] = useState<Record<string, Set<string>>>({});
  const [employeeScope, setEmployeeScope] = useState('');
  const [newEmployeeName, setNewEmployeeName] = useState('');

  const [saving, setSaving] = useState(false);

  // New Add-ons State
  const [showAddEquipModal, setShowAddEquipModal] = useState(false);
  const [newEquipName, setNewEquipName] = useState('');
  const [newEquipCat, setNewEquipCat] = useState('Heavy Machinery');
  const [isAddingEquip, setIsAddingEquip] = useState(false);

  const [showAddSuppModal, setShowAddSuppModal] = useState(false);
  const [newSuppName, setNewSuppName] = useState('');
  const [isAddingSupp, setIsAddingSupp] = useState(false);

  const handleAddEquipment = async () => {
    if (!newEquipName.trim()) return showAlert('Error', 'Please enter equipment name');
    setIsAddingEquip(true);
    try {
      const { error } = await supabase.from('equipment_master').insert([{
        equipment_name: newEquipName.trim(),
        equipment_category: newEquipCat
      }]);
      if (error) throw error;
      setNewEquipName('');
      setShowAddEquipModal(false);
      await fetchInitialData();
    } catch (err: any) {
      showAlert('Error', err.message);
    } finally {
      setIsAddingEquip(false);
    }
  };

  const handleAddSupplier = async () => {
    if (!newSuppName.trim()) return showAlert('Error', 'Please enter supplier name');
    setIsAddingSupp(true);
    try {
      const { error } = await supabase.from('suppliers').insert([{
        supplier_name: newSuppName.trim()
      }]);
      if (error) throw error;
      setNewSuppName('');
      setShowAddSuppModal(false);
      await fetchInitialData();
    } catch (err: any) {
      showAlert('Error', err.message);
    } finally {
      setIsAddingSupp(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    setEquipmentScope('GENERAL');
    setEmployeeScope('');
    if (selectedJob) {
      fetchAllocationsForJob(selectedJob);
    } else {
      setAllocatedEquipmentByScope({ GENERAL: new Set() });
      setAllocatedSupplierIds(new Set());
      setEmployeesByScope({});
    }
  }, [selectedJob]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [jobsRes, equipRes, suppRes] = await Promise.all([
        supabase.from('jobs').select('id, job_number, job_name').order('job_number'),
        supabase.from('equipment_master').select('id, equipment_category, equipment_name').eq('is_active', true).order('equipment_category').order('equipment_name'),
        supabase.from('suppliers').select('id, supplier_name, supplier_type').order('supplier_name')
      ]);

      if (jobsRes.data && jobsRes.data.length > 0) {
        const formattedJobs = jobsRes.data.map(j => ({ label: `${j.job_number} - ${j.job_name}`, value: j.id }));
        setJobs(formattedJobs);
        
        // Auto-select the first job if nothing is selected yet
        if (!selectedJob) {
          setSelectedJob(formattedJobs[0].value);
        }
      }
      if (equipRes.data) {
        setAllEquipment(equipRes.data);
      }
      if (suppRes.data) {
        setAllSuppliers(suppRes.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllocationsForJob = async (jobId: string) => {
    try {
      const [equipAlloc, suppAlloc, empAlloc] = await Promise.all([
        supabase.from('job_equipment').select('equipment_master_id, supplier_id').eq('job_id', jobId),
        supabase.from('job_suppliers').select('supplier_id').eq('job_id', jobId),
        supabase.from('job_supplier_employees').select('supplier_id, employee_name').eq('job_id', jobId)
      ]);

      if (equipAlloc.data) {
        const byScope: Record<string, Set<string>> = { GENERAL: new Set() };
        equipAlloc.data.forEach((row: any) => {
          const scope = row.supplier_id || 'GENERAL';
          if (!byScope[scope]) byScope[scope] = new Set();
          byScope[scope].add(row.equipment_master_id);
        });
        setAllocatedEquipmentByScope(byScope);
      }
      if (suppAlloc.data) {
        setAllocatedSupplierIds(new Set(suppAlloc.data.map(d => d.supplier_id)));
      }
      if (empAlloc.data) {
        const byScope: Record<string, Set<string>> = {};
        empAlloc.data.forEach((row: any) => {
          if (!byScope[row.supplier_id]) byScope[row.supplier_id] = new Set();
          byScope[row.supplier_id].add(row.employee_name);
        });
        setEmployeesByScope(byScope);
      }
    } catch (err) {
      console.error('Failed to fetch allocations', err);
    }
  };

  const toggleEquipment = (equipId: string) => {
    setAllocatedEquipmentByScope(prev => {
      const next = { ...prev };
      const current = new Set(next[equipmentScope] || []);
      if (current.has(equipId)) current.delete(equipId);
      else current.add(equipId);
      next[equipmentScope] = current;
      return next;
    });
  };

  const toggleSupplier = (suppId: string) => {
    setAllocatedSupplierIds(prev => {
      const next = new Set(prev);
      if (next.has(suppId)) next.delete(suppId);
      else next.add(suppId);
      return next;
    });
  };

  const addEmployee = () => {
    const name = newEmployeeName.trim();
    if (!employeeScope || !name) return;
    setEmployeesByScope(prev => {
      const next = { ...prev };
      const current = new Set(next[employeeScope] || []);
      current.add(name);
      next[employeeScope] = current;
      return next;
    });
    setNewEmployeeName('');
  };

  const removeEmployee = (name: string) => {
    setEmployeesByScope(prev => {
      const next = { ...prev };
      const current = new Set(next[employeeScope] || []);
      current.delete(name);
      next[employeeScope] = current;
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedJob) return;
    setSaving(true);
    try {
      // 1. Delete all existing mappings for this job
      const [delEquip, delSupp, delEmp] = await Promise.all([
        supabase.from('job_equipment').delete().eq('job_id', selectedJob),
        supabase.from('job_suppliers').delete().eq('job_id', selectedJob),
        supabase.from('job_supplier_employees').delete().eq('job_id', selectedJob)
      ]);
      if (delEquip.error) throw delEquip.error;
      if (delSupp.error) throw delSupp.error;
      if (delEmp.error) throw delEmp.error;

      // 2. Insert new ones. Only keep equipment scoped to a supplier that's still
      // actually allocated to this job (or the job-wide GENERAL scope) -- a supplier
      // toggled off in the Supplier List shouldn't leave orphaned equipment rows
      // referencing it.
      const equipInserts: { job_id: string; equipment_master_id: string; supplier_id: string | null }[] = [];
      Object.entries(allocatedEquipmentByScope).forEach(([scope, ids]) => {
        if (scope !== 'GENERAL' && !allocatedSupplierIds.has(scope)) return;
        const supplierId = scope === 'GENERAL' ? null : scope;
        ids.forEach(equipId => {
          equipInserts.push({ job_id: selectedJob, equipment_master_id: equipId, supplier_id: supplierId });
        });
      });
      const suppInserts = Array.from(allocatedSupplierIds).map(id => ({ job_id: selectedJob, supplier_id: id }));

      // Same orphan-prevention rule as equipment: only keep employees under a supplier
      // that's still actually allocated to this job.
      const empInserts: { job_id: string; supplier_id: string; employee_name: string }[] = [];
      Object.entries(employeesByScope).forEach(([supplierId, names]) => {
        if (!allocatedSupplierIds.has(supplierId)) return;
        names.forEach(name => {
          empInserts.push({ job_id: selectedJob, supplier_id: supplierId, employee_name: name });
        });
      });

      const [insEquip, insSupp, insEmp] = await Promise.all([
        equipInserts.length > 0 ? supabase.from('job_equipment').insert(equipInserts) : Promise.resolve({ error: null } as any),
        suppInserts.length > 0 ? supabase.from('job_suppliers').insert(suppInserts) : Promise.resolve({ error: null } as any),
        empInserts.length > 0 ? supabase.from('job_supplier_employees').insert(empInserts) : Promise.resolve({ error: null } as any)
      ]);
      if (insEquip.error) throw insEquip.error;
      if (insSupp.error) throw insSupp.error;
      if (insEmp.error) throw insEmp.error;

      // 3. Re-fetch from the DB rather than trusting local state, so the UI reflects
      // what actually persisted, not just what we attempted to save.
      await fetchAllocationsForJob(selectedJob);

      alert('Allocations saved successfully!');
    } catch (err: any) {
      console.error(err);
      alert(`Failed to save allocations: ${err?.message || 'Unknown error. Have you created the job_equipment and job_suppliers tables?'}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  // Filter, then group equipment by category
  const filteredEquipment = equipmentSearch.trim()
    ? allEquipment.filter(e => e.equipment_name.toLowerCase().includes(equipmentSearch.trim().toLowerCase()))
    : allEquipment;
  const groupedEquipment = filteredEquipment.reduce((acc, curr) => {
    const cat = curr.equipment_category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(curr);
    return acc;
  }, {} as Record<string, any[]>);

  const filteredSuppliers = supplierSearch.trim()
    ? allSuppliers.filter(s => s.supplier_name.toLowerCase().includes(supplierSearch.trim().toLowerCase()))
    : allSuppliers;

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView className="flex-1 p-4 md:p-8" showsVerticalScrollIndicator={false}>
        
        <View className="mb-8">
          <Text className="text-3xl font-black text-slate-900 tracking-tight mb-2">Site Allocations</Text>
          <Text className="text-slate-500 font-medium">Assign specific equipment and suppliers to Job Sites so Foremen only see what's deployed there.</Text>
        </View>

        <View className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm mb-6 z-10">
          <CustomPicker 
            label="Job Site" 
            value={selectedJob} 
            options={jobs} 
            onSelect={setSelectedJob} 
            placeholder="Select a Job Site..." 
          />
        </View>

        {selectedJob ? (
          <View className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm mb-20">
            
            <View className="mb-2">
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-xl font-black text-slate-900">Supplier List</Text>
                <View className="flex-row items-center">
                  <TouchableOpacity
                    onPress={() => setShowAddSuppModal(true)}
                    className="flex-row items-center bg-blue-50 px-3 py-1.5 rounded-full mr-2 active:bg-blue-100"
                  >
                    <Plus size={14} color="#1d4ed8" />
                    <Text className="text-blue-700 font-bold text-xs ml-1">New</Text>
                  </TouchableOpacity>
                  <Text className="text-slate-500 font-bold bg-slate-100 px-3 py-1 rounded-full text-xs">
                    {allocatedSupplierIds.size} Selected
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-4 h-12 mb-6">
                <Search size={18} color="#94a3b8" />
                <TextInput
                  placeholder="Search suppliers"
                  placeholderTextColor="#94a3b8"
                  value={supplierSearch}
                  onChangeText={setSupplierSearch}
                  autoCapitalize="none"
                  className="flex-1 ml-3 text-slate-900"
                  style={{ outlineStyle: 'none' } as any}
                />
                {supplierSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setSupplierSearch('')} className="p-1">
                    <X size={16} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>
              {filteredSuppliers.length === 0 && (
                <Text className="text-slate-500 font-medium text-center py-6">No suppliers match "{supplierSearch}".</Text>
              )}
              {filteredSuppliers.map(supp => {
                const isSelected = allocatedSupplierIds.has(supp.id);
                return (
                  <TouchableOpacity
                    key={supp.id}
                    activeOpacity={0.7}
                    onPress={() => toggleSupplier(supp.id)}
                    className={`flex-row items-center justify-between p-4 mb-2 rounded-xl border ${isSelected ? 'border-blue-200 bg-blue-50' : 'border-slate-100 bg-white'}`}
                  >
                    <View className="flex-row items-center flex-1 pr-4">
                      <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${isSelected ? 'bg-blue-100' : 'bg-slate-100'}`}>
                        <Users size={20} color={isSelected ? '#1d4ed8' : '#94a3b8'} />
                      </View>
                      <Text className={`font-semibold text-base ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>
                        {supp.supplier_name}
                      </Text>
                    </View>
                    <Switch
                      value={isSelected}
                      onValueChange={() => toggleSupplier(supp.id)}
                      trackColor={{ false: '#e2e8f0', true: '#93c5fd' }}
                      thumbColor={isSelected ? '#1d4ed8' : '#f8fafc'}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>

            <View className="mb-6 pt-6 border-t border-slate-100">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-xl font-black text-slate-900">Equipment List</Text>
                <View className="flex-row items-center">
                  <TouchableOpacity
                    onPress={() => setShowAddEquipModal(true)}
                    className="flex-row items-center bg-blue-50 px-3 py-1.5 rounded-full mr-2 active:bg-blue-100"
                  >
                    <Plus size={14} color="#1d4ed8" />
                    <Text className="text-blue-700 font-bold text-xs ml-1">New</Text>
                  </TouchableOpacity>
                  <Text className="text-slate-500 font-bold bg-slate-100 px-3 py-1 rounded-full text-xs">
                    {allocatedEquipmentByScope[equipmentScope]?.size || 0} Selected
                  </Text>
                </View>
              </View>

              <View className="mb-4">
                <CustomPicker
                  label="Assign Equipment To"
                  value={equipmentScope}
                  options={[
                    { label: 'General (not tied to a supplier)', value: 'GENERAL' },
                    ...allSuppliers
                      .filter(s => allocatedSupplierIds.has(s.id) && s.supplier_type !== 'LABOUR')
                      .map(s => ({ label: s.supplier_name, value: s.id })),
                  ]}
                  onSelect={setEquipmentScope}
                  placeholder="General (not tied to a supplier)"
                />
                <Text className="text-xs text-slate-400 -mt-2">
                  Toggles below allocate equipment under whichever scope is selected here. Switch to a
                  supplier to give that supplier its own equipment list on the foreman side; only
                  suppliers already toggled on above show up here, and any supplier tagged "Labour"
                  in Master Data is left out of this list.
                </Text>
              </View>

              <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-4 h-12 mb-6">
                <Search size={18} color="#94a3b8" />
                <TextInput
                  placeholder="Search equipment"
                  placeholderTextColor="#94a3b8"
                  value={equipmentSearch}
                  onChangeText={setEquipmentSearch}
                  autoCapitalize="none"
                  className="flex-1 ml-3 text-slate-900"
                  style={{ outlineStyle: 'none' } as any}
                />
                {equipmentSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setEquipmentSearch('')} className="p-1">
                    <X size={16} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>
              {filteredEquipment.length === 0 && (
                <Text className="text-slate-500 font-medium text-center py-6">No equipment matches "{equipmentSearch}".</Text>
              )}
              {Object.keys(groupedEquipment).map(category => (
                <View key={category} className="mb-6">
                  <Text className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 bg-slate-50 py-2 px-3 rounded-lg border border-slate-100">
                    {category}
                  </Text>
                  {groupedEquipment[category].map(equip => {
                    const isSelected = allocatedEquipmentByScope[equipmentScope]?.has(equip.id) || false;
                    return (
                      <TouchableOpacity
                        key={equip.id}
                        activeOpacity={0.7}
                        onPress={() => toggleEquipment(equip.id)}
                        className={`flex-row items-center justify-between p-4 mb-2 rounded-xl border ${isSelected ? 'border-blue-200 bg-blue-50' : 'border-slate-100 bg-white'}`}
                      >
                        <View className="flex-row items-center flex-1 pr-4">
                          <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${isSelected ? 'bg-blue-100' : 'bg-slate-100'}`}>
                            <Truck size={20} color={isSelected ? '#1d4ed8' : '#94a3b8'} />
                          </View>
                          <Text className={`font-semibold text-base ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>
                            {equip.equipment_name}
                          </Text>
                        </View>
                        <Switch
                          value={isSelected}
                          onValueChange={() => toggleEquipment(equip.id)}
                          trackColor={{ false: '#e2e8f0', true: '#93c5fd' }}
                          thumbColor={isSelected ? '#1d4ed8' : '#f8fafc'}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>

            <View className="mb-2 pt-6 border-t border-slate-100">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-xl font-black text-slate-900">Employees</Text>
                <Text className="text-slate-500 font-bold bg-slate-100 px-3 py-1 rounded-full text-xs">
                  {employeesByScope[employeeScope]?.size || 0} Added
                </Text>
              </View>

              <View className="mb-4">
                <CustomPicker
                  label="Assign Employees To"
                  value={employeeScope}
                  options={allSuppliers
                    .filter(s => allocatedSupplierIds.has(s.id) && s.supplier_type !== 'EQUIPMENT')
                    .map(s => ({ label: s.supplier_name, value: s.id }))}
                  onSelect={setEmployeeScope}
                  placeholder="Select a supplier..."
                />
                <Text className="text-xs text-slate-400 -mt-2">
                  The same supplier can bring different workers to different jobs, so this
                  roster is scoped to this supplier on this job specifically -- it's what
                  shows up as a pickable list on the Labour entry form instead of a blank
                  text box. Only suppliers already toggled on above show up here, and any
                  supplier tagged "Equipment" in Master Data is left out of this list.
                </Text>
              </View>

              {employeeScope ? (
                <>
                  <View className="flex-row items-center mb-4">
                    <TextInput
                      value={newEmployeeName}
                      onChangeText={setNewEmployeeName}
                      onSubmitEditing={addEmployee}
                      placeholder="e.g. John Doe"
                      placeholderTextColor="#94a3b8"
                      autoCapitalize="words"
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-semibold mr-2"
                      style={{ outlineStyle: 'none' } as any}
                    />
                    <TouchableOpacity
                      onPress={addEmployee}
                      disabled={!newEmployeeName.trim()}
                      className={`px-4 py-3 rounded-xl ${newEmployeeName.trim() ? 'bg-blue-50 active:bg-blue-100' : 'bg-slate-100'}`}
                    >
                      <Plus size={20} color={newEmployeeName.trim() ? '#1d4ed8' : '#94a3b8'} />
                    </TouchableOpacity>
                  </View>

                  {(!employeesByScope[employeeScope] || employeesByScope[employeeScope].size === 0) ? (
                    <View className="py-6 items-center justify-center bg-slate-50 rounded-xl border border-slate-100">
                      <Text className="text-slate-500 font-medium">No employees added yet for this supplier.</Text>
                    </View>
                  ) : (
                    Array.from(employeesByScope[employeeScope]).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).map(name => (
                      <View
                        key={name}
                        className="flex-row items-center justify-between p-4 mb-2 rounded-xl border border-slate-100 bg-white"
                      >
                        <View className="flex-row items-center flex-1 pr-4">
                          <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-blue-100">
                            <UserPlus size={18} color="#1d4ed8" />
                          </View>
                          <Text className="font-semibold text-base text-slate-700">{name}</Text>
                        </View>
                        <TouchableOpacity onPress={() => removeEmployee(name)} className="p-2 active:opacity-60">
                          <X size={18} color="#94a3b8" />
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </>
              ) : (
                <View className="py-6 items-center justify-center bg-slate-50 rounded-xl border border-slate-100">
                  <Text className="text-slate-500 font-medium text-center px-4">
                    {allSuppliers.filter(s => allocatedSupplierIds.has(s.id) && s.supplier_type !== 'EQUIPMENT').length === 0
                      ? 'Toggle on a supplier above first (not tagged "Equipment" in Master Data), then come back here to add its employees.'
                      : 'Select a supplier above to manage its employee roster.'}
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              className={`w-full py-4 rounded-2xl flex-row items-center justify-center mt-6 ${saving ? 'bg-blue-800 opacity-80' : 'bg-[#1e3a8a] active:bg-[#1e40af]'}`}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Save size={20} color="#ffffff" className="mr-2" />
                  <Text className="text-white font-bold text-lg">Save Allocations</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View className="bg-white rounded-3xl p-10 border border-slate-200 shadow-sm items-center justify-center mb-12">
            <View className="bg-slate-50 p-6 rounded-full mb-4">
              <MapPin size={48} color="#cbd5e1" />
            </View>
            <Text className="text-xl font-bold text-slate-700 mb-2">No Site Selected</Text>
            <Text className="text-slate-500 text-center max-w-xs">
              Select a Job Site above to see and manage the equipment and suppliers deployed there.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Add Equipment Modal */}
      <Modal visible={showAddEquipModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 shadow-2xl">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-xl font-black text-slate-900">Add New Equipment</Text>
              <TouchableOpacity onPress={() => setShowAddEquipModal(false)} className="p-2 bg-slate-100 rounded-full">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <CustomPicker
              label="Category"
              value={newEquipCat}
              options={[
                { label: 'Heavy Machinery', value: 'Heavy Machinery' },
                { label: 'Trucks', value: 'Trucks' },
                { label: 'Tankers', value: 'Tankers' },
                { label: 'Light Equipment', value: 'Light Equipment' }
              ]}
              onSelect={setNewEquipCat}
              placeholder="Select Category"
            />
            <Text className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-1.5 mt-2">Equipment Name</Text>
            <TextInput
              value={newEquipName}
              onChangeText={setNewEquipName}
              placeholder="e.g. 50 Ton Crane"
              className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-900 font-semibold mb-6"
              autoCapitalize="words"
            />
            <TouchableOpacity
              onPress={handleAddEquipment}
              disabled={isAddingEquip}
              className={`w-full py-4 rounded-2xl flex-row items-center justify-center ${isAddingEquip ? 'bg-blue-300' : 'bg-[#1e3a8a] active:bg-[#1e40af]'}`}
            >
              {isAddingEquip ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-lg">Save Equipment</Text>}
            </TouchableOpacity>
            <View className="h-8" />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Supplier Modal */}
      <Modal visible={showAddSuppModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 shadow-2xl">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-xl font-black text-slate-900">Add New Supplier</Text>
              <TouchableOpacity onPress={() => setShowAddSuppModal(false)} className="p-2 bg-slate-100 rounded-full">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-1.5">Supplier Name</Text>
            <TextInput
              value={newSuppName}
              onChangeText={setNewSuppName}
              placeholder="e.g. ABC Trading LLC"
              className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-900 font-semibold mb-6"
              autoCapitalize="words"
            />
            <TouchableOpacity
              onPress={handleAddSupplier}
              disabled={isAddingSupp}
              className={`w-full py-4 rounded-2xl flex-row items-center justify-center ${isAddingSupp ? 'bg-blue-300' : 'bg-[#1e3a8a] active:bg-[#1e40af]'}`}
            >
              {isAddingSupp ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-lg">Save Supplier</Text>}
            </TouchableOpacity>
            <View className="h-8" />
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}
