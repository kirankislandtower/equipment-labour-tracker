import { supabase } from './supabase';

// The Supplier/Equipment pickers are populated from a mock catalogue (mock_suppliers_equipment.json)
// that only has names, not database rows. Those entries are seeded into the real `suppliers` /
// `equipment_master` tables via seed_mock_suppliers_equipment.sql — regular app users don't have
// RLS permission to write to those master-data tables, so this only ever looks a name up.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveSupplierId(supplierNameOrId: string): Promise<string> {
  // Editing an existing entry can pre-fill this field with the row's real id rather than
  // its name (see equipment_entries.supplier_id / labour_entries.supplier_id) — pass it through.
  if (UUID_RE.test(supplierNameOrId)) return supplierNameOrId;

  const { data, error } = await supabase
    .from('suppliers')
    .select('id')
    .eq('supplier_name', supplierNameOrId)
    .limit(1);

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(`Supplier "${supplierNameOrId}" isn't set up yet. Ask an admin to add it, then try again.`);
  }
  return data[0].id;
}

export async function resolveEquipmentId(equipmentNameOrId: string): Promise<string> {
  if (UUID_RE.test(equipmentNameOrId)) return equipmentNameOrId;

  const { data, error } = await supabase
    .from('equipment_master')
    .select('id')
    .eq('equipment_name', equipmentNameOrId)
    .limit(1);

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(`Equipment "${equipmentNameOrId}" isn't set up yet. Ask an admin to add it, then try again.`);
  }
  return data[0].id;
}
