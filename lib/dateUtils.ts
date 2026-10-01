/**
 * Returns the current local date as YYYY-MM-DD string.
 * Using this instead of toISOString().split('T')[0] which gives UTC date
 * and can be off by a day depending on timezone.
 */
export function getLocalDateString(date?: Date): string {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Returns the first day of the current month as YYYY-MM-DD string.
 */
export function getFirstOfMonthString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Flags an entry whose submission timestamp is earlier than the work period it
 * claims -- e.g. submitted at 06:02 for a shift claimed as 08:00-17:00, which is
 * only possible if the hours were filled in before the work actually happened.
 * Built from the entry's own local wall-clock fields, compared against created_at
 * read in the viewer's local timezone (same assumption the rest of the app makes
 * about "local" meaning the site's own time).
 */
export function getEarlySubmissionFlag(entry: {
  entry_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  created_at?: string | null;
}): 'BEFORE_START' | 'BEFORE_END' | null {
  if (!entry.entry_date || !entry.created_at) return null;
  const createdAt = new Date(entry.created_at);
  if (isNaN(createdAt.getTime())) return null;

  if (entry.start_time) {
    const startAt = new Date(`${entry.entry_date}T${entry.start_time}:00`);
    if (!isNaN(startAt.getTime()) && createdAt < startAt) return 'BEFORE_START';
  }
  if (entry.end_time) {
    const endAt = new Date(`${entry.entry_date}T${entry.end_time}:00`);
    if (!isNaN(endAt.getTime()) && createdAt < endAt) return 'BEFORE_END';
  }
  return null;
}
