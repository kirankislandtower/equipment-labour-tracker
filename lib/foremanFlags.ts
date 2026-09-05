/**
 * The "Store" foreman account tracks warehouse/store stock movements rather than
 * on-site equipment/labour hours, so it doesn't need a live photo or time-tracking
 * fields on any entry form -- unlike every other foreman account.
 */
export function isStoreForeman(email?: string | null): boolean {
  if (!email) return false;
  return email.split('@')[0]?.trim().toLowerCase() === 'store';
}
