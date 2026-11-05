import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, TextInput } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Fuel, ChevronLeft, ChevronRight, Search, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react-native';
import { FadeInUp } from '../../components/Animations';
import ExportCSVButton from '../../components/ExportCSVButton';
import { getLocalDateString } from '../../lib/dateUtils';

type PeriodType = 'DAY' | 'WEEK' | 'MONTH';
type FuelFilter = 'APPROVED' | 'ALL';
type ReportMode = 'TREND' | 'COMPARE';

type UnitTotals = { Liters: number; Gallons: number };
const emptyUnits = (): UnitTotals => ({ Liters: 0, Gallons: 0 });
const addUnit = (totals: UnitTotals, unit: string | null | undefined, qty: number) => {
  if ((unit || '').trim() === 'Gallons') totals.Gallons += qty;
  else totals.Liters += qty;
};

type JobFuelStat = {
  jobId: string;
  jobLabel: string;
  current: UnitTotals;
  previous: UnitTotals;
  dailyCurrent: Record<string, UnitTotals>;
};

// -- Period math -- Week is Monday-Sunday, Month is the calendar month. "Previous
// period" is always the same-length window immediately before the current one, so
// a Wed-anchored week compares against the Wed-anchored week before it, etc.
const startOfWeek = (d: Date) => {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
  date.setDate(date.getDate() + ((day === 0 ? -6 : 1) - day));
  return date;
};
const endOfWeek = (d: Date) => { const s = startOfWeek(d); const e = new Date(s); e.setDate(e.getDate() + 6); return e; };
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

const getPeriodRange = (type: PeriodType, anchor: Date): { start: Date; end: Date } => {
  if (type === 'DAY') return { start: anchor, end: anchor };
  if (type === 'WEEK') return { start: startOfWeek(anchor), end: endOfWeek(anchor) };
  return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
};
const shiftAnchor = (type: PeriodType, anchor: Date, dir: 1 | -1): Date => {
  if (type === 'DAY') { const d = new Date(anchor); d.setDate(d.getDate() + dir); return d; }
  if (type === 'WEEK') { const d = new Date(anchor); d.setDate(d.getDate() + dir * 7); return d; }
  // Month shifts always land on day 1 -- day-of-month doesn't matter for a MONTH
  // period (getPeriodRange normalizes to start/end of month anyway), and keeping
  // the original day would overflow on a 31st shifting into a shorter month
  // (e.g. "Mar 31" minus 1 month via setMonth() lands on Mar 3, not February).
  return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
};
const formatPeriodLabel = (type: PeriodType, anchor: Date): string => {
  const { start, end } = getPeriodRange(type, anchor);
  if (type === 'DAY') return anchor.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  if (type === 'WEEK') {
    const sameMonth = start.getMonth() === end.getMonth();
    const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endLabel = end.toLocaleDateString('en-US', sameMonth ? { day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startLabel} - ${endLabel}`;
  }
  return anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const pctChange = (current: number, previous: number): number | null => {
  if (previous === 0) return current === 0 ? 0 : null; // null = "new" (nothing to compare against)
  return ((current - previous) / previous) * 100;
};

const TrendBadge = ({ current, previous }: { current: number; previous: number }) => {
  const change = pctChange(current, previous);
  if (change === null) return (
    <View className="flex-row items-center bg-slate-100 px-2 py-1 rounded-full self-start">
      <Text className="text-slate-500 font-bold text-[10px]">NEW</Text>
    </View>
  );
  if (Math.abs(change) < 0.5) return (
    <View className="flex-row items-center bg-slate-100 px-2 py-1 rounded-full self-start">
      <Minus size={10} color="#64748b" />
      <Text className="text-slate-500 font-bold text-[10px] ml-1">No Change</Text>
    </View>
  );
  const isUp = change > 0;
  return (
    <View className={`flex-row items-center px-2 py-1 rounded-full self-start ${isUp ? 'bg-red-50' : 'bg-green-50'}`}>
      {isUp ? <ArrowUpRight size={10} color="#dc2626" /> : <ArrowDownRight size={10} color="#16a34a" />}
      <Text className={`font-bold text-[10px] ml-1 ${isUp ? 'text-red-600' : 'text-green-600'}`}>{Math.abs(change).toFixed(0)}%</Text>
    </View>
  );
};

export default function FuelReportsScreen() {
  const [loading, setLoading] = useState(true);
  const [activeCompany, setActiveCompany] = useState<'IST' | 'JAH' | 'HYDRO'>('IST');
  const [periodType, setPeriodType] = useState<PeriodType>('MONTH');
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [fuelFilter, setFuelFilter] = useState<FuelFilter>('APPROVED');
  const [mode, setMode] = useState<ReportMode>('COMPARE');

  const [statsByJob, setStatsByJob] = useState<Record<string, JobFuelStat>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const { start: curStart, end: curEnd } = useMemo(() => getPeriodRange(periodType, anchorDate), [periodType, anchorDate]);
  const prevAnchor = useMemo(() => shiftAnchor(periodType, anchorDate, -1), [periodType, anchorDate]);
  const { start: prevStart, end: prevEnd } = useMemo(() => getPeriodRange(periodType, prevAnchor), [periodType, prevAnchor]);

  useEffect(() => {
    fetchData();
  }, [activeCompany, periodType, anchorDate, fuelFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const fromStr = getLocalDateString(prevStart);
      const toStr = getLocalDateString(curEnd);
      const curStartStr = getLocalDateString(curStart);
      const curEndStr = getLocalDateString(curEnd);
      const prevStartStr = getLocalDateString(prevStart);
      const prevEndStr = getLocalDateString(prevEnd);

      const selectCols = 'job_id, entry_date, fuel_quantity, fuel_unit, fuel_approval_status, jobs:job_id (job_number, job_name, company)';
      const [eq, fl] = await Promise.all([
        supabase.from('equipment_entries').select(selectCols).eq('fuel_provided', true).gte('entry_date', fromStr).lte('entry_date', toStr),
        supabase.from('flushing_entries').select(selectCols).eq('fuel_provided', true).gte('entry_date', fromStr).lte('entry_date', toStr),
      ]);

      const allRows = [...(eq.data || []), ...(fl.data || [])];
      const map: Record<string, JobFuelStat> = {};

      allRows.forEach((row: any) => {
        if (!row.job_id || row.fuel_quantity === null || row.fuel_quantity === undefined) return;
        if (row.jobs?.company !== activeCompany) return;
        if (fuelFilter === 'APPROVED' && row.fuel_approval_status !== 'APPROVED') return;

        if (!map[row.job_id]) {
          map[row.job_id] = {
            jobId: row.job_id,
            jobLabel: row.jobs ? `${row.jobs.job_number} - ${row.jobs.job_name}` : 'Unknown Job',
            current: emptyUnits(),
            previous: emptyUnits(),
            dailyCurrent: {},
          };
        }
        const stat = map[row.job_id];
        const qty = parseFloat(row.fuel_quantity) || 0;

        if (row.entry_date >= curStartStr && row.entry_date <= curEndStr) {
          addUnit(stat.current, row.fuel_unit, qty);
          if (!stat.dailyCurrent[row.entry_date]) stat.dailyCurrent[row.entry_date] = emptyUnits();
          addUnit(stat.dailyCurrent[row.entry_date], row.fuel_unit, qty);
        } else if (row.entry_date >= prevStartStr && row.entry_date <= prevEndStr) {
          addUnit(stat.previous, row.fuel_unit, qty);
        }
      });

      setStatsByJob(map);
    } catch (err) {
      console.error('Error loading fuel reports', err);
    } finally {
      setLoading(false);
    }
  };

  const allStats = Object.values(statsByJob);
  const rankedStats = [...allStats].sort((a, b) => (b.current.Liters + b.current.Gallons) - (a.current.Liters + a.current.Gallons));
  const filteredRanked = searchQuery.trim()
    ? rankedStats.filter(s => s.jobLabel.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : rankedStats;

  const selectedStat = selectedJobId ? statsByJob[selectedJobId] : null;
  const maxDaily = selectedStat
    ? Math.max(1, ...Object.values(selectedStat.dailyCurrent).map(d => d.Liters))
    : 1;

  const periodDays = useMemo(() => {
    const days: string[] = [];
    const cursor = new Date(curStart);
    while (cursor <= curEnd) {
      days.push(getLocalDateString(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [curStart, curEnd]);

  const exportRows = filteredRanked.map(s => ({
    Job: s.jobLabel,
    [`Current ${periodType === 'DAY' ? 'Day' : periodType === 'WEEK' ? 'Week' : 'Month'} Liters`]: s.current.Liters,
    [`Previous Period Liters`]: s.previous.Liters,
    'Current Gallons': s.current.Gallons,
    'Previous Period Gallons': s.previous.Gallons,
  }));

  return (
    <FadeInUp style={{ flex: 1 }}>
      <View className="flex-1 bg-slate-50">
        <ScrollView className="flex-1 p-4 md:p-8" showsVerticalScrollIndicator={false}>
          <View className="mb-8">
            <Text className="text-3xl font-black text-slate-900 tracking-tight mb-2">Fuel Reports</Text>
            <Text className="text-slate-500 font-medium">
              Liters issued per Job Site by day, week, or month -- with a trend for one job and a ranked
              comparison across jobs.
            </Text>
          </View>

          <View className="flex-row items-center bg-white rounded-xl shadow-sm border border-slate-200 p-1 mb-4 self-start">
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

          <View className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm mb-4">
            <View className="flex-row flex-wrap items-center justify-between gap-3">
              <View className="flex-row items-center bg-slate-100 rounded-xl p-1">
                {(['DAY', 'WEEK', 'MONTH'] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setPeriodType(p)}
                    className={`py-2 px-4 rounded-lg ${periodType === p ? 'bg-white shadow-sm' : ''}`}
                  >
                    <Text className={`font-bold text-xs ${periodType === p ? 'text-slate-900' : 'text-slate-500'}`}>
                      {p === 'DAY' ? 'Day' : p === 'WEEK' ? 'Week' : 'Month'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View className="flex-row items-center bg-slate-100 rounded-xl p-1">
                {(['APPROVED', 'ALL'] as const).map((f) => (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setFuelFilter(f)}
                    className={`py-2 px-4 rounded-lg ${fuelFilter === f ? 'bg-white shadow-sm' : ''}`}
                  >
                    <Text className={`font-bold text-xs ${fuelFilter === f ? 'text-slate-900' : 'text-slate-500'}`}>
                      {f === 'APPROVED' ? 'Store Approved Only' : 'All Fuel'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View className="flex-row items-center justify-between bg-slate-50 rounded-2xl border border-slate-100 p-3 mt-4">
              <TouchableOpacity onPress={() => setAnchorDate(shiftAnchor(periodType, anchorDate, -1))} className="p-2 bg-white rounded-xl border border-slate-200 active:scale-[0.95]">
                <ChevronLeft size={18} color="#334155" />
              </TouchableOpacity>
              <Text className="text-slate-900 font-bold">{formatPeriodLabel(periodType, anchorDate)}</Text>
              <TouchableOpacity onPress={() => setAnchorDate(shiftAnchor(periodType, anchorDate, 1))} className="p-2 bg-white rounded-xl border border-slate-200 active:scale-[0.95]">
                <ChevronRight size={18} color="#334155" />
              </TouchableOpacity>
            </View>
            <Text className="text-slate-400 text-xs mt-2">
              Comparing against {formatPeriodLabel(periodType, prevAnchor)}
            </Text>
          </View>

          <View className="flex-row items-center bg-white rounded-xl shadow-sm border border-slate-200 p-1 mb-4 self-start">
            {(['COMPARE', 'TREND'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setMode(m)}
                className={`py-2 px-5 rounded-lg ${mode === m ? 'bg-slate-900' : 'bg-transparent'}`}
              >
                <Text className={`font-bold text-sm ${mode === m ? 'text-white' : 'text-slate-500'}`}>
                  {m === 'COMPARE' ? 'Compare Jobs' : 'Single Job Trend'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading ? (
            <View className="py-20 items-center">
              <ActivityIndicator size="large" color="#1e3a8a" />
            </View>
          ) : mode === 'COMPARE' ? (
            <View className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm mb-20">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-xl font-black text-slate-900">Ranked by Liters, This {periodType === 'DAY' ? 'Day' : periodType === 'WEEK' ? 'Week' : 'Month'}</Text>
                <ExportCSVButton data={exportRows} filename="fuel_report" label="Export CSV" />
              </View>

              <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-4 h-12 mb-4">
                <Search size={18} color="#94a3b8" />
                <TextInput
                  placeholder="Search jobs"
                  placeholderTextColor="#94a3b8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  className="flex-1 ml-3 text-slate-900"
                  style={{ outlineStyle: 'none' } as any}
                />
              </View>

              {filteredRanked.length === 0 ? (
                <View className="py-10 items-center">
                  <Fuel size={32} color="#cbd5e1" />
                  <Text className="text-slate-500 font-medium mt-3">No fuel recorded for this period{fuelFilter === 'APPROVED' ? ' (Store-approved only)' : ''}.</Text>
                </View>
              ) : (
                filteredRanked.map((s, idx) => (
                  <TouchableOpacity
                    key={s.jobId}
                    onPress={() => { setSelectedJobId(s.jobId); setMode('TREND'); }}
                    className="flex-row items-center justify-between p-4 mb-2 rounded-xl border border-slate-100 bg-slate-50 active:bg-slate-100"
                  >
                    <View className="flex-row items-center flex-1 pr-4">
                      <View className="w-8 h-8 rounded-full items-center justify-center mr-3 bg-slate-200">
                        <Text className="text-slate-600 font-black text-xs">{idx + 1}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="font-bold text-slate-900" numberOfLines={1}>{s.jobLabel}</Text>
                        <View className="flex-row items-center mt-1 gap-2">
                          <TrendBadge current={s.current.Liters + s.current.Gallons} previous={s.previous.Liters + s.previous.Gallons} />
                        </View>
                      </View>
                    </View>
                    <View className="items-end">
                      {s.current.Liters > 0 && <Text className="text-slate-900 font-black">{s.current.Liters.toFixed(0)} L</Text>}
                      {s.current.Gallons > 0 && <Text className="text-slate-500 font-bold text-xs">{s.current.Gallons.toFixed(0)} Gal</Text>}
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          ) : (
            <View className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm mb-20">
              <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Select Job</Text>
              <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-4 h-12 mb-4">
                <Search size={18} color="#94a3b8" />
                <TextInput
                  placeholder="Search jobs"
                  placeholderTextColor="#94a3b8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  className="flex-1 ml-3 text-slate-900"
                  style={{ outlineStyle: 'none' } as any}
                />
              </View>

              {!selectedStat ? (
                <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled>
                  {filteredRanked.length === 0 ? (
                    <Text className="text-slate-500 font-medium text-center py-6">No fuel recorded for this period yet.</Text>
                  ) : (
                    filteredRanked.map(s => (
                      <TouchableOpacity
                        key={s.jobId}
                        onPress={() => setSelectedJobId(s.jobId)}
                        className="flex-row items-center p-3 mb-1 rounded-xl border border-transparent bg-slate-50 active:bg-slate-100"
                      >
                        <Fuel size={16} color="#94a3b8" />
                        <Text className="ml-2 font-semibold text-slate-700 flex-1" numberOfLines={1}>{s.jobLabel}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              ) : (
                <>
                  <TouchableOpacity onPress={() => setSelectedJobId(null)} className="self-start mb-4">
                    <Text className="text-blue-700 font-bold text-xs">Change Job</Text>
                  </TouchableOpacity>

                  <Text className="text-xl font-black text-slate-900 mb-1">{selectedStat.jobLabel}</Text>
                  <Text className="text-slate-400 text-xs mb-5">{formatPeriodLabel(periodType, anchorDate)}</Text>

                  <View className="flex-row gap-3 mb-5">
                    <View className="flex-1 bg-amber-50 border border-amber-100 rounded-2xl p-4">
                      <Text className="text-amber-700 font-bold text-xs uppercase mb-1">This Period</Text>
                      <Text className="text-amber-900 font-black text-2xl">{selectedStat.current.Liters.toFixed(0)} L</Text>
                      {selectedStat.current.Gallons > 0 && <Text className="text-amber-700 font-bold text-xs mt-0.5">+ {selectedStat.current.Gallons.toFixed(0)} Gal</Text>}
                      <View className="mt-2">
                        <TrendBadge current={selectedStat.current.Liters} previous={selectedStat.previous.Liters} />
                      </View>
                    </View>
                    <View className="flex-1 bg-slate-50 border border-slate-100 rounded-2xl p-4">
                      <Text className="text-slate-500 font-bold text-xs uppercase mb-1">Previous Period</Text>
                      <Text className="text-slate-700 font-black text-2xl">{selectedStat.previous.Liters.toFixed(0)} L</Text>
                      {selectedStat.previous.Gallons > 0 && <Text className="text-slate-500 font-bold text-xs mt-0.5">+ {selectedStat.previous.Gallons.toFixed(0)} Gal</Text>}
                    </View>
                  </View>

                  {periodType !== 'DAY' && (
                    <View>
                      <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Day by Day (Liters)</Text>
                      {periodDays.map(dateStr => {
                        const totals = selectedStat.dailyCurrent[dateStr] || emptyUnits();
                        const widthPct = Math.min(100, (totals.Liters / maxDaily) * 100);
                        const dayLabel = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
                        return (
                          <View key={dateStr} className="flex-row items-center mb-2">
                            <Text className="text-slate-400 text-[10px] font-bold w-14">{dayLabel}</Text>
                            <View className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden mr-2">
                              {totals.Liters > 0 && <View style={{ width: `${widthPct}%` }} className="h-full bg-amber-400 rounded-full" />}
                            </View>
                            <Text className="text-slate-600 text-xs font-bold w-16 text-right">
                              {totals.Liters > 0 ? `${totals.Liters.toFixed(0)} L` : '-'}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </FadeInUp>
  );
}
