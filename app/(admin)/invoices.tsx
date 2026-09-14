import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, useWindowDimensions, Platform, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Calendar, ChevronDown, Check, X, FileText, Calculator, AlertCircle, CheckCircle2, Search } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getLocalDateString, getFirstOfMonthString } from '../../lib/dateUtils';

// Helper for modal picker
const CustomPicker = ({ label, value, options, onSelect, placeholder }: any) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = searchQuery.trim()
    ? options.filter((o: any) => o.label.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : options;

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

      <Modal visible={modalVisible} transparent animationType="slide" onShow={() => setSearchQuery('')} onRequestClose={() => setModalVisible(false)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl h-[70%] shadow-2xl">
            <View className="flex-row items-center justify-between p-6 border-b border-slate-100">
              <Text className="text-slate-900 text-xl font-black tracking-tight">Select {label}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} className="p-2 bg-slate-100 rounded-full active:opacity-60">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl mx-6 mt-4 mb-2 px-4 h-12">
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
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1">
                  <X size={16} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>
            {filteredOptions.length === 0 && (
              <View className="py-10 items-center">
                <Text className="text-slate-400 font-medium">No matches for "{searchQuery}"</Text>
              </View>
            )}
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {filteredOptions.map((item: any) => (
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

export default function InvoiceReconciler() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const firstOfMonth = getFirstOfMonthString();
  const todayStr = getLocalDateString();

  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(todayStr);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  
  const [invoicedHours, setInvoicedHours] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [results, setResults] = useState<{
    equipmentHours: number;
    labourHours: number;
    totalLogged: number;
    discrepancy: number | null;
    status: 'MATCH' | 'OVERBILLED' | 'UNDERBILLED' | null;
  } | null>(null);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('suppliers').select('id, supplier_name').order('supplier_name');
      if (data) {
        setSuppliers(data.map(s => ({ label: s.supplier_name, value: s.id })));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReconcile = async () => {
    if (!selectedSupplier) {
      alert('Please select a supplier first.');
      return;
    }
    
    const billed = parseFloat(invoicedHours) || 0;

    setReconciling(true);
    try {
      // Fetch APPROVED equipment entries
      const { data: equipData } = await supabase
        .from('equipment_entries')
        .select('working_hours')
        .eq('supplier_id', selectedSupplier)
        .eq('status', 'APPROVED')
        .gte('entry_date', fromDate)
        .lte('entry_date', toDate);

      // Fetch APPROVED labour entries
      const { data: labourData } = await supabase
        .from('labour_entries')
        .select('total_working_hours')
        .eq('supplier_id', selectedSupplier)
        .eq('status', 'APPROVED')
        .gte('entry_date', fromDate)
        .lte('entry_date', toDate);

      let eqHrs = 0;
      if (equipData) {
        eqHrs = equipData.reduce((sum, item) => sum + (parseFloat(item.working_hours) || 0), 0);
      }

      let labHrs = 0;
      if (labourData) {
        labHrs = labourData.reduce((sum, item) => sum + (parseFloat(item.total_working_hours) || 0), 0);
      }

      const total = eqHrs + labHrs;
      const diff = billed - total;
      
      let stat: 'MATCH' | 'OVERBILLED' | 'UNDERBILLED' = 'MATCH';
      if (Math.abs(diff) <= 0.1 && billed !== 0) {
        stat = 'MATCH';
      } else if (diff > 0) {
        stat = 'OVERBILLED';
      } else if (diff < 0) {
        stat = 'UNDERBILLED';
      }

      setResults({
        equipmentHours: eqHrs,
        labourHours: labHrs,
        totalLogged: total,
        discrepancy: diff,
        status: billed === 0 ? null : stat
      });

    } catch (err) {
      console.error(err);
    } finally {
      setReconciling(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-slate-50">
      <ScrollView className={`flex-1 ${isMobile ? 'p-4' : 'p-8'}`} showsVerticalScrollIndicator={false}>
        
        <View className="mb-8">
          <Text className="text-3xl font-black text-slate-900 tracking-tight mb-2">Invoice Reconciler</Text>
          <Text className="text-slate-500 font-medium">Compare supplier invoices against actual site logs.</Text>
        </View>

        <View className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm mb-6">
          <CustomPicker 
            label="Supplier" 
            value={selectedSupplier} 
            options={suppliers} 
            onSelect={(val: string) => { setSelectedSupplier(val); setResults(null); }} 
            placeholder="Select a supplier to reconcile" 
          />

          <Text className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-1.5 mt-2">Date Range</Text>
          <View className={isMobile ? 'flex-col mb-4' : 'flex-row items-center space-x-3 mb-4'}>
            <TouchableOpacity 
              onPress={() => setShowFromPicker(true)} 
              disabled={Platform.OS === 'web'}
              className={`bg-slate-50 flex-row items-center p-4 rounded-2xl border border-slate-200 ${isMobile ? 'w-full mb-3' : 'flex-1'}`}
            >
              <Calendar size={18} color="#64748b" className="mr-3" />
              <View className="flex-1">
                <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">From</Text>
                {Platform.OS === 'web' ? (
                  <input type="date" value={fromDate} onChange={(e: any) => { setFromDate(e.target.value); setResults(null); }} style={{ border: 'none', outline: 'none', width: '100%', fontWeight: '700', backgroundColor: 'transparent', color: '#0f172a', fontSize: '15px', padding: 0, margin: 0 }} />
                ) : (
                  <Text className="text-slate-900 font-bold text-base">{fromDate}</Text>
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => setShowToPicker(true)} 
              disabled={Platform.OS === 'web'}
              className={`bg-slate-50 flex-row items-center p-4 rounded-2xl border border-slate-200 ${isMobile ? 'w-full' : 'flex-1'}`}
            >
              <Calendar size={18} color="#64748b" className="mr-3" />
              <View className="flex-1">
                <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">To</Text>
                {Platform.OS === 'web' ? (
                  <input type="date" value={toDate} onChange={(e: any) => { setToDate(e.target.value); setResults(null); }} style={{ border: 'none', outline: 'none', width: '100%', fontWeight: '700', backgroundColor: 'transparent', color: '#0f172a', fontSize: '15px', padding: 0, margin: 0 }} />
                ) : (
                  <Text className="text-slate-900 font-bold text-base">{toDate}</Text>
                )}
              </View>
            </TouchableOpacity>
          </View>

          <View className="mb-6">
            <Text className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-1.5">Supplier Invoiced Hours</Text>
            <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-2xl px-4">
              <FileText size={20} color="#64748b" className="mr-3" />
              <TextInput
                value={invoicedHours}
                onChangeText={(t) => { setInvoicedHours(t); setResults(null); }}
                className="flex-1 py-4 text-slate-900 font-black text-xl"
                placeholder="0.00"
                placeholderTextColor="#cbd5e1"
                keyboardType="numeric"
              />
              <Text className="text-slate-400 font-bold ml-2">hrs</Text>
            </View>
            <Text className="text-slate-400 text-xs mt-2 italic">Enter the total hours claimed on the physical invoice.</Text>
          </View>

          <TouchableOpacity
            onPress={handleReconcile}
            disabled={!selectedSupplier || reconciling}
            className={`w-full py-4 rounded-2xl flex-row items-center justify-center ${!selectedSupplier ? 'bg-slate-300' : 'bg-[#1e3a8a] active:bg-[#1e40af]'}`}
          >
            {reconciling ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Calculator size={20} color="#ffffff" className="mr-2" />
                <Text className="text-white font-bold text-lg">Compare & Reconcile</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {results && (
          <View className={`bg-white rounded-3xl p-6 border ${results.status === 'OVERBILLED' ? 'border-red-200' : results.status === 'MATCH' ? 'border-green-200' : 'border-amber-200'} shadow-sm mb-12`}>
            
            {results.status === 'OVERBILLED' && (
              <View className="bg-red-50 p-4 rounded-2xl border border-red-100 flex-row items-start mb-6">
                <AlertCircle size={24} color="#dc2626" className="mr-3 mt-1" />
                <View className="flex-1">
                  <Text className="text-red-900 font-black text-xl mb-1">Discrepancy Found!</Text>
                  <Text className="text-red-700 font-medium">
                    The supplier has invoiced you for <Text className="font-black">{results.discrepancy?.toFixed(2)} hours MORE</Text> than what was actually approved on site.
                  </Text>
                </View>
              </View>
            )}

            {results.status === 'MATCH' && (
              <View className="bg-green-50 p-4 rounded-2xl border border-green-100 flex-row items-start mb-6">
                <CheckCircle2 size={24} color="#16a34a" className="mr-3 mt-1" />
                <View className="flex-1">
                  <Text className="text-green-900 font-black text-xl mb-1">Perfect Match</Text>
                  <Text className="text-green-700 font-medium">
                    The invoiced hours match the approved site logs perfectly. Clear for payment!
                  </Text>
                </View>
              </View>
            )}

            {results.status === 'UNDERBILLED' && (
              <View className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex-row items-start mb-6">
                <AlertCircle size={24} color="#d97706" className="mr-3 mt-1" />
                <View className="flex-1">
                  <Text className="text-amber-900 font-black text-xl mb-1">Underbilled</Text>
                  <Text className="text-amber-700 font-medium">
                    The supplier has invoiced you for <Text className="font-black">{Math.abs(results.discrepancy || 0).toFixed(2)} hours LESS</Text> than what was logged.
                  </Text>
                </View>
              </View>
            )}

            <Text className="text-slate-900 font-black text-lg mb-4">Breakdown of Approved Logs</Text>
            
            <View className="flex-row justify-between items-center py-3 border-b border-slate-100">
              <Text className="text-slate-600 font-medium text-base">Equipment Hours</Text>
              <Text className="text-slate-900 font-bold text-lg">{results.equipmentHours.toFixed(2)}</Text>
            </View>
            <View className="flex-row justify-between items-center py-3 border-b border-slate-100">
              <Text className="text-slate-600 font-medium text-base">Labour Hours</Text>
              <Text className="text-slate-900 font-bold text-lg">{results.labourHours.toFixed(2)}</Text>
            </View>
            <View className="flex-row justify-between items-center py-4 bg-slate-50 mt-4 rounded-xl px-4 border border-slate-100">
              <Text className="text-slate-900 font-black text-lg uppercase tracking-wide">Total Actual Usage</Text>
              <Text className="text-slate-900 font-black text-2xl">{results.totalLogged.toFixed(2)} hrs</Text>
            </View>
          </View>
        )}

      </ScrollView>

      {/* Date Pickers for iOS/Android */}
      {Platform.OS === 'ios' ? (
        <Modal visible={showFromPicker || showToPicker} transparent animationType="slide">
          <View className="flex-1 justify-end bg-black/50">
            <View className="bg-white p-6 rounded-t-3xl pb-10">
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-xl font-black text-slate-900">Select Date</Text>
                <TouchableOpacity onPress={() => { setShowFromPicker(false); setShowToPicker(false); setResults(null); }} className="bg-blue-100 px-5 py-2.5 rounded-full">
                  <Text className="text-blue-700 font-bold">Done</Text>
                </TouchableOpacity>
              </View>
              {(showFromPicker || showToPicker) && (
                <DateTimePicker 
                  value={new Date(showFromPicker ? fromDate : toDate)} 
                  mode="date" 
                  display="spinner"
                  onChange={(e, d) => { 
                    if (d) {
                      if (showFromPicker) setFromDate(getLocalDateString(d));
                      if (showToPicker) setToDate(getLocalDateString(d));
                      setResults(null);
                    }
                  }} 
                />
              )}
            </View>
          </View>
        </Modal>
      ) : (
        <>
          {showFromPicker && (
            <DateTimePicker value={new Date(fromDate)} mode="date" display="default" onChange={(e, d) => { setShowFromPicker(false); if (d) { setFromDate(getLocalDateString(d)); setResults(null); } }} />
          )}
          {showToPicker && (
            <DateTimePicker value={new Date(toDate)} mode="date" display="default" onChange={(e, d) => { setShowToPicker(false); if (d) { setToDate(getLocalDateString(d)); setResults(null); } }} />
          )}
        </>
      )}

    </KeyboardAvoidingView>
  );
}
