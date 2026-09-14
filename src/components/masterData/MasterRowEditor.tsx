import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Lock, AlertTriangle } from 'lucide-react';
import { Button } from '../common/Button';
import { Toggle } from '../common/Toggle';
import type { FieldDef } from './fieldConfigs';
import { errorsByField, type EditMode, type FieldError, type MasterWriteResult } from '../../lib/masterData/validate';

/**
 * A side drawer for creating or editing one master-data row.
 *
 * Config-driven: Site_Master and Service_Registry are the same component with
 * a different field list, so both behave identically — same locked key, same
 * inline errors, same save states.
 *
 * A form rather than inline cell editing, deliberately. Inline editing makes
 * it easy to overtype a Site_Code, and a Site_Code is the one value here that
 * must never change once other records point at it.
 */

export interface MasterRowEditorProps<Row> {
  open: boolean;
  mode: EditMode;
  title: string;
  keyField: string;
  fields: FieldDef[];
  initial: Partial<Row>;
  onClose: () => void;
  onSave: (row: Partial<Row>, mode: EditMode, originalKey?: string) => Promise<MasterWriteResult>;
  /** Lets the caller react to a change, e.g. suggest a Site_Code when State is picked. */
  derive?: (next: Partial<Row>, changed: string, mode: EditMode) => Partial<Row>;
}

const inputBase =
  'w-full px-3 py-2 text-xs rounded-lg border bg-white text-slate-900 ' +
  'transition-[border-color,box-shadow] duration-(--motion-fast) ease-(--ease-standard) ' +
  'focus:outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200';

export function MasterRowEditor<Row>({
  open, mode, title, keyField, fields, initial, onClose, onSave, derive,
}: MasterRowEditorProps<Row>) {
  const [row, setRow] = useState<Partial<Row>>(initial);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const firstInput = useRef<HTMLInputElement | null>(null);

  // Reset whenever the drawer opens on a different row.
  useEffect(() => {
    if (open) {
      setRow(initial);
      setErrors([]);
      setMessage(null);
      setSaved(false);
      // Focus lands on the first editable field, so double-click → type works.
      window.setTimeout(() => firstInput.current?.focus(), 60);
    }
  }, [open, initial]);

  const originalKey = mode === 'edit' ? String((initial as Record<string, unknown>)[keyField] ?? '') : undefined;
  const dirty = useMemo(() => JSON.stringify(row) !== JSON.stringify(initial), [row, initial]);
  const fieldErrors = errorsByField(errors);

  const requestClose = () => {
    if (saving) return;
    if (dirty && !saved && !window.confirm('Discard your unsaved changes?')) return;
    onClose();
  };

  // Esc closes, with the same unsaved-changes guard as the ✕.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open) return null;

  const set = (name: string, value: string) => {
    let next = { ...row, [name]: value } as Partial<Row>;
    if (derive) next = derive(next, name, mode);
    setRow(next);
    // Clear this field's error as soon as it is edited — leaving a red
    // message under a field the admin has just fixed reads as "still wrong".
    if (fieldErrors[name]) setErrors((prev) => prev.filter((e) => e.field !== name));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await onSave(row, mode, originalKey);
      if (res.success) {
        setErrors([]);
        setSaved(true);
        setMessage(res.message);
        window.setTimeout(onClose, 900);
      } else {
        setErrors(res.errors ?? []);
        setMessage(res.message);
      }
    } finally {
      setSaving(false);
    }
  };

  let firstAssigned = false;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={requestClose} />

      <form
        className="relative h-full w-full max-w-xl bg-white shadow-2xl flex flex-col animate-pop-in"
        style={{ '--pop-origin': 'center right' } as React.CSSProperties}
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {mode === 'create' ? 'New row' : 'Editing'}
            </p>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
          </div>
          <button type="button" onClick={requestClose} aria-label="Close editor" className="p-1 text-slate-400 hover:text-slate-800 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            {fields.map((f) => {
              const value = String((row as Record<string, unknown>)[f.name] ?? '');
              const locked = mode === 'edit' && f.name === keyField;
              const err = fieldErrors[f.name];
              const border = err ? 'border-rose-400' : 'border-slate-300';
              const assignRef = !locked && !firstAssigned;
              if (assignRef) firstAssigned = true;
              const id = `mre-${f.name}`;

              return (
                <React.Fragment key={f.name}>
                  {f.section && (
                    <p className="col-span-2 pt-2 first:pt-0 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">
                      {f.section}
                    </p>
                  )}
                  <div className={f.wide || f.kind === 'textarea' ? 'col-span-2' : ''}>
                    {f.kind !== 'yesno' && (
                      <label htmlFor={id} className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 mb-1">
                        {f.label}
                        {f.required && <span className="text-rose-500">*</span>}
                        {locked && <Lock className="w-3 h-3 text-slate-400" />}
                      </label>
                    )}

                    {f.kind === 'yesno' ? (
                      <div className="pt-4">
                        <Toggle
                          checked={value === 'Yes'}
                          onChange={(on) => set(f.name, on ? 'Yes' : 'No')}
                          label={f.label}
                          description={f.hint}
                          size="sm"
                        />
                      </div>
                    ) : f.kind === 'select' ? (
                      <select id={id} value={value} onChange={(e) => set(f.name, e.target.value)} className={`${inputBase} ${border} cursor-pointer`}>
                        <option value="">Select…</option>
                        {f.options?.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : f.kind === 'textarea' ? (
                      <textarea id={id} value={value} rows={2} onChange={(e) => set(f.name, e.target.value)} className={`${inputBase} ${border} resize-y`} />
                    ) : (
                      <input
                        id={id}
                        ref={assignRef ? firstInput : undefined}
                        type={f.kind === 'url' ? 'url' : f.kind}
                        value={value}
                        readOnly={locked}
                        onChange={(e) => set(f.name, e.target.value)}
                        className={`${inputBase} ${border} ${locked ? 'bg-slate-100 text-slate-500 cursor-not-allowed font-mono' : ''} ${f.name.endsWith('_Code') ? 'font-mono' : ''}`}
                      />
                    )}

                    {err ? (
                      <p className="mt-1 text-[11px] text-rose-700 animate-settle">{err}</p>
                    ) : locked ? (
                      <p className="mt-1 text-[10px] text-slate-400">Codes never change — other records point at them.</p>
                    ) : f.hint && f.kind !== 'yesno' ? (
                      <p className="mt-1 text-[10px] text-slate-400">{f.hint}</p>
                    ) : null}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="border-t border-slate-100 px-6 py-3.5 space-y-2">
          {message && !saved && (
            <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-start gap-1.5 animate-settle">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {message}
            </p>
          )}
          {message && saved && <p className="text-[11px] text-emerald-800 animate-settle">{message}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={requestClose} disabled={saving}>Cancel</Button>
            <Button
              variant="primary"
              type="submit"
              loading={saving}
              success={saved}
              successLabel={mode === 'create' ? 'Added' : 'Saved'}
              disabled={mode === 'edit' && !dirty}
            >
              {mode === 'create' ? 'Add row' : 'Save changes'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
