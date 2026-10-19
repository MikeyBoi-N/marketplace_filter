import { useCallback, useEffect, useRef, useState } from 'react';
import { loadFilters, saveFilters, watchFilters, type Filters } from '@/lib/filters';

const SAVE_DELAY_MS = 300;

/**
 * Filters backed by extension storage (the single source of truth shared with the
 * controller and the map window). Local edits apply instantly and are saved debounced.
 */
export function useFilters() {
  const [filters, setFilters] = useState<Filters | null>(null);
  const current = useRef<Filters | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    loadFilters().then((f) => {
      if (!alive) return;
      current.current = f;
      setFilters(f);
    });
    const stop = watchFilters((f) => {
      // Ignore echoes while our own edit is still waiting to be saved.
      if (saveTimer.current !== undefined) return;
      current.current = f;
      setFilters(f);
    });
    return () => {
      alive = false;
      stop();
    };
  }, []);

  const update = useCallback((patch: Partial<Filters>) => {
    if (!current.current) return;
    const next = { ...current.current, ...patch };
    current.current = next;
    setFilters(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = undefined;
      void saveFilters(next);
    }, SAVE_DELAY_MS);
  }, []);

  return [filters, update] as const;
}
