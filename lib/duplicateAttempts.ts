import { supabase } from './supabase';

// Best-effort: the foreman still gets their warning even if this can't be saved
// (e.g. the table hasn't been created yet or the connection just dropped).
export async function logDuplicateAttempt(attempt: {
  entryType: 'equipment' | 'labour' | 'material';
  entryDate: string;
  detail: string;
  userId?: string | null;
  foremanName?: string | null;
}) {
  try {
    const { error } = await supabase.from('duplicate_attempts').insert({
      entry_type: attempt.entryType,
      entry_date: attempt.entryDate,
      detail: attempt.detail,
      attempted_by: attempt.userId || null,
      foreman_name: attempt.foremanName || null,
    });
    if (error) console.error('Could not record duplicate attempt:', error);
  } catch (err) {
    console.error('Could not record duplicate attempt:', err);
  }
}
