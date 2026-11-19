import { useCallback, useEffect, useRef, useState } from 'react';
import { getApi } from './index';

export interface LiveData<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/**
 * Loads data and keeps it fresh: reloads on realtime changes (Supabase
 * postgres_changes, or demo-store events) and when the tab regains focus.
 */
export function useLiveData<T>(loader: () => Promise<T>, deps: unknown[]): LiveData<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const seq = useRef(0);

  const run = useCallback(() => {
    const id = ++seq.current;
    loaderRef
      .current()
      .then((value) => {
        if (id !== seq.current) return;
        setData(value);
        setError(null);
      })
      .catch((err: unknown) => {
        if (id !== seq.current) return;
        setError(err);
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    setData(undefined);
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(run, 250);
    };
    const unsubscribe = getApi().subscribe(schedule);
    const onFocus = () => schedule();
    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      unsubscribe();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [run]);

  return { data, error, loading, reload: run };
}
