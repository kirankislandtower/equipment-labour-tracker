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
