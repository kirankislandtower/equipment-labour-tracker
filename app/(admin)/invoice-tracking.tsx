import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, useWindowDimensions, Modal, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { getLocalDateString, getFirstOfMonthString } from '../../lib/dateUtils';
import DateTimePicker from '@react-native-community/datetimepicker';
import { FileText, Search, X, Check, ChevronDown, CheckCircle2, RotateCcw } from 'lucide-react-native';

type Tab = 'PENDING' | 'VERIFIED';

// Same searchable picker pattern used on Invoice Reconciler / Usage Reports.
const SupplierPicker = ({ value, options, onSelect }: any) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const filtered = searchQuery.trim()
    ? options.filter((o: any) => o.label.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : options;

  return (
    <View className="mb-4">
      <Text className="text-sm font-bold text-slate-700 mb-1.5">Supplier</Text>
      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 flex-row items-center justify-between active:opacity-70"
      >
        <Text className={value ? 'text-slate-900 font-medium' : 'text-slate-400'}>
          {value ? options.find((o: any) => o.value === value)?.label : 'All suppliers'}
        </Text>
        <ChevronDown size={18} color="#64748b" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide" onShow={() => setSearchQuery('')} onRequestClose={() => setModalVisible(false)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl h-[70%] shadow-2xl">
            <View className="flex-row items-center justify-between p-5 border-b border-slate-100">
              <Text className="text-slate-900 text-lg font-black">Select Supplier</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} className="p-2 bg-slate-100 rounded-full active:opacity-60">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl mx-5 mt-4 mb-2 px-4 h-12">
              <Search size={18} color="#94a3b8" />
              <TextInput
                placeholder="Search supplier..."
                placeholderTextColor="#94a3b8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                className="flex-1 ml-3 text-slate-900"
                style={{ outlineStyle: 'none' } as any}
              />
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              <TouchableOpacity
                onPress={() => { onSelect(''); setModalVisible(false); }}
                className="flex-row items-center justify-between p-4 border-b border-slate-50 active:bg-slate-50"
              >
                <Text className={`text-base ${!value ? 'text-indigo-700 font-bold' : 'text-slate-700 font-medium'}`}>All suppliers</Text>
                {!value && <Check size={18} color="#4338ca" />}
              </TouchableOpacity>
              {filtered.map((item: any) => (
                <TouchableOpacity
                  key={item.value}
                  onPress={() => { onSelect(item.value); setModalVisible(false); }}
                  className="flex-row items-center justify-between p-4 border-b border-slate-50 active:bg-slate-50"
                >
                  <Text className={`text-base ${value === item.value ? 'text-indigo-700 font-bold' : 'text-slate-700 font-medium'}`}>{item.label}</Text>
                  {value === item.value && <Check size={18} color="#4338ca" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default function InvoiceTracking() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [tab, setTab] = useState<Tab>('PENDING');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [entries, setEntries] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<{ label: string; value: string }[]>([]);

  const [supplierId, setSupplierId] = useState('');
  const [fromDate, setFromDate] = useState(getFirstOfMonthString());
  const [toDate, setToDate] = useState(getLocalDateString());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedEntry, setSelectedEntry] = useState<any>(null);

  const fetchData = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      let query = supabase
        .from('equipment_entries')
        .select('id, entry_date, vehicle_number, working_hours, number_of_trips, rental_type, foreman_name, supplier_timesheet_number, invoice_status, invoice_number, jobs:job_id(job_number, job_name), suppliers:supplier_id(supplier_name), equipment_master:equipment_master_id(equipment_name)')
        .eq('status', 'APPROVED')
        .gte('entry_date', fromDate)
        .lte('entry_date', toDate)
        .order('entry_date', { ascending: false });
      if (supplierId) query = query.eq('supplier_id', supplierId);

      const [entriesRes, suppliersRes] = await Promise.all([
        query,
        supabase.from('suppliers').select('id, supplier_name').order('supplier_name'),
      ]);
      if (entriesRes.error) throw entriesRes.error;
      if (suppliersRes.error) throw suppliersRes.error;

      setEntries(entriesRes.data || []);
      setSuppliers((suppliersRes.data || []).map((s: any) => ({ label: s.supplier_name, value: s.id })));
    } catch (err) {
      console.error('Error loading invoice tracking entries:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, fromDate, toDate]);

  const q = searchQuery.trim().toLowerCase();
  const matchesSearch = (e: any) =>
    !q ||
    (e.equipment_master?.equipment_name || '').toLowerCase().includes(q) ||
    (e.vehicle_number || '').toLowerCase().includes(q) ||
    (e.jobs?.job_number || '').toLowerCase().includes(q) ||
    (e.supplier_timesheet_number || '').toLowerCase().includes(q);

  const pending = entries.filter(e => e.invoice_status !== 'VERIFIED' && matchesSearch(e));
  const verified = entries.filter(e => e.invoice_status === 'VERIFIED' && matchesSearch(e));
  const listForTab = tab === 'PENDING' ? pending : verified;

  const handleSaved = (updated: any) => {
    setEntries(prev => prev.map(e => (e.id === updated.id ? { ...e, ...updated } : e)));
    setSelectedEntry(null);
  };

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: isMobile ? 16 : 32, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View className="mb-6">
          <Text className="text-3xl font-black text-slate-900 tracking-tight mb-1">Invoice Tracking</Text>
          <Text className="text-slate-500 font-medium">Verify approved Equipment entries against the supplier's invoice.</Text>
        </View>

        <View className="flex-row bg-slate-200/70 rounded-2xl p-1 self-start mb-5">
          <TouchableOpacity
            onPress={() => setTab('PENDING')}
            className={`flex-row items-center px-4 py-2.5 rounded-xl ${tab === 'PENDING' ? 'bg-white shadow-sm' : ''}`}
          >
            <Text className={`font-bold text-sm ${tab === 'PENDING' ? 'text-slate-900' : 'text-slate-500'}`}>Pending ({pending.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab('VERIFIED')}
            className={`flex-row items-center px-4 py-2.5 rounded-xl ${tab === 'VERIFIED' ? 'bg-white shadow-sm' : ''}`}
          >
            <Text className={`font-bold text-sm ${tab === 'VERIFIED' ? 'text-slate-900' : 'text-slate-500'}`}>Verified ({verified.length})</Text>
          </TouchableOpacity>
        </View>

        <View className={isMobile ? 'flex-col mb-4' : 'flex-row items-start'} style={{ gap: 12 }}>
          <View style={{ flex: isMobile ? undefined : 1 }}>
            <SupplierPicker value={supplierId} options={suppliers} onSelect={setSupplierId} />
          </View>
          <View className={isMobile ? 'flex-row mb-4' : 'flex-row'} style={{ gap: 12, flex: isMobile ? undefined : 1 }}>
            <TouchableOpacity onPress={() => setShowFromPicker(true)} disabled={Platform.OS === 'web'} className="flex-1 bg-white border border-slate-200 rounded-xl p-3.5">
              <Text className="text-slate-400 text-[10px] font-bold uppercase mb-1">From</Text>
              {Platform.OS === 'web' ? (
                <input type="date" value={fromDate} onChange={(e: any) => setFromDate(e.target.value)} style={{ border: 'none', outline: 'none', width: '100%', fontWeight: '700', backgroundColor: 'transparent', color: '#0f172a', fontSize: '15px', padding: 0 }} />
              ) : (
                <Text className="text-slate-900 font-bold">{fromDate}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowToPicker(true)} disabled={Platform.OS === 'web'} className="flex-1 bg-white border border-slate-200 rounded-xl p-3.5">
              <Text className="text-slate-400 text-[10px] font-bold uppercase mb-1">To</Text>
              {Platform.OS === 'web' ? (
                <input type="date" value={toDate} onChange={(e: any) => setToDate(e.target.value)} style={{ border: 'none', outline: 'none', width: '100%', fontWeight: '700', backgroundColor: 'transparent', color: '#0f172a', fontSize: '15px', padding: 0 }} />
              ) : (
                <Text className="text-slate-900 font-bold">{toDate}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {Platform.OS !== 'web' && showFromPicker && (
          <DateTimePicker value={new Date(fromDate)} mode="date" display="default" onChange={(e, d) => { setShowFromPicker(false); if (d) setFromDate(getLocalDateString(d)); }} />
        )}
        {Platform.OS !== 'web' && showToPicker && (
          <DateTimePicker value={new Date(toDate)} mode="date" display="default" onChange={(e, d) => { setShowToPicker(false); if (d) setToDate(getLocalDateString(d)); }} />
        )}

        <View className="flex-row items-center bg-white border border-slate-200 rounded-xl px-4 h-12 mb-6 mt-4">
          <Search size={18} color="#94a3b8" />
          <TextInput
            placeholder="Search by equipment, vehicle, job number, or timesheet number"
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            className="flex-1 ml-3 text-slate-900"
            style={{ outlineStyle: 'none' } as any}
          />
          {!!searchQuery && (
            <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1">
              <X size={16} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View className="py-20 items-center">
            <ActivityIndicator size="large" color="#1e3a8a" />
          </View>
        ) : loadError ? (
          <View className="py-10 px-6 items-center bg-amber-50 rounded-3xl border border-amber-200">
            <Text className="text-amber-900 text-lg font-black text-center">Couldn't load entries</Text>
            <Text className="text-amber-700 mt-1 text-center">Run add_invoice_tracking_to_equipment.sql in Supabase first, then refresh.</Text>
          </View>
        ) : listForTab.length === 0 ? (
          <View className="py-20 items-center bg-white rounded-3xl border border-slate-100">
            <View className="bg-slate-50 p-4 rounded-full mb-4">
              <FileText size={32} color="#94a3b8" />
            </View>
            <Text className="text-slate-900 text-lg font-black">
              {tab === 'PENDING' ? 'Nothing pending' : 'Nothing verified yet'}
            </Text>
            <Text className="text-slate-500 mt-1 text-center">
              {tab === 'PENDING' ? 'No approved entries waiting on invoice verification for this filter.' : 'Verify an entry from the Pending tab to see it here.'}
            </Text>
          </View>
        ) : (
          listForTab.map(e => {
            const qty = e.rental_type === 'TRIP_BASIS' ? `${e.number_of_trips} trips` : `${e.working_hours} hrs`;
            return (
              <TouchableOpacity
                key={e.id}
                onPress={() => setSelectedEntry(e)}
                className="bg-white p-4 rounded-2xl border border-slate-200 mb-3"
              >
                <View className="flex-row justify-between items-start mb-1.5">
                  <Text className="text-slate-900 font-black text-base flex-1 pr-2">{e.equipment_master?.equipment_name || e.vehicle_number}</Text>
                  {tab === 'VERIFIED' ? (
                    <View className="bg-green-100 px-2.5 py-1 rounded-full flex-row items-center">
                      <CheckCircle2 size={12} color="#16a34a" />
                      <Text className="text-green-700 text-[10px] font-bold uppercase ml-1">Verified</Text>
                    </View>
                  ) : (
                    <View className="bg-amber-100 px-2.5 py-1 rounded-full">
                      <Text className="text-amber-700 text-[10px] font-bold uppercase">Pending</Text>
                    </View>
                  )}
                </View>
                <Text className="text-slate-500 text-sm">{e.suppliers?.supplier_name || 'Unknown Supplier'} · {e.vehicle_number}</Text>
                <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-slate-100">
                  <Text className="text-slate-600 text-xs font-bold">Job {e.jobs?.job_number || '—'} · {e.entry_date} · {qty}</Text>
                  {!!e.supplier_timesheet_number && <Text className="text-slate-400 text-xs">TS# {e.supplier_timesheet_number}</Text>}
                </View>
                {tab === 'VERIFIED' && !!e.invoice_number && (
                  <Text className="text-indigo-700 font-bold text-sm mt-2">Invoice: {e.invoice_number}</Text>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <EntryDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} onSaved={handleSaved} />
    </View>
  );
}

function EntryDetailModal({ entry, onClose, onSaved }: { entry: any; onClose: () => void; onSaved: (u: any) => void }) {
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isVerified = entry?.invoice_status === 'VERIFIED';

  useEffect(() => {
    setInvoiceNumber(entry?.invoice_number || '');
    setError('');
  }, [entry]);

  if (!entry) return null;
  const qty = entry.rental_type === 'TRIP_BASIS' ? `${entry.number_of_trips} trips` : `${entry.working_hours} hrs`;

  const handleVerify = async () => {
    if (!invoiceNumber.trim()) { setError('Enter the invoice number.'); return; }
    setSaving(true);
    setError('');
    try {
      const { error: updErr } = await supabase
        .from('equipment_entries')
        .update({ invoice_status: 'VERIFIED', invoice_number: invoiceNumber.trim() })
        .eq('id', entry.id);
      if (updErr) throw updErr;
      onSaved({ id: entry.id, invoice_status: 'VERIFIED', invoice_number: invoiceNumber.trim() });
    } catch (err: any) {
      setError(err.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleUnverify = async () => {
    setSaving(true);
    setError('');
    try {
      const { error: updErr } = await supabase
        .from('equipment_entries')
        .update({ invoice_status: 'PENDING' })
        .eq('id', entry.id);
      if (updErr) throw updErr;
      onSaved({ id: entry.id, invoice_status: 'PENDING' });
    } catch (err: any) {
      setError(err.message || 'Failed to update.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!entry} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-center items-center p-6">
        <View className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl">
          <View className="flex-row justify-between items-start mb-4">
            <Text className="text-xl font-black text-slate-900 flex-1 pr-2">{entry.equipment_master?.equipment_name || entry.vehicle_number}</Text>
            <TouchableOpacity onPress={onClose} className="bg-slate-100 p-2 rounded-full active:bg-slate-200">
              <X size={18} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View className="bg-slate-50 rounded-2xl p-4 mb-5" style={{ gap: 6 }}>
            <Text className="text-slate-700 font-bold">{entry.suppliers?.supplier_name}</Text>
            <Text className="text-slate-500 text-sm">Vehicle: {entry.vehicle_number}</Text>
            <Text className="text-slate-500 text-sm">Job: {entry.jobs?.job_number} · {entry.jobs?.job_name}</Text>
            <Text className="text-slate-500 text-sm">Date: {entry.entry_date} · {qty}</Text>
            <Text className="text-slate-500 text-sm">Foreman: {entry.foreman_name}</Text>
            <Text className="text-slate-500 text-sm">Supplier Timesheet #: {entry.supplier_timesheet_number || 'Not provided'}</Text>
          </View>

          {isVerified ? (
            <>
              <Text className="text-sm font-bold text-slate-700 mb-1.5">Invoice Number</Text>
              <TextInput
                value={invoiceNumber}
                onChangeText={setInvoiceNumber}
                placeholder="e.g. T00681"
                placeholderTextColor="#94a3b8"
                className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-slate-900 mb-4"
                style={{ outlineStyle: 'none' } as any}
              />
              {!!error && <Text className="text-red-600 text-sm mb-3">{error}</Text>}
              <TouchableOpacity
                onPress={handleVerify}
                disabled={saving}
                className={`py-3.5 rounded-xl items-center flex-row justify-center mb-3 ${saving ? 'bg-slate-400' : 'bg-[#1e3a8a]'}`}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">Update Invoice Number</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleUnverify}
                disabled={saving}
                className="py-3.5 rounded-xl items-center flex-row justify-center border border-slate-200 active:bg-slate-50"
              >
                <RotateCcw size={16} color="#64748b" />
                <Text className="text-slate-600 font-bold ml-2">Mark as Pending</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text className="text-sm font-bold text-slate-700 mb-1.5">Invoice Number</Text>
              <TextInput
                value={invoiceNumber}
                onChangeText={setInvoiceNumber}
                placeholder="e.g. T00681"
                placeholderTextColor="#94a3b8"
                autoFocus
                className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-slate-900 mb-4"
                style={{ outlineStyle: 'none' } as any}
              />
              {!!error && <Text className="text-red-600 text-sm mb-3">{error}</Text>}
              <TouchableOpacity
                onPress={handleVerify}
                disabled={saving}
                className={`py-3.5 rounded-xl items-center flex-row justify-center ${saving ? 'bg-slate-400' : 'bg-green-600'}`}
              >
                {saving ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <CheckCircle2 size={18} color="#fff" />
                    <Text className="text-white font-bold ml-2">Mark Verified</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
