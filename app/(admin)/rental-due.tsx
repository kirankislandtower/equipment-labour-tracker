import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Alert, Modal } from 'react-native';
import { supabase } from '../../lib/supabase';
import { AlarmClock, Search, Truck, Users, PowerOff, Trash2, X, MapPin, ChevronDown } from 'lucide-react-native';
import { FadeInUp } from '../../components/Animations';
import { logOffHireAction } from '../../lib/equipmentOffHire';
import { formatDueLabel, formatRentalPeriod, clearRentalInfo, RentalInfoRow, RENTAL_BASIS_OPTIONS } from '../../lib/equipmentRental';

interface RentalDueRow {
  id: string;
  jobId: string;
  supplierId: string | null;
  equipmentMasterId: string;
  rentalBasis: RentalInfoRow['rental_basis'];
  rentalStartAt: string | null;
  rentalDueAt: string | null;
  jobNumber: string;
  jobName: string;
  supplierName: string | null;
  equipmentName: string;
}

const DUE_SOON_MS = 48 * 60 * 60 * 1000; // within 48 hours counts as "Due Soon"

// A top-level component (not defined inside RentalDueScreen) so its own
// `query` state doesn't get recreated -- and the search box doesn't lose
// focus on every keystroke -- each time the parent re-renders.
function SearchablePicker({
  visible,
  onClose,
  title,
  options,
  selectedId,
  onSelect,
  allLabel,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: { id: string; label: string }[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  allLabel: string;
}) {
  const [query, setQuery] = useState('');
  const filtered = query.trim() ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())) : options;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-center items-center p-6">
        <View className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl" style={{ maxHeight: '75%' }}>
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-black text-slate-900">{title}</Text>
            <TouchableOpacity onPress={onClose} className="p-1">
              <X size={20} color="#64748b" />
            </TouchableOpacity>
          </View>
          <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-4 h-12 mb-4">
            <Search size={16} color="#94a3b8" />
            <TextInput
              placeholder={`Search ${title.toLowerCase()}...`}
              placeholderTextColor="#94a3b8"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              className="flex-1 ml-3 text-slate-900"
              style={{ outlineStyle: 'none' } as any}
            />
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <TouchableOpacity
              onPress={() => {
                onSelect(null);
                onClose();
              }}
              className={`p-3.5 mb-1.5 rounded-xl border ${!selectedId ? 'border-indigo-200 bg-indigo-50' : 'border-slate-100 bg-slate-50'}`}
            >
              <Text className={`font-bold ${!selectedId ? 'text-indigo-700' : 'text-slate-600'}`}>{allLabel}</Text>
            </TouchableOpacity>
            {filtered.length === 0 && <Text className="text-slate-400 font-medium text-center py-6">No matches.</Text>}
            {filtered.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                onPress={() => {
                  onSelect(opt.id);
                  onClose();
                }}
                className={`p-3.5 mb-1.5 rounded-xl border ${selectedId === opt.id ? 'border-indigo-200 bg-indigo-50' : 'border-slate-100 bg-slate-50'}`}
              >
                <Text className={`font-semibold ${selectedId === opt.id ? 'text-indigo-700' : 'text-slate-700'}`}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// Fleet-wide monitoring page: every piece of equipment anywhere that has a
// rental due date set (via Site Allocations or Allocation Report), so an admin
// doesn't have to open each job individually to notice something's overdue.
// Purely informational -- it does NOT hide anything from the Foreman app.
// This is where the admin actually acts on an overdue item if they want to
// (mark off-hire, or remove it from the allocation once the supplier's
// collected it) -- both are manual steps, never automatic.
export default function RentalDueScreen() {
  const [loading, setLoading] = useState(true);
  const [activeCompany, setActiveCompany] = useState<'IST' | 'JAH' | 'HYDRO'>('IST');
  const [rows, setRows] = useState<RentalDueRow[]>([]);
  const [offHireKeysGlobal, setOffHireKeysGlobal] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'overdue' | 'due_soon' | 'all'>('overdue');
  const [activeBasisTab, setActiveBasisTab] = useState<'ALL' | RentalInfoRow['rental_basis']>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [offHireConfirmRow, setOffHireConfirmRow] = useState<RentalDueRow | null>(null);

  // Job filter, and a Supplier filter scoped to whichever job (if any) is
  // selected -- "GENERAL" is the sentinel for the no-supplier scope, same
  // convention as equipmentScope elsewhere in the admin (e.g. allocations.tsx).
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [jobPickerVisible, setJobPickerVisible] = useState(false);
  const [supplierPickerVisible, setSupplierPickerVisible] = useState(false);

  useEffect(() => {
    fetchData();
    setSelectedJobId(null);
    setSelectedSupplierId(null);
  }, [activeCompany]);

  // A supplier filter from a different job no longer makes sense once the job
  // changes -- clear it rather than silently showing an empty list.
  useEffect(() => {
    setSelectedSupplierId(null);
  }, [selectedJobId]);

  const globalKey = (jobId: string, supplierId: string | null, equipmentMasterId: string) =>
    `${jobId}:${supplierId || 'GENERAL'}:${equipmentMasterId}`;

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rentalRes, offHireRes] = await Promise.all([
        supabase
          .from('job_equipment_rental')
          .select('*, jobs!inner(job_number, job_name, company), suppliers(supplier_name), equipment_master!inner(equipment_name)')
          .eq('jobs.company', activeCompany)
          .order('rental_due_at', { ascending: true }),
        // Not scoped to one job -- this page spans every job, so the off-hire
        // status needs to be computed across all of them at once.
        supabase.from('job_equipment_offhire_log').select('job_id, supplier_id, equipment_master_id, action, created_at').order('created_at', { ascending: false }),
      ]);

      const mapped: RentalDueRow[] = (rentalRes.data || []).map((r: any) => ({
        id: r.id,
        jobId: r.job_id,
        supplierId: r.supplier_id,
        equipmentMasterId: r.equipment_master_id,
        rentalBasis: r.rental_basis,
        rentalStartAt: r.rental_start_at,
        rentalDueAt: r.rental_due_at,
        jobNumber: r.jobs?.job_number || '',
        jobName: r.jobs?.job_name || '',
        supplierName: r.suppliers?.supplier_name || null,
        equipmentName: r.equipment_master?.equipment_name || 'Unknown Equipment',
      }));
      setRows(mapped);

      const seen = new Set<string>();
      const offHire = new Set<string>();
      (offHireRes.data || []).forEach((log: any) => {
        const key = globalKey(log.job_id, log.supplier_id, log.equipment_master_id);
        if (seen.has(key)) return;
        seen.add(key);
        if (log.action === 'OFF_HIRE') offHire.add(key);
      });
      setOffHireKeysGlobal(offHire);
    } catch (err) {
      console.error('Failed to fetch rental due data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkOffHire = async (row: RentalDueRow) => {
    setActionLoadingId(row.id);
    try {
      const { error } = await logOffHireAction(row.jobId, row.supplierId, row.equipmentMasterId, 'OFF_HIRE');
      if (error) throw error;
      setOffHireKeysGlobal((prev) => new Set(prev).add(globalKey(row.jobId, row.supplierId, row.equipmentMasterId)));
    } catch (err: any) {
      console.error('Failed to mark off-hire', err);
      Alert.alert('Error', err?.message || 'Failed to mark off-hire.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRemove = (row: RentalDueRow) => {
    Alert.alert(
      'Remove from Allocation',
      `Remove "${row.equipmentName}" from job ${row.jobNumber}'s equipment allocation? This only removes it here -- to add it back later, use Site Allocations.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setActionLoadingId(row.id);
            try {
              let delQuery = supabase.from('job_equipment').delete().eq('job_id', row.jobId).eq('equipment_master_id', row.equipmentMasterId);
              delQuery = row.supplierId ? delQuery.eq('supplier_id', row.supplierId) : delQuery.is('supplier_id', null);
              const { error } = await delQuery;
              if (error) throw error;

              await Promise.all([
                logOffHireAction(row.jobId, row.supplierId, row.equipmentMasterId, 'REMOVED'),
                clearRentalInfo(row.jobId, row.supplierId, row.equipmentMasterId),
              ]);
              setRows((prev) => prev.filter((r) => r.id !== row.id));
            } catch (err: any) {
              console.error('Failed to remove allocation', err);
              Alert.alert('Error', err?.message || 'Failed to remove from allocation.');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  // Job options are every job that has at least one rental record -- there's
  // nothing useful to pick from a job with none. Supplier options narrow to
  // whichever job is currently selected (all jobs' suppliers if none is).
  const jobOptions = (() => {
    const map = new Map<string, { id: string; label: string }>();
    rows.forEach((r) => {
      if (!map.has(r.jobId)) map.set(r.jobId, { id: r.jobId, label: `${r.jobNumber} - ${r.jobName}` });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  })();
  const supplierOptions = (() => {
    const relevant = selectedJobId ? rows.filter((r) => r.jobId === selectedJobId) : rows;
    const map = new Map<string, { id: string; label: string }>();
    relevant.forEach((r) => {
      const key = r.supplierId || 'GENERAL';
      if (!map.has(key)) map.set(key, { id: key, label: r.supplierName || 'General (No Supplier)' });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  })();
  const selectedJobLabel = selectedJobId ? jobOptions.find((j) => j.id === selectedJobId)?.label : null;
  const selectedSupplierLabel = selectedSupplierId ? supplierOptions.find((s) => s.id === selectedSupplierId)?.label : null;

  const scopedRows = rows.filter(
    (r) =>
      (!selectedJobId || r.jobId === selectedJobId) &&
      (!selectedSupplierId || (r.supplierId || 'GENERAL') === selectedSupplierId)
  );

  const now = Date.now();
  const withStatus = scopedRows.map((r) => {
    // No due date set means there's nothing to be overdue or due soon against --
    // it only ever shows up under "All", with just its basis/period, not a countdown.
    const dueMs = r.rentalDueAt ? new Date(r.rentalDueAt).getTime() : null;
    const overdue = dueMs !== null && dueMs < now;
    const dueSoon = dueMs !== null && !overdue && dueMs - now <= DUE_SOON_MS;
    return { ...r, overdue, dueSoon, isOffHire: offHireKeysGlobal.has(globalKey(r.jobId, r.supplierId, r.equipmentMasterId)) };
  });

  const overdueCount = withStatus.filter((r) => r.overdue).length;
  const dueSoonCount = withStatus.filter((r) => r.dueSoon).length;

  const tabFiltered =
    activeTab === 'overdue' ? withStatus.filter((r) => r.overdue) : activeTab === 'due_soon' ? withStatus.filter((r) => r.dueSoon) : withStatus;

  // Basis counts reflect whichever urgency tab (Overdue/Due Soon/All) is
  // currently active, so e.g. "Daily" under "Overdue" means overdue AND daily.
  const basisCounts: Record<string, number> = { ALL: tabFiltered.length };
  RENTAL_BASIS_OPTIONS.forEach((opt) => {
    basisCounts[opt.value] = tabFiltered.filter((r) => r.rentalBasis === opt.value).length;
  });
  const basisFiltered = activeBasisTab === 'ALL' ? tabFiltered : tabFiltered.filter((r) => r.rentalBasis === activeBasisTab);

  const q = searchQuery.trim().toLowerCase();
  const filteredRows = q
    ? basisFiltered.filter(
        (r) =>
          r.equipmentName.toLowerCase().includes(q) ||
          (r.supplierName || '').toLowerCase().includes(q) ||
          r.jobNumber.toLowerCase().includes(q) ||
          r.jobName.toLowerCase().includes(q)
      )
    : basisFiltered;

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
          <View className="mb-6">
            <Text className="text-3xl font-black text-slate-900 tracking-tight mb-2">Rental Due</Text>
            <Text className="text-slate-500 font-medium">
              Every piece of equipment with rental info, across every job -- purely informational, it doesn't change
              anything in the Foreman app. So overdue equipment doesn't go unnoticed, act on it here if you want to.
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

          <View className="flex-row flex-wrap mb-4" style={{ gap: 12 }}>
            <TouchableOpacity
              onPress={() => setJobPickerVisible(true)}
              className="flex-row items-center bg-white border border-slate-200 rounded-xl px-4 h-12 flex-1"
              style={{ minWidth: 240 }}
            >
              <MapPin size={16} color="#64748b" />
              <Text className={`ml-2.5 flex-1 ${selectedJobLabel ? 'text-slate-900 font-bold' : 'text-slate-400 font-medium'}`} numberOfLines={1}>
                {selectedJobLabel || 'All Jobs'}
              </Text>
              <ChevronDown size={16} color="#94a3b8" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSupplierPickerVisible(true)}
              className="flex-row items-center bg-white border border-slate-200 rounded-xl px-4 h-12 flex-1"
              style={{ minWidth: 240 }}
            >
              <Users size={16} color="#64748b" />
              <Text className={`ml-2.5 flex-1 ${selectedSupplierLabel ? 'text-slate-900 font-bold' : 'text-slate-400 font-medium'}`} numberOfLines={1}>
                {selectedSupplierLabel || 'All Suppliers'}
              </Text>
              <ChevronDown size={16} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0, marginBottom: 16 }}>
            <TouchableOpacity
              onPress={() => setActiveTab('overdue')}
              className={`px-4 py-2 rounded-full border flex-row items-center ${activeTab === 'overdue' ? 'bg-red-600 border-red-600' : 'bg-white border-slate-200'}`}
            >
              <View className={`w-2 h-2 rounded-full mr-2 ${activeTab === 'overdue' ? 'bg-white' : 'bg-red-500'}`} />
              <Text className={`font-bold text-sm ${activeTab === 'overdue' ? 'text-white' : 'text-slate-600'}`}>Overdue</Text>
              <View className={`ml-2 px-2 py-0.5 rounded-full ${activeTab === 'overdue' ? 'bg-white/20' : 'bg-red-50'}`}>
                <Text className={`text-xs font-bold ${activeTab === 'overdue' ? 'text-white' : 'text-red-700'}`}>{overdueCount}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab('due_soon')}
              className={`px-4 py-2 rounded-full border flex-row items-center ${activeTab === 'due_soon' ? 'bg-amber-600 border-amber-600' : 'bg-white border-slate-200'}`}
            >
              <View className={`w-2 h-2 rounded-full mr-2 ${activeTab === 'due_soon' ? 'bg-white' : 'bg-amber-500'}`} />
              <Text className={`font-bold text-sm ${activeTab === 'due_soon' ? 'text-white' : 'text-slate-600'}`}>Due Soon (48h)</Text>
              <View className={`ml-2 px-2 py-0.5 rounded-full ${activeTab === 'due_soon' ? 'bg-white/20' : 'bg-amber-50'}`}>
                <Text className={`text-xs font-bold ${activeTab === 'due_soon' ? 'text-white' : 'text-amber-700'}`}>{dueSoonCount}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab('all')}
              className={`px-4 py-2 rounded-full border flex-row items-center ${activeTab === 'all' ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'}`}
            >
              <Text className={`font-bold text-sm ${activeTab === 'all' ? 'text-white' : 'text-slate-600'}`}>All</Text>
              <View className={`ml-2 px-2 py-0.5 rounded-full ${activeTab === 'all' ? 'bg-white/20' : 'bg-slate-100'}`}>
                <Text className={`text-xs font-bold ${activeTab === 'all' ? 'text-white' : 'text-slate-500'}`}>{scopedRows.length}</Text>
              </View>
            </TouchableOpacity>
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0, marginBottom: 16 }}>
            <TouchableOpacity
              onPress={() => setActiveBasisTab('ALL')}
              className={`px-4 py-2 rounded-full border flex-row items-center ${activeBasisTab === 'ALL' ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-200'}`}
            >
              <Text className={`font-bold text-sm ${activeBasisTab === 'ALL' ? 'text-white' : 'text-slate-600'}`}>All Basis</Text>
              <View className={`ml-2 px-2 py-0.5 rounded-full ${activeBasisTab === 'ALL' ? 'bg-white/20' : 'bg-slate-100'}`}>
                <Text className={`text-xs font-bold ${activeBasisTab === 'ALL' ? 'text-white' : 'text-slate-500'}`}>{basisCounts.ALL}</Text>
              </View>
            </TouchableOpacity>
            {RENTAL_BASIS_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setActiveBasisTab(opt.value)}
                className={`px-4 py-2 rounded-full border flex-row items-center ${activeBasisTab === opt.value ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-200'}`}
              >
                <Text className={`font-bold text-sm ${activeBasisTab === opt.value ? 'text-white' : 'text-slate-600'}`}>{opt.label}</Text>
                <View className={`ml-2 px-2 py-0.5 rounded-full ${activeBasisTab === opt.value ? 'bg-white/20' : 'bg-slate-100'}`}>
                  <Text className={`text-xs font-bold ${activeBasisTab === opt.value ? 'text-white' : 'text-slate-500'}`}>{basisCounts[opt.value]}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View className="flex-row items-center bg-white border border-slate-200 rounded-xl px-4 h-12 mb-6">
            <Search size={18} color="#94a3b8" />
            <TextInput
              placeholder="Search equipment, supplier, or job number"
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

          {filteredRows.length === 0 && (
            <View className="bg-white rounded-3xl p-10 border border-slate-200 shadow-sm items-center justify-center mb-12">
              <View className="bg-slate-50 p-6 rounded-full mb-4">
                <AlarmClock size={48} color="#cbd5e1" />
              </View>
              <Text className="text-xl font-bold text-slate-700 mb-2">
                {activeTab === 'overdue' ? 'Nothing overdue' : activeTab === 'due_soon' ? 'Nothing due soon' : 'Nothing here'}
              </Text>
              <Text className="text-slate-500 text-center max-w-xs">
                {searchQuery.trim()
                  ? `No matches for "${searchQuery}".`
                  : activeBasisTab !== 'ALL'
                  ? `Nothing in this view is a ${RENTAL_BASIS_OPTIONS.find((o) => o.value === activeBasisTab)?.label} rental.`
                  : activeTab === 'all'
                  ? 'Set rental info when adding equipment in Site Allocations, or from an equipment row in Allocation Report.'
                  : 'All clear for now.'}
              </Text>
            </View>
          )}

          {filteredRows.map((row) => {
            const dueInfo = formatDueLabel(row.rentalDueAt);
            const periodLabel = formatRentalPeriod({
              rental_basis: row.rentalBasis,
              rental_start_at: row.rentalStartAt,
              rental_due_at: row.rentalDueAt,
            } as RentalInfoRow);
            const isLoading = actionLoadingId === row.id;
            return (
              <View key={row.id} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm mb-3">
                <View className="flex-row items-start justify-between mb-2">
                  <View className="flex-1 pr-3">
                    <Text className="text-base font-black text-slate-900">{row.equipmentName}</Text>
                    <Text className="text-slate-500 text-xs font-medium mt-0.5">
                      {row.jobNumber} - {row.jobName}
                    </Text>
                  </View>
                  {dueInfo && (
                    <View className={`px-2.5 py-1 rounded-full border ${dueInfo.overdue ? 'bg-red-100 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                      <Text className={`font-bold text-[10px] uppercase tracking-wider ${dueInfo.overdue ? 'text-red-700' : 'text-blue-700'}`}>
                        {dueInfo.label}
                      </Text>
                    </View>
                  )}
                </View>

                <View className="flex-row items-center flex-wrap mb-3">
                  <View className="flex-row items-center bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100 mr-2 mb-1">
                    <Users size={11} color="#64748b" />
                    <Text className="text-slate-600 font-semibold text-xs ml-1.5">{row.supplierName || 'General (No Supplier)'}</Text>
                  </View>
                  <View className="bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100 mb-1">
                    <Text className="text-slate-600 font-semibold text-xs">{periodLabel}</Text>
                  </View>
                  {row.isOffHire && (
                    <View className="flex-row items-center bg-amber-100 px-2.5 py-1 rounded-full border border-amber-200 ml-2 mb-1">
                      <PowerOff size={10} color="#b45309" />
                      <Text className="text-amber-700 font-bold text-[10px] ml-1 uppercase tracking-wider">Off-Hire</Text>
                    </View>
                  )}
                </View>

                <View className="flex-row" style={{ gap: 8 }}>
                  {!row.isOffHire && (
                    <TouchableOpacity
                      onPress={() => setOffHireConfirmRow(row)}
                      disabled={isLoading}
                      className={`flex-1 flex-row items-center justify-center py-2.5 rounded-xl border border-amber-200 bg-amber-50 active:bg-amber-100 ${isLoading ? 'opacity-60' : ''}`}
                    >
                      <PowerOff size={14} color="#b45309" />
                      <Text className="text-amber-700 font-bold text-xs ml-1.5">Mark Off-Hire</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => handleRemove(row)}
                    disabled={isLoading}
                    className={`flex-1 flex-row items-center justify-center py-2.5 rounded-xl border border-red-200 bg-red-50 active:bg-red-100 ${isLoading ? 'opacity-60' : ''}`}
                  >
                    {isLoading ? <ActivityIndicator size="small" color="#dc2626" /> : (
                      <>
                        <Trash2 size={14} color="#dc2626" />
                        <Text className="text-red-600 font-bold text-xs ml-1.5">Remove</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>

      <SearchablePicker
        visible={jobPickerVisible}
        onClose={() => setJobPickerVisible(false)}
        title="Job"
        options={jobOptions}
        selectedId={selectedJobId}
        onSelect={setSelectedJobId}
        allLabel="All Jobs"
      />
      <SearchablePicker
        visible={supplierPickerVisible}
        onClose={() => setSupplierPickerVisible(false)}
        title="Supplier"
        options={supplierOptions}
        selectedId={selectedSupplierId}
        onSelect={setSelectedSupplierId}
        allLabel="All Suppliers"
      />

      <Modal visible={!!offHireConfirmRow} transparent animationType="fade" onRequestClose={() => setOffHireConfirmRow(null)}>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
            <View className="flex-row items-start justify-between mb-1">
              <Text className="text-lg font-black text-slate-900 flex-1 pr-3">Mark Off-Hire?</Text>
              <TouchableOpacity onPress={() => setOffHireConfirmRow(null)} className="p-1 -mr-1 -mt-1">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text className="text-slate-500 font-medium text-sm mb-4">
              {offHireConfirmRow?.equipmentName} on {offHireConfirmRow?.jobNumber}
            </Text>
            <View className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
              <Text className="text-amber-900 font-medium text-sm leading-5">
                This will hide it from the Foreman app's entry forms for this job right away. It'll keep showing here
                with an Off-Hire badge and a Remove option, but it is <Text className="font-black">not</Text> removed
                from Site Allocations -- do that separately once it's actually been collected.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                const row = offHireConfirmRow;
                setOffHireConfirmRow(null);
                if (row) handleMarkOffHire(row);
              }}
              className="w-full py-3.5 rounded-2xl items-center bg-amber-600 active:bg-amber-700"
            >
              <Text className="text-white font-bold text-sm">Yes, Mark Off-Hire</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </FadeInUp>
  );
}
