import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Editable state with Ctrl+Z / Ctrl+Y history.
 *
 * Rapid changes (typing) are coalesced into one history entry so a single undo
 * steps back a whole word instead of one character.
 */
const COALESCE_MS = 500;
const LIMIT = 200;

export function useHistoryState<T>(initial: T | (() => T)) {
  const [value, setValue] = useState<T>(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const lastPush = useRef(0);
  const skipHistory = useRef(false);

  const set = useCallback((next: T | ((current: T) => T)) => {
    setValue((current) => {
      const resolved = typeof next === "function" ? (next as (c: T) => T)(current) : next;
      if (resolved === current) return current;
      if (skipHistory.current) {
        skipHistory.current = false;
      } else {
        const now = Date.now();
        if (now - lastPush.current > COALESCE_MS || past.current.length === 0) {
          past.current = [...past.current.slice(-LIMIT), current];
        }
        lastPush.current = now;
        future.current = [];
      }
      return resolved;
    });
  }, []);

  /** Replaces the value without adding a history entry (e.g. loading saved data). */
  const reset = useCallback((next: T) => {
    past.current = [];
    future.current = [];
    setValue(next);
  }, []);

  const undo = useCallback(() => {
    if (!past.current.length) return false;
    const previous = past.current[past.current.length - 1]!;
    past.current = past.current.slice(0, -1);
    setValue((current) => {
      future.current = [...future.current, current];
      return previous;
    });
    return true;
  }, []);

  const redo = useCallback(() => {
    if (!future.current.length) return false;
    const next = future.current[future.current.length - 1]!;
    future.current = future.current.slice(0, -1);
    setValue((current) => {
      past.current = [...past.current, current];
      return next;
    });
    return true;
  }, []);

  useUndoRedoKeys(undo, redo);

  return { value, set, reset, undo, redo } as const;
}

/** Ctrl+Z undoes and Ctrl+Y (or Ctrl+Shift+Z) redoes, anywhere on the page. */
export function useUndoRedoKeys(undo: () => boolean, redo: () => boolean) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const key = event.key.toLowerCase();
      const isUndo = key === "z" && !event.shiftKey;
      const isRedo = key === "y" || (key === "z" && event.shiftKey);
      if (!isUndo && !isRedo) return;
      const handled = isUndo ? undo() : redo();
      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);
}

/**
 * Whole-screen undo for editors that keep many separate pieces of state.
 *
 * Pass a snapshot of everything editable plus a function that puts a snapshot
 * back. Changes are recorded after a short pause, so typing groups into one
 * step, and Ctrl+Z / Ctrl+Y walk through those steps.
 */
export function useSnapshotHistory<T>(snapshot: T, apply: (value: T) => void) {
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);
  const current = useRef<string>("");
  const restoring = useRef(false);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const serialised = JSON.stringify(snapshot ?? null);

  useEffect(() => {
    if (!current.current) {
      current.current = serialised;
      return;
    }
    if (serialised === current.current) return;
    if (restoring.current) {
      restoring.current = false;
      current.current = serialised;
      return;
    }
    const previous = current.current;
    const timer = setTimeout(() => {
      past.current = [...past.current.slice(-LIMIT), previous];
      future.current = [];
      current.current = serialised;
    }, COALESCE_MS);
    return () => clearTimeout(timer);
  }, [serialised]);

  const step = useCallback((from: "past" | "future") => {
    const source = from === "past" ? past : future;
    const target = from === "past" ? future : past;
    if (!source.current.length) return false;
    const next = source.current[source.current.length - 1]!;
    source.current = source.current.slice(0, -1);
    target.current = [...target.current, current.current];
    restoring.current = true;
    current.current = next;
    applyRef.current(JSON.parse(next) as T);
    return true;
  }, []);

  const undo = useCallback(() => step("past"), [step]);
  const redo = useCallback(() => step("future"), [step]);

  useUndoRedoKeys(undo, redo);

  return { undo, redo } as const;
}
