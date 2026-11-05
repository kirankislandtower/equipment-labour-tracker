/**
 * The "Store" foreman account tracks warehouse/store stock movements rather than
 * on-site equipment/labour hours, so it doesn't need a live photo or time-tracking
 * fields on any entry form -- unlike every other foreman account.
 */
export function isStoreForeman(email?: string | null): boolean {
  if (!email) return false;
  return email.split('@')[0]?.trim().toLowerCase() === 'store';
}

/**
 * Same check as isStoreForeman, but from the admin side looking at an already-submitted
 * entry -- entries store the submitter's name in `foreman_name`, not their email, so
 * admin screens reviewing entries need this instead.
 */
export function isStoreForemanEntry(foremanName?: string | null): boolean {
  if (!foremanName) return false;
  return foremanName.trim().toLowerCase() === 'store';
}

/**
 * Temporary switch to pause the Flushing entry type on the foreman side (bottom
 * tab bar + the "New Daily Entry" picker) without touching any of its code or
 * data -- flip back to true to bring it back. Doesn't affect the admin side
 * (Flushing Entries / Flushing Invoice Tracking stay visible there) or a
 * foreman's own History tab, which still shows anything already submitted.
 */
export const FLUSHING_ENABLED_FOR_FOREMEN = false;
