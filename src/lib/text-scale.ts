import { useCallback, useMemo, useState } from "react";

/**
 * Per-document text sizing. The key is a schedule column id (e.g. "cost"),
 * the value a multiplier applied to that column's font size in the PDF.
 * Saved with the document, so it only affects that one file.
 */
export type TextScales = Record<string, number>;

export const SCALE_MIN = 0.6;
export const SCALE_MAX = 2.2;
export const SCALE_STEP = 0.1;

export const clampScale = (value: number) =>
  Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(value * 100) / 100));

/** Multiplier saved for one column (1 = untouched). */
export const columnScale = (scales: TextScales | undefined, id: string | null | undefined) =>
  id ? clampScale(Number(scales?.[id] ?? 1) || 1) : 1;

/** Font size for a column, never small enough to disappear. */
export const scaledFontSize = (size: number, scale: number) => Math.max(3.5, size * scale);

/** Read a persisted snapshot value back into a scale map. */
export function readTextScales(value: unknown): TextScales {
  if (!value || typeof value !== "object") return {};
  const scales: TextScales = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) scales[key] = clampScale(num);
  }
  return scales;
}

/** Undo / redo history over the text size map of one document. */
export function useTextScales(initial: TextScales) {
  const [history, setHistory] = useState<TextScales[]>([initial]);
  const [index, setIndex] = useState(0);
  const scales = useMemo(() => history[index] ?? {}, [history, index]);

  const commit = useCallback((next: TextScales) => {
    setHistory((prev) => [...prev.slice(0, index + 1), next]);
    setIndex(index + 1);
  }, [index]);

  const bump = useCallback((id: string, delta: number) => {
    const current = columnScale(scales, id);
    const next = clampScale(current + delta);
    if (next === current) return;
    commit({ ...scales, [id]: next });
  }, [commit, scales]);

  const resetColumn = useCallback((id: string) => {
    if (scales[id] === undefined) return;
    const next = { ...scales };
    delete next[id];
    commit(next);
  }, [commit, scales]);

  return {
    scales,
    bump,
    resetColumn,
    undo: () => setIndex((i) => Math.max(0, i - 1)),
    redo: () => setIndex((i) => Math.min(history.length - 1, i + 1)),
    canUndo: index > 0,
    canRedo: index < history.length - 1,
  };
}

export type TextScaleController = ReturnType<typeof useTextScales>;
