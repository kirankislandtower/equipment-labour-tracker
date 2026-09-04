import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal, Platform, useWindowDimensions } from 'react-native';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/crossAlert';
import { Briefcase, Truck, Users, Plus, X, ToggleLeft, ToggleRight, Building2, Edit2, Save, Trash2 } from 'lucide-react-native';

export default function AdminSettings() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [activeTab, setActiveTab] = useState<'JOBS' | 'SUPPLIERS' | 'EQUIPMENT' | 'DESIGNATIONS'>('JOBS');
  const [loading, setLoading] = useState(true);
  
  const [jobs, setJobs] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [designations, setDesignations] = useState<any[]>([]);

  const [counts, setCounts] = useState({ jobs: 0, suppliers: 0, equipment: 0, designations: 0 });

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  // Modals
  const [addJobModal, setAddJobModal] = useState(false);
  const [addSupplierModal, setAddSupplierModal] = useState(false);
  const [addEquipModal, setAddEquipModal] = useState(false);
  const [addDesigModal, setAddDesigModal] = useState(false);

  // Form states
  const [jobForm, setJobForm] = useState({ job_number: '', job_name: '', location: '' });
  const [supplierForm, setSupplierForm] = useState({ supplier_name: '', contact_person: '', phone_number: '' });
  const [equipForm, setEquipForm] = useState({ equipment_category: 'Tankers', equipment_name: '' });
  const [desigForm, setDesigForm] = useState({ designation_name: '' });

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  useEffect(() => {
    fetchCounts();
  }, []);

  const fetchCounts = async () => {
    try {
      const [jobsRes, suppliersRes, equipmentRes, designationsRes] = await Promise.all([
        supabase.from('jobs').select('*', { count: 'exact', head: true }),
        supabase.from('suppliers').select('*', { count: 'exact', head: true }),
        supabase.from('equipment_master').select('*', { count: 'exact', head: true }),
        supabase.from('labour_designations').select('*', { count: 'exact', head: true }),
      ]);
      setCounts({
        jobs: jobsRes.count || 0,
        suppliers: suppliersRes.count || 0,
        equipment: equipmentRes.count || 0,
        designations: designationsRes.count || 0,
      });
    } catch (error) {
      console.error(error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'JOBS') {
        const { data } = await supabase.from('jobs').select('*').order('job_number');
        setJobs(data || []);
      } else if (activeTab === 'SUPPLIERS') {
        const { data } = await supabase.from('suppliers').select('*').order('supplier_name');
        setSuppliers(data || []);
      } else if (activeTab === 'EQUIPMENT') {
        const { data } = await supabase.from('equipment_master').select('*').order('equipment_category');
        setEquipment(data || []);
      } else if (activeTab === 'DESIGNATIONS') {
        const { data } = await supabase.from('labour_designations').select('*').order('designation_name');
        setDesignations(data || []);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (table: string, id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase.from(table).update({ is_active: !currentStatus }).eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      showAlert('Error', 'Could not update status');
    }
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const saveEdit = async (table: string, id: string) => {
    try {
      // Remove id and created_at from the payload to avoid updating them
      const { id: _, created_at: __, ...updatePayload } = editForm;
      const { error } = await supabase.from(table).update(updatePayload).eq('id', id);
      if (error) throw error;
      setEditingId(null);
      setEditForm({});
      fetchData();
    } catch (error: any) {
      showAlert('Error', error.message || 'Could not save changes');
    }
  };

  const deleteRecord = (table: string, id: string, name: string) => {
    const executeDelete = async () => {
      try {
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) {
          if (error.code === '23503') {
            throw new Error('Cannot delete this record because it is currently being used in daily entries.');
          }
          throw error;
        }
        fetchData();
        fetchCounts();
      } catch (error: any) {
        if (Platform.OS === 'web') {
          window.alert('Delete Failed: ' + (error.message || 'Could not delete record.'));
        } else {
          Alert.alert('Delete Failed', error.message || 'Could not delete record.');
        }
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`Are you sure you want to delete "${name}"?`);
      if (confirmed) {
        executeDelete();
      }
    } else {
      Alert.alert(
        'Delete Record',
        `Are you sure you want to delete "${name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Delete', 
            style: 'destructive',
            onPress: executeDelete
          }
        ]
      );
    }
  };

  const submitJob = async () => {
    try {
      const { error } = await supabase.from('jobs').insert(jobForm);
      if (error) throw error;
      setAddJobModal(false);
      setJobForm({ job_number: '', job_name: '', location: '' });
      fetchData();
      fetchCounts();
    } catch (error: any) {
      showAlert('Error', error.message);
    }
  };

  const submitSupplier = async () => {
    try {
      const { error } = await supabase.from('suppliers').insert(supplierForm);
      if (error) throw error;
      setAddSupplierModal(false);
      setSupplierForm({ supplier_name: '', contact_person: '', phone_number: '' });
      fetchData();
      fetchCounts();
    } catch (error: any) {
      showAlert('Error', error.message);
    }
  };

  const submitEquipment = async () => {
    try {
      const { error } = await supabase.from('equipment_master').insert(equipForm);
      if (error) throw error;
      setAddEquipModal(false);
      setEquipForm({ equipment_category: 'Tankers', equipment_name: '' });
      fetchData();
      fetchCounts();
    } catch (error: any) {
      showAlert('Error', error.message);
    }
  };

  const submitDesignation = async () => {
    try {
      const { error } = await supabase.from('labour_designations').insert(desigForm);
      if (error) throw error;
      setAddDesigModal(false);
      setDesigForm({ designation_name: '' });
      fetchData();
      fetchCounts();
    } catch (error: any) {
      showAlert('Error', error.message);
    }
  };

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: isMobile ? 16 : 32, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      <View className="flex-row justify-between items-center mb-6">
        <View>
          <Text className="text-slate-900 text-3xl font-black tracking-tight">Master Data</Text>
          <Text className="text-slate-500 mt-1">Manage dropdown lists for jobs, suppliers, and equipment.</Text>
        </View>
      </View>

      <View className="flex-row flex-wrap bg-white rounded-xl shadow-sm border border-slate-200 p-1 mb-6">
        <TouchableOpacity 
          onPress={() => setActiveTab('JOBS')}
          className={`${isMobile ? 'w-[48%] mb-1' : 'flex-1'} py-3 px-2 rounded-lg flex-row items-center justify-center ${activeTab === 'JOBS' ? 'bg-slate-900' : 'bg-transparent'}`}
        >
          <Briefcase size={16} color={activeTab === 'JOBS' ? '#fff' : '#64748b'} />
          <Text className={`font-bold ml-2 text-sm ${activeTab === 'JOBS' ? 'text-white' : 'text-slate-500'}`}>Jobs ({counts.jobs})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('SUPPLIERS')}
          className={`${isMobile ? 'w-[48%] mb-1' : 'flex-1'} py-3 px-2 rounded-lg flex-row items-center justify-center ${activeTab === 'SUPPLIERS' ? 'bg-slate-900' : 'bg-transparent'}`}
        >
          <Building2 size={16} color={activeTab === 'SUPPLIERS' ? '#fff' : '#64748b'} />
          <Text className={`font-bold ml-2 text-sm ${activeTab === 'SUPPLIERS' ? 'text-white' : 'text-slate-500'}`}>Suppliers ({counts.suppliers})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('EQUIPMENT')}
          className={`${isMobile ? 'w-[48%]' : 'flex-1'} py-3 px-2 rounded-lg flex-row items-center justify-center ${activeTab === 'EQUIPMENT' ? 'bg-slate-900' : 'bg-transparent'}`}
        >
          <Truck size={16} color={activeTab === 'EQUIPMENT' ? '#fff' : '#64748b'} />
          <Text className={`font-bold ml-2 text-sm ${activeTab === 'EQUIPMENT' ? 'text-white' : 'text-slate-500'}`}>Equipment ({counts.equipment})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('DESIGNATIONS')}
          className={`${isMobile ? 'w-[48%]' : 'flex-1'} py-3 px-2 rounded-lg flex-row items-center justify-center ${activeTab === 'DESIGNATIONS' ? 'bg-slate-900' : 'bg-transparent'}`}
        >
          <Users size={16} color={activeTab === 'DESIGNATIONS' ? '#fff' : '#64748b'} />
          <Text className={`font-bold ml-2 text-sm ${activeTab === 'DESIGNATIONS' ? 'text-white' : 'text-slate-500'}`}>Roles ({counts.designations})</Text>
        </TouchableOpacity>
      </View>

      <View className="bg-transparent overflow-hidden">
        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#0f172a" />
          </View>
        ) : (
          <View className="flex-1 pb-6">
            {/* JOBS TAB */}
            {activeTab === 'JOBS' && (
              <View className={`${isMobile ? '' : 'bg-white rounded-2xl shadow-sm border border-slate-200'} pb-20`}>
                {!isMobile && (
                  <View className="flex-row items-center p-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
                    <Text className="flex-[0.5] font-bold text-slate-500 text-xs uppercase">Job #</Text>
                    <Text className="flex-1 font-bold text-slate-500 text-xs uppercase">Job Name</Text>
                    <Text className="flex-1 font-bold text-slate-500 text-xs uppercase">Location</Text>
                    <Text className="w-28 font-bold text-slate-500 text-xs uppercase text-center">Actions</Text>
                  </View>
                )}
                {jobs.map((job) => (
                  <View key={job.id} className={`${isMobile ? 'bg-white mb-3 p-4 rounded-xl shadow-sm border border-slate-100 flex-col' : 'flex-row items-center p-4 border-b border-slate-100'}`}>
                    {editingId === job.id ? (
                      <>
                        {isMobile && <Text className="text-xs font-bold text-slate-400 mb-1">JOB #</Text>}
                        <TextInput
                          className={`${isMobile ? 'mb-2' : 'flex-[0.5] mr-2'} bg-slate-50 border border-slate-200 rounded p-2 text-slate-900`}
                          value={editForm.job_number}
                          onChangeText={(t) => setEditForm({ ...editForm, job_number: t })}
                        />
                        {isMobile && <Text className="text-xs font-bold text-slate-400 mb-1">JOB NAME</Text>}
                        <TextInput
                          className={`${isMobile ? 'mb-2' : 'flex-1 mr-2'} bg-slate-50 border border-slate-200 rounded p-2 text-slate-900`}
                          value={editForm.job_name}
                          onChangeText={(t) => setEditForm({ ...editForm, job_name: t })}
                        />
                        {isMobile && <Text className="text-xs font-bold text-slate-400 mb-1">LOCATION</Text>}
                        <TextInput
                          className={`${isMobile ? 'mb-3' : 'flex-1'} bg-slate-50 border border-slate-200 rounded p-2 text-slate-900`}
                          value={editForm.location}
                          onChangeText={(t) => setEditForm({ ...editForm, location: t })}
                        />
                      </>
                    ) : (
                      <>
                        {isMobile && <Text className="text-xs font-bold text-slate-400 mb-1">JOB #</Text>}
                        <Text className={`${isMobile ? 'mb-2' : 'flex-[0.5]'} text-slate-900 font-bold`}>{job.job_number}</Text>
                        
                        {isMobile && <Text className="text-xs font-bold text-slate-400 mb-1">JOB NAME</Text>}
                        <Text className={`${isMobile ? 'mb-2' : 'flex-1'} text-slate-900`}>{job.job_name}</Text>
                        
                        {isMobile && <Text className="text-xs font-bold text-slate-400 mb-1">LOCATION</Text>}
                        <Text className={`${isMobile ? 'mb-3' : 'flex-1'} text-slate-500`}>{job.location}</Text>
                      </>
                    )}
                    
                    <View className={`${isMobile ? 'flex-row justify-between items-center border-t border-slate-100 pt-3' : 'w-28 flex-row items-center justify-end space-x-2 ml-2'}`}>
                      {isMobile && <Text className="text-xs font-bold text-slate-400">ACTIONS</Text>}
                      <View className="flex-row items-center space-x-3">
                        {editingId === job.id ? (
                          <TouchableOpacity onPress={() => saveEdit('jobs', job.id)} className="bg-blue-50 p-2 rounded-full">
                            <Save size={20} color="#2563eb" />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity onPress={() => startEdit(job)} className="p-2">
                            <Edit2 size={18} color="#94a3b8" />
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => deleteRecord('jobs', job.id, job.job_name)} className="p-2">
                          <Trash2 size={18} color="#ef4444" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => toggleStatus('jobs', job.id, job.is_active)}>
                          {job.is_active ? <ToggleRight size={32} color="#10b981" /> : <ToggleLeft size={32} color="#cbd5e1" />}
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
                <TouchableOpacity onPress={() => setAddJobModal(true)} className={`${isMobile ? 'bg-white rounded-xl shadow-sm border border-slate-200' : 'border-t border-slate-100'} p-4 flex-row items-center justify-center active:bg-slate-50`}>
                  <Plus size={20} color="#0f172a" />
                  <Text className="font-bold text-slate-900 ml-2">Add New Job</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* SUPPLIERS TAB */}
            {activeTab === 'SUPPLIERS' && (
              <View className={`${isMobile ? '' : 'bg-white rounded-2xl shadow-sm border border-slate-200'} pb-20`}>
                {!isMobile && (
                  <View className="flex-row items-center p-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
                    <Text className="flex-1 font-bold text-slate-500 text-xs uppercase">Supplier Name</Text>
                    <Text className="flex-1 font-bold text-slate-500 text-xs uppercase">Contact Person</Text>
                    <Text className="flex-1 font-bold text-slate-500 text-xs uppercase">Phone</Text>
                    <Text className="w-40 font-bold text-slate-500 text-xs uppercase">Type</Text>
                    <Text className="w-28 font-bold text-slate-500 text-xs uppercase text-center">Actions</Text>
                  </View>
                )}
                {suppliers.map((sup) => (
                  <View key={sup.id} className={`${isMobile ? 'bg-white mb-3 p-4 rounded-xl shadow-sm border border-slate-100 flex-col' : 'flex-row items-center p-4 border-b border-slate-100'}`}>
                    {editingId === sup.id ? (
                      <>
                        {isMobile && <Text className="text-xs font-bold text-slate-400 mb-1">SUPPLIER NAME</Text>}
                        <TextInput
                          className={`${isMobile ? 'mb-2' : 'flex-1 mr-2'} bg-slate-50 border border-slate-200 rounded p-2 text-slate-900`}
                          value={editForm.supplier_name}
                          onChangeText={(t) => setEditForm({ ...editForm, supplier_name: t })}
                        />
                        {isMobile && <Text className="text-xs font-bold text-slate-400 mb-1">CONTACT PERSON</Text>}
                        <TextInput
                          className={`${isMobile ? 'mb-2' : 'flex-1 mr-2'} bg-slate-50 border border-slate-200 rounded p-2 text-slate-900`}
                          value={editForm.contact_person}
                          onChangeText={(t) => setEditForm({ ...editForm, contact_person: t })}
                        />
                        {isMobile && <Text className="text-xs font-bold text-slate-400 mb-1">PHONE</Text>}
                        <TextInput
                          className={`${isMobile ? 'mb-3' : 'flex-1 mr-2'} bg-slate-50 border border-slate-200 rounded p-2 text-slate-900`}
                          value={editForm.phone_number}
                          onChangeText={(t) => setEditForm({ ...editForm, phone_number: t })}
                        />
                        {isMobile && <Text className="text-xs font-bold text-slate-400 mb-1">TYPE</Text>}
                        <View className={`${isMobile ? 'mb-3' : 'w-40'} flex-row`}>
                          {(['LABOUR', 'EQUIPMENT'] as const).map(type => {
                            const isSelected = editForm.supplier_type === type;
                            return (
                              <TouchableOpacity
                                key={type}
                                onPress={() => setEditForm({ ...editForm, supplier_type: isSelected ? null : type })}
                                className={`px-2 py-1 rounded-full mr-1.5 border ${isSelected ? (type === 'LABOUR' ? 'bg-emerald-100 border-emerald-300' : 'bg-blue-100 border-blue-300') : 'bg-slate-50 border-slate-200'}`}
                              >
                                <Text className={`text-[10px] font-bold ${isSelected ? (type === 'LABOUR' ? 'text-emerald-700' : 'text-blue-700') : 'text-slate-500'}`}>
                                  {type === 'LABOUR' ? 'Labour' : 'Equipment'}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </>
                    ) : (
                      <>
                        {isMobile && <Text className="text-xs font-bold text-slate-400 mb-1">SUPPLIER NAME</Text>}
                        <Text className={`${isMobile ? 'mb-2' : 'flex-1'} text-slate-900 font-bold`}>{sup.supplier_name}</Text>

                        {isMobile && <Text className="text-xs font-bold text-slate-400 mb-1">CONTACT PERSON</Text>}
                        <Text className={`${isMobile ? 'mb-2' : 'flex-1'} text-slate-600`}>{sup.contact_person || '-'}</Text>

                        {isMobile && <Text className="text-xs font-bold text-slate-400 mb-1">PHONE</Text>}
                        <Text className={`${isMobile ? 'mb-3' : 'flex-1'} text-slate-500`}>{sup.phone_number || '-'}</Text>

                        {isMobile && <Text className="text-xs font-bold text-slate-400 mb-1">TYPE</Text>}
                        <View className={isMobile ? 'mb-3' : 'w-40'}>
                          {sup.supplier_type ? (
                            <View className={`self-start px-2 py-1 rounded-full ${sup.supplier_type === 'LABOUR' ? 'bg-emerald-100' : 'bg-blue-100'}`}>
                              <Text className={`text-[10px] font-bold ${sup.supplier_type === 'LABOUR' ? 'text-emerald-700' : 'text-blue-700'}`}>
                                {sup.supplier_type === 'LABOUR' ? 'Labour' : 'Equipment'}
                              </Text>
                            </View>
                          ) : (
                            <Text className="text-slate-400 text-xs">Untagged</Text>
                          )}
                        </View>
                      </>
                    )}
                    
                    <View className={`${isMobile ? 'flex-row justify-between items-center border-t border-slate-100 pt-3' : 'w-28 flex-row items-center justify-end space-x-2 ml-2'}`}>
                      {isMobile && <Text className="text-xs font-bold text-slate-400">ACTIONS</Text>}
                      <View className="flex-row items-center space-x-3">
                        {editingId === sup.id ? (
                          <TouchableOpacity onPress={() => saveEdit('suppliers', sup.id)} className="bg-blue-50 p-2 rounded-full">
                            <Save size={20} color="#2563eb" />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity onPress={() => startEdit(sup)} className="p-2">
                            <Edit2 size={18} color="#94a3b8" />
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => deleteRecord('suppliers', sup.id, sup.supplier_name)} className="p-2">
                          <Trash2 size={18} color="#ef4444" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => toggleStatus('suppliers', sup.id, sup.is_active)}>
                          {sup.is_active ? <ToggleRight size={32} color="#10b981" /> : <ToggleLeft size={32} color="#cbd5e1" />}
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
                <TouchableOpacity onPress={() => setAddSupplierModal(true)} className={`${isMobile ? 'bg-white rounded-xl shadow-sm border border-slate-200' : 'border-t border-slate-100'} p-4 flex-row items-center justify-center active:bg-slate-50`}>
                  <Plus size={20} color="#0f172a" />
                  <Text className="font-bold text-slate-900 ml-2">Add New Supplier</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* EQUIPMENT TAB */}
            {activeTab === 'EQUIPMENT' && (
              <View className={`${isMobile ? '' : 'bg-white rounded-2xl shadow-sm border border-slate-200'} pb-20`}>
                {!isMobile && (
                  <View className="flex-row items-center p-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
                    <Text className="flex-1 font-bold text-slate-500 text-xs uppercase">Category</Text>
                    <Text className="flex-[2] font-bold text-slate-500 text-xs uppercase">Equipment Name</Text>
                    <Text className="w-28 font-bold text-slate-500 text-xs uppercase text-center">Actions</Text>
                  </View>
                )}
                {equipment.map((eq) => (
                  <View key={eq.id} className={`${isMobile ? 'bg-white mb-3 p-4 rounded-xl shadow-sm border border-slate-100 flex-col' : 'flex-row items-center p-4 border-b border-slate-100'}`}>
                    {editingId === eq.id ? (
                      <>
                        {isMobile && <Text className="text-xs font-bold text-slate-400 mb-1">CATEGORY</Text>}
                        <TextInput
                          className={`${isMobile ? 'mb-2' : 'flex-1 mr-2'} bg-slate-50 border border-slate-200 rounded p-2 text-slate-900`}
                          value={editForm.equipment_category}
                          onChangeText={(t) => setEditForm({ ...editForm, equipment_category: t })}
                        />
                        {isMobile && <Text className="text-xs font-bold text-slate-400 mb-1">EQUIPMENT NAME</Text>}
                        <TextInput
                          className={`${isMobile ? 'mb-3' : 'flex-[2]'} bg-slate-50 border border-slate-200 rounded p-2 text-slate-900`}
                          value={editForm.equipment_name}
                          onChangeText={(t) => setEditForm({ ...editForm, equipment_name: t })}
                        />
                      </>
                    ) : (
                      <>
                        {isMobile && <Text className="text-xs font-bold text-slate-400 mb-1">CATEGORY</Text>}
                        <Text className={`${isMobile ? 'mb-2' : 'flex-1'} text-slate-500`}>{eq.equipment_category}</Text>
                        
                        {isMobile && <Text className="text-xs font-bold text-slate-400 mb-1">EQUIPMENT NAME</Text>}
                        <Text className={`${isMobile ? 'mb-3' : 'flex-[2]'} text-slate-900 font-bold`}>{eq.equipment_name}</Text>
                      </>
                    )}
                    
                    <View className={`${isMobile ? 'flex-row justify-between items-center border-t border-slate-100 pt-3' : 'w-28 flex-row items-center justify-end space-x-2 ml-2'}`}>
                      {isMobile && <Text className="text-xs font-bold text-slate-400">ACTIONS</Text>}
                      <View className="flex-row items-center space-x-3">
                        {editingId === eq.id ? (
                          <TouchableOpacity onPress={() => saveEdit('equipment_master', eq.id)} className="bg-blue-50 p-2 rounded-full">
                            <Save size={20} color="#2563eb" />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity onPress={() => startEdit(eq)} className="p-2">
                            <Edit2 size={18} color="#94a3b8" />
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => deleteRecord('equipment_master', eq.id, eq.equipment_name)} className="p-2">
                          <Trash2 size={18} color="#ef4444" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => toggleStatus('equipment_master', eq.id, eq.is_active)}>
                          {eq.is_active ? <ToggleRight size={32} color="#10b981" /> : <ToggleLeft size={32} color="#cbd5e1" />}
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
                <TouchableOpacity onPress={() => setAddEquipModal(true)} className={`${isMobile ? 'bg-white rounded-xl shadow-sm border border-slate-200' : 'border-t border-slate-100'} p-4 flex-row items-center justify-center active:bg-slate-50`}>
                  <Plus size={20} color="#0f172a" />
                  <Text className="font-bold text-slate-900 ml-2">Add New Equipment</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* DESIGNATIONS TAB */}
            {activeTab === 'DESIGNATIONS' && (
              <View className={`${isMobile ? '' : 'bg-white rounded-2xl shadow-sm border border-slate-200'} pb-20`}>
                {!isMobile && (
                  <View className="flex-row items-center p-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
                    <Text className="flex-1 font-bold text-slate-500 text-xs uppercase">Role Name</Text>
                    <Text className="w-28 font-bold text-slate-500 text-xs uppercase text-center">Actions</Text>
                  </View>
                )}
                {designations.map((des) => (
                  <View key={des.id} className={`${isMobile ? 'bg-white mb-3 p-4 rounded-xl shadow-sm border border-slate-100 flex-col' : 'flex-row items-center p-4 border-b border-slate-100'}`}>
                    {editingId === des.id ? (
                      <>
                        {isMobile && <Text className="text-xs font-bold text-slate-400 mb-1">ROLE NAME</Text>}
                        <TextInput
                          className={`${isMobile ? 'mb-3' : 'flex-1'} bg-slate-50 border border-slate-200 rounded p-2 text-slate-900`}
                          value={editForm.designation_name}
                          onChangeText={(t) => setEditForm({ ...editForm, designation_name: t })}
                        />
                      </>
                    ) : (
                      <>
                        {isMobile && <Text className="text-xs font-bold text-slate-400 mb-1">ROLE NAME</Text>}
                        <Text className={`${isMobile ? 'mb-3' : 'flex-1'} text-slate-900 font-bold`}>{des.designation_name}</Text>
                      </>
                    )}
                    
                    <View className={`${isMobile ? 'flex-row justify-between items-center border-t border-slate-100 pt-3' : 'w-28 flex-row items-center justify-end space-x-2 ml-2'}`}>
                      {isMobile && <Text className="text-xs font-bold text-slate-400">ACTIONS</Text>}
                      <View className="flex-row items-center space-x-3">
                        {editingId === des.id ? (
                          <TouchableOpacity onPress={() => saveEdit('labour_designations', des.id)} className="bg-blue-50 p-2 rounded-full">
                            <Save size={20} color="#2563eb" />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity onPress={() => startEdit(des)} className="p-2">
                            <Edit2 size={18} color="#94a3b8" />
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => deleteRecord('labour_designations', des.id, des.designation_name)} className="p-2">
                          <Trash2 size={18} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
                <TouchableOpacity onPress={() => setAddDesigModal(true)} className={`${isMobile ? 'bg-white rounded-xl shadow-sm border border-slate-200' : 'border-t border-slate-100'} p-4 flex-row items-center justify-center active:bg-slate-50`}>
                  <Plus size={20} color="#0f172a" />
                  <Text className="font-bold text-slate-900 ml-2">Add New Role</Text>
                </TouchableOpacity>
              </View>
            )}
            </View>
        )}
      </View>
      </ScrollView>

      {/* Add Job Modal */}
      <Modal visible={addJobModal} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center p-8">
          <View className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xl font-bold text-slate-900">Add New Job</Text>
              <TouchableOpacity onPress={() => setAddJobModal(false)}><X size={24} color="#64748b" /></TouchableOpacity>
            </View>
            <TextInput placeholder="Job Number (e.g. JOB-003)" value={jobForm.job_number} onChangeText={t => setJobForm({...jobForm, job_number: t})} className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-3 text-slate-900" />
            <TextInput placeholder="Job Name" value={jobForm.job_name} onChangeText={t => setJobForm({...jobForm, job_name: t})} className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-3 text-slate-900" />
            <TextInput placeholder="Location" value={jobForm.location} onChangeText={t => setJobForm({...jobForm, location: t})} className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6 text-slate-900" />
            <TouchableOpacity onPress={submitJob} className="bg-slate-900 py-4 rounded-xl items-center"><Text className="text-white font-bold">Save Job</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Supplier Modal */}
      <Modal visible={addSupplierModal} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center p-8">
          <View className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xl font-bold text-slate-900">Add New Supplier</Text>
              <TouchableOpacity onPress={() => setAddSupplierModal(false)}><X size={24} color="#64748b" /></TouchableOpacity>
            </View>
            <TextInput placeholder="Supplier Name" value={supplierForm.supplier_name} onChangeText={t => setSupplierForm({...supplierForm, supplier_name: t})} className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-3 text-slate-900" />
            <TextInput placeholder="Contact Person" value={supplierForm.contact_person} onChangeText={t => setSupplierForm({...supplierForm, contact_person: t})} className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-3 text-slate-900" />
            <TextInput placeholder="Phone Number" value={supplierForm.phone_number} onChangeText={t => setSupplierForm({...supplierForm, phone_number: t})} className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6 text-slate-900" />
            <TouchableOpacity onPress={submitSupplier} className="bg-slate-900 py-4 rounded-xl items-center"><Text className="text-white font-bold">Save Supplier</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Equipment Modal */}
      <Modal visible={addEquipModal} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center p-8">
          <View className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xl font-bold text-slate-900">Add New Equipment</Text>
              <TouchableOpacity onPress={() => setAddEquipModal(false)}><X size={24} color="#64748b" /></TouchableOpacity>
            </View>
            <TextInput placeholder="Category (e.g. Tankers, Trucks)" value={equipForm.equipment_category} onChangeText={t => setEquipForm({...equipForm, equipment_category: t})} className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-3 text-slate-900" />
            <TextInput placeholder="Equipment Name" value={equipForm.equipment_name} onChangeText={t => setEquipForm({...equipForm, equipment_name: t})} className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6 text-slate-900" />
            <TouchableOpacity onPress={submitEquipment} className="bg-slate-900 py-4 rounded-xl items-center"><Text className="text-white font-bold">Save Equipment</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Designation Modal */}
      <Modal visible={addDesigModal} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center p-8">
          <View className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xl font-bold text-slate-900">Add New Role</Text>
              <TouchableOpacity onPress={() => setAddDesigModal(false)}><X size={24} color="#64748b" /></TouchableOpacity>
            </View>
            <TextInput placeholder="Role Name (e.g. Plumber, Mason)" value={desigForm.designation_name} onChangeText={t => setDesigForm({...desigForm, designation_name: t})} className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6 text-slate-900" />
            <TouchableOpacity onPress={submitDesignation} className="bg-slate-900 py-4 rounded-xl items-center"><Text className="text-white font-bold">Save Role</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}
