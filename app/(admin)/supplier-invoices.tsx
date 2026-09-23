import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, useWindowDimensions, Modal, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { getLocalDateString, getFirstOfMonthString } from '../../lib/dateUtils';
import DateTimePicker from '@react-native-community/datetimepicker';
import { FileText, Search, X, Plus, Check, ChevronDown, Truck } from 'lucide-react-native';

const STATUSES = [
  { value: 'TIMESHEET_RECEIVED', label: 'Timesheet Received', bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400' },
  { value: 'ATTACHED_TO_INVOICE', label: 'Attached to Invoice', bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  { value: 'CROSS_CHECKED', label: 'Cross-Checked', bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  { value: 'PARTIALLY_RECEIVED', label: 'Invoice Partially Received', bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  { value: 'FULLY_RECEIVED', label: 'Invoice Fully Received', bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
] as const;

const statusMeta = (value: string) => STATUSES.find(s => s.value === value) || STATUSES[0];

// Reused for both the Supplier field and the entry-selection date range.
const FieldPicker = ({ label, value, options, onSelect, placeholder }: any) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const filtered = searchQuery.trim()
    ? options.filter((o: any) => o.label.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : options;

  return (
    <View className="mb-4">
      <Text className="text-sm font-bold text-slate-700 mb-1.5">{label}</Text>
      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 flex-row items-center justify-between active:opacity-70"
      >
        <Text className={value ? 'text-slate-900 font-medium' : 'text-slate-400'}>
          {value ? options.find((o: any) => o.value === value)?.label || placeholder : placeholder}
        </Text>
        <ChevronDown size={18} color="#64748b" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide" onShow={() => setSearchQuery('')} onRequestClose={() => setModalVisible(false)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl h-[70%] shadow-2xl">
            <View className="flex-row items-center justify-between p-5 border-b border-slate-100">
              <Text className="text-slate-900 text-lg font-black">Select {label}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} className="p-2 bg-slate-100 rounded-full active:opacity-60">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl mx-5 mt-4 mb-2 px-4 h-12">
              <Search size={18} color="#94a3b8" />
              <TextInput
                placeholder={`Search ${label.toLowerCase()}...`}
                placeholderTextColor="#94a3b8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                className="flex-1 ml-3 text-slate-900"
                style={{ outlineStyle: 'none' } as any}
              />
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
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

export default function SupplierInvoices() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<{ label: string; value: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const fetchInvoices = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [invRes, supRes] = await Promise.all([
        supabase.from('supplier_invoices').select('*, suppliers:supplier_id(supplier_name), supplier_invoice_entries(count)').order('created_at', { ascending: false }),
        supabase.from('suppliers').select('id, supplier_name').order('supplier_name'),
      ]);
      if (invRes.error) throw invRes.error;
      if (supRes.error) throw supRes.error;
      setInvoices(invRes.data || []);
      setSuppliers((supRes.data || []).map((s: any) => ({ label: s.supplier_name, value: s.id })));
    } catch (err) {
      console.error('Error loading supplier invoices:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const q = searchQuery.trim().toLowerCase();
  const filtered = invoices.filter(inv => {
    if (statusFilter !== 'ALL' && inv.status !== statusFilter) return false;
    if (!q) return true;
    return (inv.suppliers?.supplier_name || '').toLowerCase().includes(q) || (inv.invoice_numbers || '').toLowerCase().includes(q) || (inv.timesheet_number || '').toLowerCase().includes(q);
  });

  const [formVisible, setFormVisible] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any>(null);

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: isMobile ? 16 : 32, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View className="mb-6 flex-row justify-between items-start">
          <View className="flex-1 pr-3">
            <Text className="text-3xl font-black text-slate-900 tracking-tight mb-1">Supplier Invoices</Text>
            <Text className="text-slate-500 font-medium">Invoice number, timesheet, and paperwork status per supplier -- replaces the monthly Excel log.</Text>
          </View>
          <TouchableOpacity
            onPress={() => { setEditingInvoice(null); setFormVisible(true); }}
            className="bg-[#1e3a8a] px-4 py-3 rounded-xl flex-row items-center active:opacity-80"
          >
            <Plus size={18} color="#fff" />
            <Text className="text-white font-bold ml-1.5">New Invoice</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row items-center bg-white border border-slate-200 rounded-xl px-4 h-12 mb-4">
          <Search size={18} color="#94a3b8" />
          <TextInput
            placeholder="Search by supplier, invoice #, or timesheet #"
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

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16 }} style={{ flexGrow: 0, marginBottom: 20 }}>
          <TouchableOpacity
            onPress={() => setStatusFilter('ALL')}
            className={`px-4 py-2 rounded-full border ${statusFilter === 'ALL' ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'}`}
          >
            <Text className={`text-xs font-bold ${statusFilter === 'ALL' ? 'text-white' : 'text-slate-600'}`}>All ({invoices.length})</Text>
          </TouchableOpacity>
          {STATUSES.map(s => (
            <TouchableOpacity
              key={s.value}
              onPress={() => setStatusFilter(s.value)}
              className={`px-4 py-2 rounded-full border flex-row items-center ${statusFilter === s.value ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'}`}
            >
              <View className={`w-2 h-2 rounded-full mr-2 ${statusFilter === s.value ? 'bg-white' : s.dot}`} />
              <Text className={`text-xs font-bold ${statusFilter === s.value ? 'text-white' : 'text-slate-600'}`}>
                {s.label} ({invoices.filter(i => i.status === s.value).length})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? (
          <View className="py-20 items-center">
            <ActivityIndicator size="large" color="#1e3a8a" />
          </View>
        ) : loadError ? (
          <View className="py-10 px-6 items-center bg-amber-50 rounded-3xl border border-amber-200">
            <Text className="text-amber-900 text-lg font-black text-center">Couldn't load supplier invoices</Text>
            <Text className="text-amber-700 mt-1 text-center">Run add_supplier_invoices.sql in Supabase first, then refresh.</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View className="py-20 items-center bg-white rounded-3xl border border-slate-100">
            <View className="bg-slate-50 p-4 rounded-full mb-4">
              <FileText size={32} color="#94a3b8" />
            </View>
            <Text className="text-slate-900 text-lg font-black">{invoices.length === 0 ? 'No supplier invoices yet' : 'No match'}</Text>
            <Text className="text-slate-500 mt-1 text-center">{invoices.length === 0 ? 'Tap "New Invoice" to log your first one.' : `Nothing matches "${searchQuery}".`}</Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap justify-between">
            {filtered.map(inv => {
              const meta = statusMeta(inv.status);
              const entryCount = inv.supplier_invoice_entries?.[0]?.count ?? 0;
              return (
                <TouchableOpacity
                  key={inv.id}
                  onPress={() => { setEditingInvoice(inv); setFormVisible(true); }}
                  className="bg-white p-5 rounded-2xl border border-slate-200 mb-4"
                  style={{ width: isMobile ? '100%' : '48%' }}
                >
                  <View className="flex-row justify-between items-start mb-2">
                    <Text className="text-slate-900 font-black text-lg flex-1 pr-2">{inv.suppliers?.supplier_name || 'Unknown Supplier'}</Text>
                    <View className={`px-2.5 py-1 rounded-full ${meta.bg}`}>
                      <Text className={`text-[10px] font-bold uppercase ${meta.text}`}>{meta.label}</Text>
                    </View>
                  </View>
                  <Text className="text-slate-700 font-bold">Invoice: {inv.invoice_numbers}</Text>
                  {!!inv.timesheet_number && <Text className="text-slate-500 text-sm mt-0.5">Timesheet: {inv.timesheet_number}</Text>}
                  <View className="flex-row items-center mt-3 pt-3 border-t border-slate-100">
                    <Truck size={14} color="#94a3b8" />
                    <Text className="text-slate-500 text-xs font-bold ml-1.5">{entryCount} equipment {entryCount === 1 ? 'entry' : 'entries'} linked</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <InvoiceFormModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        invoice={editingInvoice}
        suppliers={suppliers}
        onSaved={() => { setFormVisible(false); fetchInvoices(); }}
        isMobile={isMobile}
      />
    </View>
  );
}

function InvoiceFormModal({ visible, onClose, invoice, suppliers, onSaved, isMobile }: any) {
  const isEdit = !!invoice;
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumbers, setInvoiceNumbers] = useState('');
  const [timesheetNumber, setTimesheetNumber] = useState('');
  const [status, setStatus] = useState<string>('TIMESHEET_RECEIVED');
  const [notes, setNotes] = useState('');
  const [fromDate, setFromDate] = useState(getFirstOfMonthString());
  const [toDate, setToDate] = useState(getLocalDateString());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const [availableEntries, setAvailableEntries] = useState<any[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    if (invoice) {
      setSupplierId(invoice.supplier_id);
      setInvoiceNumbers(invoice.invoice_numbers || '');
      setTimesheetNumber(invoice.timesheet_number || '');
      setStatus(invoice.status || 'TIMESHEET_RECEIVED');
      setNotes(invoice.notes || '');
      setFromDate(getFirstOfMonthString());
      setToDate(getLocalDateString());
    } else {
      setSupplierId('');
      setInvoiceNumbers('');
      setTimesheetNumber('');
      setStatus('TIMESHEET_RECEIVED');
      setNotes('');
      setFromDate(getFirstOfMonthString());
      setToDate(getLocalDateString());
      setSelectedEntryIds(new Set());
    }
    setError('');
  }, [visible, invoice]);

  // Loads this supplier's equipment entries for the chosen date range, then --
  // when editing -- makes sure entries already linked to this invoice show up and
  // stay checked even if they fall outside that range.
  useEffect(() => {
    if (!visible || !supplierId) { setAvailableEntries([]); return; }
    (async () => {
      setEntriesLoading(true);
      try {
        const { data: rangeEntries, error: rangeErr } = await supabase
          .from('equipment_entries')
          .select('id, entry_date, vehicle_number, working_hours, number_of_trips, rental_type, jobs:job_id(job_number), equipment_master:equipment_master_id(equipment_name)')
          .eq('supplier_id', supplierId)
          .gte('entry_date', fromDate)
          .lte('entry_date', toDate)
          .order('entry_date', { ascending: false });
        if (rangeErr) throw rangeErr;

        let combined = rangeEntries || [];
        const preselected = new Set<string>();

        if (isEdit) {
          const { data: linked, error: linkedErr } = await supabase
            .from('supplier_invoice_entries')
            .select('equipment_entry_id, equipment_entries(id, entry_date, vehicle_number, working_hours, number_of_trips, rental_type, jobs:job_id(job_number), equipment_master:equipment_master_id(equipment_name))')
            .eq('invoice_id', invoice.id);
          if (linkedErr) throw linkedErr;
          (linked || []).forEach((row: any) => {
            preselected.add(row.equipment_entry_id);
            if (row.equipment_entries && !combined.some((e: any) => e.id === row.equipment_entry_id)) {
              combined = [row.equipment_entries, ...combined];
            }
          });
          setSelectedEntryIds(preselected);
        }

        combined.sort((a: any, b: any) => (a.entry_date < b.entry_date ? 1 : -1));
        setAvailableEntries(combined);
      } catch (err) {
        console.error('Error loading equipment entries for invoice:', err);
      } finally {
        setEntriesLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, supplierId, fromDate, toDate]);

  const toggleEntry = (id: string) => {
    setSelectedEntryIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setError('');
    if (!supplierId) { setError('Select a supplier.'); return; }
    if (!invoiceNumbers.trim()) { setError('Enter at least one invoice number.'); return; }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        supplier_id: supplierId,
        invoice_numbers: invoiceNumbers.trim(),
        timesheet_number: timesheetNumber.trim() || null,
        status,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      let invoiceId = invoice?.id;
      if (isEdit) {
        const { error: updErr } = await supabase.from('supplier_invoices').update(payload).eq('id', invoiceId);
        if (updErr) throw updErr;
        const { error: delErr } = await supabase.from('supplier_invoice_entries').delete().eq('invoice_id', invoiceId);
        if (delErr) throw delErr;
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from('supplier_invoices')
          .insert({ ...payload, created_by: userData?.user?.id || null })
          .select('id')
          .single();
        if (insErr) throw insErr;
        invoiceId = inserted.id;
      }

      if (selectedEntryIds.size > 0) {
        const rows = Array.from(selectedEntryIds).map(entryId => ({ invoice_id: invoiceId, equipment_entry_id: entryId }));
        const { error: linkErr } = await supabase.from('supplier_invoice_entries').insert(rows);
        if (linkErr) throw linkErr;
      }

      onSaved();
    } catch (err: any) {
      console.error('Error saving supplier invoice:', err);
      setError(err.message || 'Failed to save invoice.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-slate-900/60 justify-end">
        <View className="bg-white rounded-t-[32px] p-6 h-[92%]">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-2xl font-black text-slate-900">{isEdit ? 'Edit Invoice' : 'New Supplier Invoice'}</Text>
            <TouchableOpacity onPress={onClose} className="bg-slate-100 p-2 rounded-full active:bg-slate-200">
              <X size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            <FieldPicker label="Supplier" value={supplierId} options={suppliers} onSelect={setSupplierId} placeholder="Select a supplier" />

            <Text className="text-sm font-bold text-slate-700 mb-1.5">Invoice Number(s)</Text>
            <TextInput
              value={invoiceNumbers}
              onChangeText={setInvoiceNumbers}
              placeholder="e.g. T00681 or 9892, 9877, 9890"
              placeholderTextColor="#94a3b8"
              className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-slate-900 mb-4"
              style={{ outlineStyle: 'none' } as any}
            />

            <Text className="text-sm font-bold text-slate-700 mb-1.5">Timesheet Number</Text>
            <TextInput
              value={timesheetNumber}
              onChangeText={setTimesheetNumber}
              placeholder="e.g. 9489"
              placeholderTextColor="#94a3b8"
              className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-slate-900 mb-4"
              style={{ outlineStyle: 'none' } as any}
            />

            <Text className="text-sm font-bold text-slate-700 mb-1.5">Status</Text>
            <View className="mb-5" style={{ gap: 8 }}>
              {STATUSES.map(s => (
                <TouchableOpacity
                  key={s.value}
                  onPress={() => setStatus(s.value)}
                  className={`flex-row items-center px-4 py-3 rounded-xl border ${status === s.value ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'}`}
                >
                  <View className={`w-2.5 h-2.5 rounded-full mr-3 ${s.dot}`} />
                  <Text className={`flex-1 font-medium ${status === s.value ? 'text-slate-900 font-bold' : 'text-slate-600'}`}>{s.label}</Text>
                  {status === s.value && <Check size={18} color="#0f172a" />}
                </TouchableOpacity>
              ))}
            </View>

            <Text className="text-sm font-bold text-slate-700 mb-1.5">Notes (optional)</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Any remarks about this invoice"
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={2}
              textAlignVertical="top"
              className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-900 mb-6"
              style={{ minHeight: 60, outlineStyle: 'none' } as any}
            />

            <View className="h-px bg-slate-100 mb-5" />

            <Text className="text-base font-black text-slate-900 mb-1">Which entries does this invoice cover?</Text>
            <Text className="text-slate-500 text-sm mb-4">Pick the supplier and a date range to see their Equipment entries, then tick the ones this invoice is for.</Text>

            <View className={isMobile ? 'flex-col mb-4' : 'flex-row mb-4'} style={{ gap: 12 }}>
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

            {Platform.OS !== 'web' && showFromPicker && (
              <DateTimePicker value={new Date(fromDate)} mode="date" display="default" onChange={(e, d) => { setShowFromPicker(false); if (d) setFromDate(getLocalDateString(d)); }} />
            )}
            {Platform.OS !== 'web' && showToPicker && (
              <DateTimePicker value={new Date(toDate)} mode="date" display="default" onChange={(e, d) => { setShowToPicker(false); if (d) setToDate(getLocalDateString(d)); }} />
            )}

            {!supplierId ? (
              <Text className="text-slate-400 text-sm py-6 text-center">Select a supplier above to see their entries.</Text>
            ) : entriesLoading ? (
              <ActivityIndicator color="#1e3a8a" style={{ marginVertical: 20 }} />
            ) : availableEntries.length === 0 ? (
              <Text className="text-slate-400 text-sm py-6 text-center">No equipment entries for this supplier in that date range.</Text>
            ) : (
              <View className="mb-4" style={{ gap: 8 }}>
                <Text className="text-slate-400 text-xs font-bold uppercase">{selectedEntryIds.size} selected</Text>
                {availableEntries.map((e: any) => {
                  const checked = selectedEntryIds.has(e.id);
                  const qty = e.rental_type === 'TRIP_BASIS' ? `${e.number_of_trips} trips` : `${e.working_hours} hrs`;
                  return (
                    <TouchableOpacity
                      key={e.id}
                      onPress={() => toggleEntry(e.id)}
                      className={`flex-row items-center p-3.5 rounded-xl border ${checked ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}
                    >
                      <View className={`w-5 h-5 rounded-md border items-center justify-center mr-3 ${checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                        {checked && <Check size={14} color="#fff" />}
                      </View>
                      <View className="flex-1">
                        <Text className="text-slate-900 font-bold text-sm">{e.equipment_master?.equipment_name || e.vehicle_number}</Text>
                        <Text className="text-slate-500 text-xs mt-0.5">
                          {e.vehicle_number} · Job {e.jobs?.job_number || '—'} · {e.entry_date} · {qty}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {!!error && (
              <View className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                <Text className="text-red-700 font-medium text-sm">{error}</Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              className={`py-4 rounded-xl items-center flex-row justify-center ${saving ? 'bg-slate-400' : 'bg-[#1e3a8a]'}`}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-base">{isEdit ? 'Save Changes' : 'Create Invoice'}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
