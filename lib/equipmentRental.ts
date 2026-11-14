import { supabase } from './supabase';
import { offHireKey } from './equipmentOffHire';

// job_equipment_rental holds ONE current row per (job_id, supplier_id,
// equipment_master_id) combo -- see add_equipment_rental_tracking.sql for why
// it's managed as delete-then-insert from the app rather than a DB upsert.
//
// This is purely informational -- what basis (Hourly/Daily/Weekly/Monthly) and
// what period an item is rented for. It does NOT hide anything from the
// Foreman app and has no automatic side effect anywhere; "overdue" is just
// `now() > rental_due_at`, computed wherever it's displayed, and acting on it
// (marking off-hire, removing the allocation) is always a manual admin step
// from the Rental Due page or the Allocation Report equipment modal.

export type RentalBasis = 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface RentalInfoRow {
  id: string;
  job_id: string;
  supplier_id: string | null;
  equipment_master_id: string;
  rental_basis: RentalBasis;
  rental_start_at: string | null;
  // Nullable -- an admin can record just the basis ("this is a Daily rental")
  // without ever having to pick a return date.
  rental_due_at: string | null;
  set_by: string | null;
  set_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export const RENTAL_BASIS_OPTIONS: { label: string; value: RentalBasis }[] = [
  { label: 'Hourly', value: 'HOURLY' },
  { label: 'Daily', value: 'DAILY' },
  { label: 'Weekly', value: 'WEEKLY' },
  { label: 'Monthly', value: 'MONTHLY' },
];

// "Overdue by 2 days" / "3 hrs left" -- always against "now". Returns null when
// there's no due date to measure against (basis-only rental info).
export function formatDueLabel(dueAt: string | null): { label: string; overdue: boolean } | null {
  if (!dueAt) return null;
  const diffMs = new Date(dueAt).getTime() - Date.now();
  const overdue = diffMs < 0;
  const absMs = Math.abs(diffMs);
  const hours = absMs / (1000 * 60 * 60);
  const days = hours / 24;

  let amount: string;
  if (days >= 1) {
    const d = Math.round(days);
    amount = `${d} day${d === 1 ? '' : 's'}`;
  } else {
    const h = Math.max(1, Math.round(hours));
    amount = `${h} hr${h === 1 ? '' : 's'}`;
  }

  return { label: overdue ? `Overdue by ${amount}` : `${amount} left`, overdue };
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// "Daily · 10 Nov 2026 - 17 Nov 2026" with both dates, "Daily · Due 17 Nov
// 2026" with just a due date, "Daily · From 10 Nov 2026" with just a start,
// or plain "Daily" when neither is set.
export function formatRentalPeriod(row: RentalInfoRow): string {
  const basis = RENTAL_BASIS_OPTIONS.find((o) => o.value === row.rental_basis)?.label || row.rental_basis;
  if (row.rental_start_at && row.rental_due_at) {
    return `${basis} · ${formatDate(row.rental_start_at)} - ${formatDate(row.rental_due_at)}`;
  }
  if (row.rental_due_at) {
    return `${basis} · Due ${formatDate(row.rental_due_at)}`;
  }
  if (row.rental_start_at) {
    return `${basis} · From ${formatDate(row.rental_start_at)}`;
  }
  return basis;
}

// Keyed by "supplierId:equipmentMasterId" (offHireKey), same shape as the
// off-hire status set, for one job.
export async function fetchRentalInfoForJob(jobId: string): Promise<Map<string, RentalInfoRow>> {
  const { data, error } = await supabase.from('job_equipment_rental').select('*').eq('job_id', jobId);
  if (error || !data) {
    console.error('Failed to fetch rental info', error);
    return new Map();
  }
  const map = new Map<string, RentalInfoRow>();
  data.forEach((row: any) => map.set(offHireKey(row.supplier_id, row.equipment_master_id), row));
  return map;
}

// "Upsert" by delete-then-insert -- see the file header comment on why this
// isn't a DB-level ON CONFLICT. rentalStartAt and rentalDueAt are both
// optional -- an admin can record just the basis with neither date set.
export async function setRentalInfo(
  jobId: string,
  supplierId: string | null,
  equipmentMasterId: string,
  rentalBasis: RentalBasis,
  rentalDueAt: Date | null,
  rentalStartAt?: Date | null
): Promise<{ error: any }> {
  const { data: { user } } = await supabase.auth.getUser();
  let setByName: string | null = null;
  if (user) {
    const { data: userRow } = await supabase.from('users').select('full_name').eq('id', user.id).maybeSingle();
    setByName = userRow?.full_name || null;
  }

  const clear = await clearRentalInfo(jobId, supplierId, equipmentMasterId);
  if (clear.error) return clear;

  const { error } = await supabase.from('job_equipment_rental').insert({
    job_id: jobId,
    supplier_id: supplierId,
    equipment_master_id: equipmentMasterId,
    rental_basis: rentalBasis,
    rental_start_at: rentalStartAt ? rentalStartAt.toISOString() : null,
    rental_due_at: rentalDueAt ? rentalDueAt.toISOString() : null,
    set_by: user?.id || null,
    set_by_name: setByName,
  });
  return { error };
}

export async function clearRentalInfo(
  jobId: string,
  supplierId: string | null,
  equipmentMasterId: string
): Promise<{ error: any }> {
  let query = supabase.from('job_equipment_rental').delete().eq('job_id', jobId).eq('equipment_master_id', equipmentMasterId);
  query = supplierId ? query.eq('supplier_id', supplierId) : query.is('supplier_id', null);
  const { error } = await query;
  return { error };
}
