import { useCallback, useEffect, useRef, useState } from "react";

const serialize = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
};

export function useUnsavedGuard<T>({
  value,
  enabled,
  onSave,
  onLeave,
}: {
  value: T;
  enabled: boolean;
  onSave: () => Promise<unknown> | unknown;
  onLeave: () => void;
}) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const [baseline, setBaseline] = useState(() => serialize(value));
  const [savedTick, setSavedTick] = useState(0);
  const [autoSave, setAutoSave] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const dirty = enabled && serialize(value) !== baseline;

  useEffect(() => {
    if (savedTick === 0) return;
    setBaseline(serialize(valueRef.current));
  }, [savedTick, value]);

  const markSaved = useCallback(() => setSavedTick((tick) => tick + 1), []);

  const runSave = useCallback(async () => {
    setBusy(true);
    try {
      const saved = await onSave();
      if (saved === null || saved === false) return false;
      markSaved();
      return true;
    } finally {
      setBusy(false);
    }
  }, [onSave, markSaved]);

  // Auto save (debounced) when the switch is on.
  useEffect(() => {
    if (!autoSave || !dirty || busy) return;
    const timer = setTimeout(() => {
      void runSave();
    }, 1500);
    return () => clearTimeout(timer);
  }, [autoSave, dirty, busy, runSave]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const requestLeave = useCallback(() => {
    if (dirty) {
      setAskOpen(true);
      return;
    }
    onLeave();
  }, [dirty, onLeave]);

  const confirmSave = useCallback(async () => {
    const ok = await runSave();
    if (!ok) return;
    setAskOpen(false);
    onLeave();
  }, [runSave, onLeave]);

  const discard = useCallback(() => {
    setAskOpen(false);
    onLeave();
  }, [onLeave]);

  return {
    dirty,
    autoSave,
    setAutoSave,
    askOpen,
    busy,
    markSaved,
    requestLeave,
    confirmSave,
    discard,
    cancel: () => setAskOpen(false),
  };
}

export function UnsavedChangesDialog({
  open,
  name,
  busy,
  onSave,
  onDiscard,
  onCancel,
}: {
  open: boolean;
  name: string;
  busy?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="ro-modal-backdrop" role="dialog" aria-modal="true">
      <div className="ro-modal" style={{ maxWidth: 420 }}>
        <h3>Save changes?</h3>
        <p>Want to save your changes to &lsquo;{name}&rsquo;?</p>
        <div className="ro-modal-actions">
          <button className="app-button primary" onClick={onSave} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="app-button secondary" onClick={onDiscard} disabled={busy}>
            Don&apos;t Save
          </button>
          <button className="app-button secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function AutoSaveSwitch({
  checked,
  onChange,
  dirty,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  dirty?: boolean;
}) {
  return (
    <label className="autosave-switch" title="Save changes automatically while you edit">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="autosave-track" aria-hidden="true"><span className="autosave-thumb" /></span>
      <span>Auto save{checked && dirty ? " · saving…" : ""}</span>
    </label>
  );
}
