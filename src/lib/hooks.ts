"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type State<T> = { data: T | null; error: string | null; loading: boolean };

/** Muat data sekali (dan saat `reload` dipanggil). `fn` mengembalikan data atau melempar Error. */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const run = useCallback(async () => {
    try {
      const data = await fnRef.current();
      setState({ data, error: null, loading: false });
    } catch (e) {
      setState({ data: null, error: e instanceof Error ? e.message : "error", loading: false });
    }
  }, []);

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    await run();
  }, [run]);

  // Muat saat mount dan saat deps berubah; setState terjadi setelah await.
  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload };
}

/** Lempar Error berisi pesan API bila gagal, agar cocok dengan useAsync. */
export function unwrap<T>(
  result: { data?: T; error?: unknown },
  toMessage: (e: unknown) => string,
): T {
  if (result.data === undefined) throw new Error(toMessage(result.error));
  return result.data;
}
