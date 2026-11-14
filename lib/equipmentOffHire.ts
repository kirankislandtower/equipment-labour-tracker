import { supabase } from './supabase';

// job_equipment_offhire_log is append-only and keyed by (job_id, supplier_id,
// equipment_master_id) rather than job_equipment.id, because Site Allocations
// deletes and reinserts every job_equipment row (fresh UUIDs) on every save --
// see handleSave in app/(admin)/allocations.tsx. Keying by the natural
// job+supplier+equipment combo is what lets off-hire status survive that, and
// it gives a full history for free instead of a single flag to keep in sync.
//
// "Current status" for a combo is always just whichever row is newest for it --
// there's no separate current-status column anywhere.

export type OffHireAction = 'OFF_HIRE' | 'ON_HIRE' | 'REMOVED';

export interface OffHireLogRow {
  id: string;
  job_id: string;
  supplier_id: string | null;
  equipment_master_id: string;
  action: OffHireAction;
  changed_by: string | null;
  changed_by_name: string | null;
  created_at: string;
}

// supplier_id is null for the GENERAL scope (equipment not tied to a supplier),
// matching job_equipment.supplier_id itself.
export const offHireKey = (supplierId: string | null, equipmentMasterId: string) =>
  `${supplierId || 'GENERAL'}:${equipmentMasterId}`;

// Returns the set of "supplierId:equipmentMasterId" keys that are currently
// off-hire for this job -- i.e. whose most recent log row is an OFF_HIRE.
export async function fetchOffHireStatusForJob(jobId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('job_equipment_offhire_log')
    .select('supplier_id, equipment_master_id, action, created_at')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.error('Failed to fetch off-hire status', error);
    return new Set();
  }

  const latestSeen = new Set<string>();
  const offHire = new Set<string>();
  data.forEach((row: any) => {
    const key = offHireKey(row.supplier_id, row.equipment_master_id);
    if (latestSeen.has(key)) return; // already saw this combo's newest row
    latestSeen.add(key);
    if (row.action === 'OFF_HIRE') offHire.add(key);
  });
  return offHire;
}

export async function fetchOffHireHistory(
  jobId: string,
  supplierId: string | null,
  equipmentMasterId: string
): Promise<OffHireLogRow[]> {
  let query = supabase
    .from('job_equipment_offhire_log')
    .select('*')
    .eq('job_id', jobId)
    .eq('equipment_master_id', equipmentMasterId)
    .order('created_at', { ascending: false });

  query = supplierId ? query.eq('supplier_id', supplierId) : query.is('supplier_id', null);

  const { data, error } = await query;
  if (error) {
    console.error('Failed to fetch off-hire history', error);
    return [];
  }
  return data || [];
}

export async function logOffHireAction(
  jobId: string,
  supplierId: string | null,
  equipmentMasterId: string,
  action: OffHireAction
): Promise<{ error: any }> {
  const { data: { user } } = await supabase.auth.getUser();
  let changedByName: string | null = null;
  if (user) {
    const { data: userRow } = await supabase.from('users').select('full_name').eq('id', user.id).maybeSingle();
    changedByName = userRow?.full_name || null;
  }

  const { error } = await supabase.from('job_equipment_offhire_log').insert({
    job_id: jobId,
    supplier_id: supplierId,
    equipment_master_id: equipmentMasterId,
    action,
    changed_by: user?.id || null,
    changed_by_name: changedByName,
  });
  return { error };
}
