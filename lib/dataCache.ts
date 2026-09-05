import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Wraps a Supabase fetch with an on-device fallback. Jobs/suppliers/equipment
 * don't change minute-to-minute, so if the live fetch fails (no signal), falling
 * back to whatever was last successfully fetched keeps a foreman's Job/Supplier/
 * Equipment pickers populated through a dead zone instead of coming up empty --
 * the same "worked with signal this morning, still usable later" scenario the
 * offline entry queue (lib/offlineQueue.ts) already covers for Submit.
 */
export async function fetchWithCache<T>(
  cacheKey: string,
  // Supabase's query builder is a thenable (has .then()) but not a strict Promise
  // (no .catch()/.finally()), so this accepts PromiseLike rather than Promise --
  // otherwise every call site would need an extra Promise.resolve(...) wrapper.
  fetchFn: () => PromiseLike<{ data: T | null; error: any }>
): Promise<{ data: T | null; fromCache: boolean }> {
  const storageKey = `data_cache:${cacheKey}`;
  try {
    const { data, error } = await fetchFn();
    if (error) throw error;
    if (data) {
      AsyncStorage.setItem(storageKey, JSON.stringify(data)).catch(err =>
        console.error('Failed to update data cache:', err)
      );
    }
    return { data, fromCache: false };
  } catch (err) {
    try {
      const cached = await AsyncStorage.getItem(storageKey);
      if (cached) return { data: JSON.parse(cached), fromCache: true };
    } catch (cacheErr) {
      console.error('Failed to read data cache:', cacheErr);
    }
    return { data: null, fromCache: false };
  }
}
