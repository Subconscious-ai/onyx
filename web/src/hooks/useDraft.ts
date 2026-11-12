"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_PREFIX = "onyx:draft";

export function draftKey(scope: string, entityId: string): string {
  return `${STORAGE_PREFIX}:${scope}:${entityId}`;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    // sessionStorage access throws when storage is blocked.
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function clearDraft(key: string) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
}

function defaultIsEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

export interface UseDraftOptions<T> {
  key: string;
  debounceMs?: number;
  isEmpty?: (value: T) => boolean;
}

export interface UseDraftReturn<T> {
  draft: T | null;
  // Distinguishes "not read yet" from "read, nothing there".
  loaded: boolean;
  hasDraft: boolean;
  // Debounced; empty text retains any bounded handoff receipts.
  save: (value: T) => void;
  saveHandoff: (value: T, id: string) => boolean;
  hasHandoff: (id: string) => boolean;
  // Clears text immediately and cancels pending writes; handoff receipts remain.
  clear: () => void;
}

export function useDraft<T>({
  key,
  debounceMs = 300,
  isEmpty = defaultIsEmpty,
}: UseDraftOptions<T>): UseDraftReturn<T> {
  // Key-tagged so `loaded` is derived, giving a false->true edge on every key
  // change that consumers rely on to re-seed.
  const [entry, setEntry] = useState<{ key: string; draft: T | null } | null>(
    null
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEmptyRef = useRef(isEmpty);
  const handoffIdsRef = useRef<string[]>([]);

  useEffect(() => {
    isEmptyRef.current = isEmpty;
  }, [isEmpty]);

  useEffect(() => {
    handoffIdsRef.current = [];
    const storage = getStorage();
    if (!storage) {
      setEntry({ key, draft: null });
      return;
    }
    try {
      const raw = storage.getItem(key);
      const parsed = raw === null ? null : JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        parsed.onyxDraftHandoffs === 1 &&
        Array.isArray(parsed.ids) &&
        parsed.ids.length <= 32 &&
        parsed.ids.every((id: unknown) => typeof id === "string")
      ) {
        handoffIdsRef.current = parsed.ids;
        // SAFETY: The envelope holds the same caller-owned T previously stored at this key.
        setEntry({ key, draft: parsed.value as T | null });
      } else {
        // SAFETY: Legacy values retain this hook's existing caller-owned T contract.
        setEntry({ key, draft: parsed as T | null });
      }
    } catch {
      setEntry({ key, draft: null });
    }
  }, [key]);

  // Cancel a pending write on key change/unmount so it can't land under the old
  // key.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [key]);

  const persist = useCallback(
    (value: T | null, ids: string[]) => {
      const storage = getStorage();
      if (!storage) return false;
      try {
        if (!ids.length && (value === null || isEmptyRef.current(value)))
          storage.removeItem(key);
        else
          storage.setItem(
            key,
            JSON.stringify(
              ids.length ? { onyxDraftHandoffs: 1, value, ids } : value
            )
          );
        return true;
      } catch {
        return false;
      }
    },
    [key]
  );

  // Keep receipt metadata with the text in one write before the sender drops its copy.
  const saveHandoff = useCallback(
    (value: T, id: string) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const ids = [
        ...handoffIdsRef.current
          .filter((previous) => previous !== id)
          .slice(-31),
        id,
      ];
      handoffIdsRef.current = ids;
      return persist(value, ids);
    },
    [persist]
  );
  const hasHandoff = useCallback(
    (id: string) => handoffIdsRef.current.includes(id),
    []
  );

  const save = useCallback(
    (value: T) => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        persist(value, handoffIdsRef.current);
      }, debounceMs);
    },
    [persist, debounceMs]
  );

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    persist(null, handoffIdsRef.current);
    setEntry({ key, draft: null });
  }, [key, persist]);

  const loaded = entry !== null && entry.key === key;
  const draft = loaded ? entry.draft : null;
  const hasDraft = draft !== null && !isEmpty(draft);

  return { draft, loaded, hasDraft, save, saveHandoff, hasHandoff, clear };
}
