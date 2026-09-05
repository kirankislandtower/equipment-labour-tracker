import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { uploadToCloudinary, getWatermarkedCloudinaryUrl } from './cloudinary';

export type QueuedEntryType = 'equipment' | 'labour' | 'material';

export interface QueuedEntry {
  id: string;
  type: QueuedEntryType;
  table: string;
  photoColumn: string;
  payload: Record<string, any>;
  photoDataUri: string | null;
  /**
   * ISO string for the exact moment the photo was taken (not when this queued entry
   * eventually gets synced) -- an entry can sit here for hours waiting for signal,
   * and the watermark stamp needs to prove when the photo was really taken, not when
   * it happened to upload. Null when there's no photo to stamp.
   */
  photoCapturedAt: string | null;
  watermarkJobLabel: string;
  downloadFilePrefix: string;
  createdAt: string;
  displayDate: string;
  /**
   * Pre-resolved display fields, shaped to match the exact nested structure the
   * real Supabase-joined row has (e.g. equipment_master.equipment_name, jobs.job_name)
   * so History can render a queued entry with the same code path as a synced one,
   * entirely offline -- no network lookup needed to show it.
   */
  display: Record<string, any>;
}

const QUEUE_KEY = '@offline_entry_queue';

async function readQueue(): Promise<QueuedEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read offline queue:', err);
    return [];
  }
}

async function writeQueue(queue: QueuedEntry[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueEntry(entry: Omit<QueuedEntry, 'id' | 'createdAt'>): Promise<void> {
  const queue = await readQueue();
  queue.push({
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
  });
  await writeQueue(queue);
}

export async function getQueuedEntries(): Promise<QueuedEntry[]> {
  return readQueue();
}

let processing = false;

/**
 * Uploads every queued entry's photo (if any) and inserts it into its real
 * table, removing it from the queue on success. Safe to call repeatedly --
 * a concurrent call while one is already running is a no-op, and an entry
 * that fails (still offline, or a real server error) just stays queued for
 * the next call instead of being lost.
 */
export async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    const queue = await readQueue();
    if (queue.length === 0) return;

    const remaining: QueuedEntry[] = [];
    for (const entry of queue) {
      try {
        let photoUrl = entry.payload[entry.photoColumn];

        if (entry.photoDataUri) {
          const rawCloudinaryUrl = await uploadToCloudinary(entry.photoDataUri);
          const capturedAt = entry.photoCapturedAt ? new Date(entry.photoCapturedAt) : undefined;
          photoUrl = getWatermarkedCloudinaryUrl(rawCloudinaryUrl, entry.watermarkJobLabel, capturedAt);
        }

        const { error } = await supabase
          .from(entry.table)
          .insert({ ...entry.payload, [entry.photoColumn]: photoUrl });

        if (error) throw error;
        // Successfully synced -- drop it from the queue.
      } catch (err) {
        console.error(`Failed to sync queued ${entry.type} entry, will retry later:`, err);
        remaining.push(entry);
      }
    }

    await writeQueue(remaining);
  } finally {
    processing = false;
  }
}
