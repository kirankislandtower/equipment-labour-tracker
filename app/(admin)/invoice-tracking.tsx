import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, useWindowDimensions, Modal, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { supabase } from '../../lib/supabase';
import { getLocalDateString, getFirstOfMonthString } from '../../lib/dateUtils';
import DateTimePicker from '@react-native-community/datetimepicker';
import { FileText, Search, X, Check, ChevronDown, CheckCircle2, RotateCcw, Download } from 'lucide-react-native';

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
  const [onlyMissingTimesheet, setOnlyMissingTimesheet] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModalVisible, setBulkModalVisible] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Bulk-selecting only makes sense against the Pending list, so drop any
  // selection when switching tabs rather than carrying it over silently.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [tab]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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
  const missingTimesheetCount = pending.filter(e => !e.supplier_timesheet_number).length;
  const listForTab = (tab === 'PENDING' ? pending : verified).filter(e => !onlyMissingTimesheet || tab !== 'PENDING' || !e.supplier_timesheet_number);

  const handleSaved = (updated: any) => {
    setEntries(prev => prev.map(e => (e.id === updated.id ? { ...e, ...updated } : e)));
    setSelectedEntry(null);
  };

  const handleBulkVerify = async (invoiceNumber: string) => {
    const ids = Array.from(selectedIds);
    const { error } = await supabase
      .from('equipment_entries')
      .update({ invoice_status: 'VERIFIED', invoice_number: invoiceNumber })
      .in('id', ids);
    if (error) throw error;
    setEntries(prev => prev.map(e => (ids.includes(e.id) ? { ...e, invoice_status: 'VERIFIED', invoice_number: invoiceNumber } : e)));
    setSelectedIds(new Set());
    setBulkModalVisible(false);
  };

  const handleExportExcel = async () => {
    if (listForTab.length === 0) {
      alert('No entries to export for this tab and filter.');
      return;
    }
    setExporting(true);
    try {
      // Loaded on demand so the ~400KB xlsx library only ships to clients that
      // actually export, same pattern as the Dashboard's daily report export.
      const xlsxModule: any = await import('xlsx-js-style');
      const XLSX = xlsxModule.utils ? xlsxModule : xlsxModule.default;

      const headers = [
        'Equipment', 'Supplier', 'Vehicle Number', 'Job Number', 'Job Name', 'Date',
        'Rental Type', 'Working Hours', 'Number of Trips', 'Foreman',
        'Supplier Timesheet #', 'Status', 'Invoice Number',
      ];
      const rows = listForTab.map((e: any) => [
        e.equipment_master?.equipment_name || '',
        e.suppliers?.supplier_name || '',
        e.vehicle_number || '',
        e.jobs?.job_number || '',
        e.jobs?.job_name || '',
        e.entry_date,
        e.rental_type,
        e.rental_type === 'TRIP_BASIS' ? '' : (e.working_hours ?? ''),
        e.rental_type === 'TRIP_BASIS' ? (e.number_of_trips ?? '') : '',
        e.foreman_name || '',
        e.supplier_timesheet_number || '',
        e.invoice_status,
        e.invoice_number || '',
      ]);

      const statusColIndex = headers.indexOf('Status');
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      worksheet['!cols'] = [22, 22, 14, 12, 20, 12, 12, 13, 14, 16, 18, 12, 16].map(wch => ({ wch }));

      headers.forEach((_, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
        if (worksheet[cellRef]) {
          worksheet[cellRef].s = { font: { bold: true }, fill: { fgColor: { rgb: 'FFE2E8F0' } } };
        }
      });

      rows.forEach((row, rowIndex) => {
        if (row[statusColIndex] !== 'VERIFIED') return;
        headers.forEach((_, colIndex) => {
          const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
          if (worksheet[cellRef]) {
            worksheet[cellRef].s = { fill: { fgColor: { rgb: 'FFC6EFCE' } }, font: { color: { rgb: 'FF006100' } } };
          }
        });
      });

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, tab === 'PENDING' ? 'Pending' : 'Verified');
      const fileName = `InvoiceTracking_${tab === 'PENDING' ? 'Pending' : 'Verified'}_${fromDate}_to_${toDate}.xlsx`;

      if (Platform.OS === 'web') {
        const wbArray = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
        const blob = new Blob([wbArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        const fileUri = `${FileSystem.documentDirectory}${fileName}`;
        const wbBase64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
        await FileSystem.writeAsStringAsync(fileUri, wbBase64, { encoding: FileSystem.EncodingType.Base64 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Export Invoice Tracking',
          });
        } else {
          alert('Sharing is not available on this device.');
        }
      }
    } catch (err: any) {
      alert(err.message || 'Failed to export.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: isMobile ? 16 : 32, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View className="mb-6">
          <Text className="text-3xl font-black text-slate-900 tracking-tight mb-1">Invoice Tracking</Text>
          <Text className="text-slate-500 font-medium">Verify approved Equipment entries against the supplier's invoice.</Text>
        </View>

        <View className={isMobile ? 'mb-5' : 'flex-row items-center justify-between mb-5'} style={isMobile ? { gap: 12 } : undefined}>
          <View className="flex-row bg-slate-200/70 rounded-2xl p-1 self-start">
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

          <TouchableOpacity
            onPress={handleExportExcel}
            disabled={exporting || listForTab.length === 0}
            className={`flex-row items-center justify-center px-4 py-2.5 rounded-xl self-start ${exporting || listForTab.length === 0 ? 'bg-slate-300' : 'bg-emerald-600 active:bg-emerald-700'}`}
          >
            {exporting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Download size={16} color="#fff" />
                <Text className="text-white font-bold ml-2 text-sm">Export {tab === 'PENDING' ? 'Pending' : 'Verified'} to Excel</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {tab === 'PENDING' && missingTimesheetCount > 0 && (
          <TouchableOpacity
            onPress={() => setOnlyMissingTimesheet(v => !v)}
            className={`flex-row items-center self-start px-3.5 py-2 rounded-full border mb-5 ${onlyMissingTimesheet ? 'bg-red-600 border-red-600' : 'bg-red-50 border-red-200'}`}
          >
            <Text className={`text-xs font-bold ${onlyMissingTimesheet ? 'text-white' : 'text-red-700'}`}>
              {onlyMissingTimesheet ? 'Showing only' : 'Show only'} missing Timesheet # ({missingTimesheetCount})
            </Text>
          </TouchableOpacity>
        )}

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

        {tab === 'PENDING' && !loading && listForTab.length > 0 && (
          <View className="flex-row items-center justify-between mb-4">
            <TouchableOpacity
              onPress={() => {
                const visibleIds = listForTab.map(e => e.id);
                const allSelected = visibleIds.every(id => selectedIds.has(id));
                setSelectedIds(allSelected ? new Set() : new Set(visibleIds));
              }}
              className="flex-row items-center"
            >
              <View className={`w-5 h-5 rounded-md border-2 items-center justify-center mr-2 ${listForTab.every(e => selectedIds.has(e.id)) ? 'bg-blue-700 border-blue-700' : 'border-slate-300 bg-white'}`}>
                {listForTab.every(e => selectedIds.has(e.id)) && <Check size={13} color="#fff" />}
              </View>
              <Text className="text-slate-600 font-bold text-sm">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : `Select all ${listForTab.length}`}
              </Text>
            </TouchableOpacity>
          </View>
        )}

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
                className={`bg-white p-4 rounded-2xl border mb-3 flex-row ${selectedIds.has(e.id) ? 'border-blue-400' : 'border-slate-200'}`}
              >
                {tab === 'PENDING' && (
                  <TouchableOpacity
                    onPress={(evt) => { evt.stopPropagation(); toggleSelect(e.id); }}
                    className="pr-3 pt-0.5"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <View className={`w-5 h-5 rounded-md border-2 items-center justify-center ${selectedIds.has(e.id) ? 'bg-blue-700 border-blue-700' : 'border-slate-300 bg-white'}`}>
                      {selectedIds.has(e.id) && <Check size={13} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                )}
                <View className="flex-1">
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
                <Text className="text-slate-400 text-xs mt-1">Foreman: {e.foreman_name || 'Unknown'}</Text>
                <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-slate-100">
                  <Text className="text-slate-600 text-xs font-bold">Job {e.jobs?.job_number || '—'} · {e.entry_date} · {qty}</Text>
                  {e.supplier_timesheet_number ? (
                    <Text className="text-slate-400 text-xs">TS# {e.supplier_timesheet_number}</Text>
                  ) : (
                    <View className="bg-red-50 px-2 py-0.5 rounded-full">
                      <Text className="text-red-600 text-[10px] font-bold uppercase">No Timesheet #</Text>
                    </View>
                  )}
                </View>
                {tab === 'VERIFIED' && !!e.invoice_number && (
                  <Text className="text-indigo-700 font-bold text-sm mt-2">Invoice: {e.invoice_number}</Text>
                )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {tab === 'PENDING' && selectedIds.size > 0 && (
        <View
          className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-4 flex-row items-center justify-between"
          style={{ shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 8 }}
        >
          <Text className="text-slate-900 font-bold">{selectedIds.size} selected</Text>
          <View className="flex-row items-center" style={{ gap: 12 }}>
            <TouchableOpacity onPress={() => setSelectedIds(new Set())} className="px-4 py-3 rounded-xl border border-slate-200">
              <Text className="text-slate-600 font-bold">Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setBulkModalVisible(true)} className="px-5 py-3 rounded-xl bg-green-600 flex-row items-center">
              <CheckCircle2 size={18} color="#fff" />
              <Text className="text-white font-bold ml-2">Verify {selectedIds.size}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <EntryDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} onSaved={handleSaved} />
      <BulkVerifyModal
        visible={bulkModalVisible}
        count={selectedIds.size}
        onClose={() => setBulkModalVisible(false)}
        onVerify={handleBulkVerify}
      />
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

function BulkVerifyModal({ visible, count, onClose, onVerify }: { visible: boolean; count: number; onClose: () => void; onVerify: (invoiceNumber: string) => Promise<void> }) {
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) { setInvoiceNumber(''); setError(''); }
  }, [visible]);

  const handleSubmit = async () => {
    if (!invoiceNumber.trim()) { setError('Enter the invoice number.'); return; }
    setSaving(true);
    setError('');
    try {
      await onVerify(invoiceNumber.trim());
    } catch (err: any) {
      setError(err.message || 'Failed to save.');
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-center items-center p-6">
        <View className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl">
          <View className="flex-row justify-between items-start mb-4">
            <Text className="text-xl font-black text-slate-900 flex-1 pr-2">Verify {count} {count === 1 ? 'Entry' : 'Entries'}</Text>
            <TouchableOpacity onPress={onClose} className="bg-slate-100 p-2 rounded-full active:bg-slate-200">
              <X size={18} color="#64748b" />
            </TouchableOpacity>
          </View>

          <Text className="text-slate-500 text-sm mb-5">
            All selected entries will be stamped with this same invoice number — use this when one supplier invoice covers several daily entries.
          </Text>

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
            onPress={handleSubmit}
            disabled={saving}
            className={`py-3.5 rounded-xl items-center flex-row justify-center ${saving ? 'bg-slate-400' : 'bg-green-600'}`}
          >
            {saving ? <ActivityIndicator color="#fff" /> : (
              <>
                <CheckCircle2 size={18} color="#fff" />
                <Text className="text-white font-bold ml-2">Mark {count} Verified</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
