import React from 'react';
import { Link2 } from 'lucide-react';
import type { FieldDefinition } from '../../types';
import { validateSubmissionData } from '../../lib/services/validateSubmission';
import { EvidenceInput, type EvidenceValue } from '../common/EvidenceInput';

/**
 * The questions of a service form, as a POC answers them.
 *
 * One renderer for the POC desk, the admin "Fill" dialog and the form
 * builder's preview, so what an admin previews is exactly what a POC gets.
 */

interface ServiceFieldListProps {
  fields: FieldDefinition[];
  values: Record<string, unknown>;
  onValue: (key: string, value: unknown) => void;
  evidence: Record<string, EvidenceValue | null>;
  onEvidence: (key: string, value: EvidenceValue | null) => void;
  errors?: Record<string, string>;
  serviceCode: string;
  siteCode?: string;
  /** In the builder: links cannot be attached, since there is no site or saved service yet. */
  preview?: boolean;
  idPrefix?: string;
}

/** A form's answers as saved, and what is wrong with them, keyed by question. */
export function collectEntry(
  fields: FieldDefinition[],
  values: Record<string, unknown>,
  evidence: Record<string, EvidenceValue | null>,
): { data: Record<string, unknown>; errors: Record<string, string> } {
  const data: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.type === 'evidence') data[f.key] = evidence[f.key]?.id ?? evidence[f.key]?.url ?? '';
    else if (values[f.key] !== undefined) data[f.key] = values[f.key];
  }
  const errors: Record<string, string> = {};
  for (const e of validateSubmissionData(fields.filter((f) => f.type !== 'evidence'), data)) {
    errors[e.field] ??= e.message;
  }
  for (const f of fields) {
    if (f.type === 'evidence' && f.required && !data[f.key]) errors[f.key] = `${f.label}: attach a link.`;
  }
  return { data, errors };
}

export const ServiceFieldList: React.FC<ServiceFieldListProps> = ({
  fields,
  values,
  onValue,
  evidence,
  onEvidence,
  errors = {},
  serviceCode,
  siteCode,
  preview,
  idPrefix = 'q',
}) => (
  <div className="space-y-4">
    {fields.map((f) => {
      const err = errors[f.key];
      const id = `${idPrefix}-${f.key}`;
      const base = `w-full px-3 py-2.5 text-sm bg-slate-50 border rounded-lg focus:outline-none focus:bg-white ${
        err ? 'border-rose-300' : 'border-slate-200 focus:border-slate-400'
      }`;
      const v = values[f.key];
      const numeric = f.type === 'number' || f.type === 'percentage' || f.type === 'temperature';

      const label = (
        <label htmlFor={id} className="text-xs font-semibold text-slate-700">
          {f.label} {f.required && <span className="text-rose-600">*</span>}
          {f.unit && <span className="text-slate-500 font-normal"> ({f.unit})</span>}
        </label>
      );

      return (
        <div key={f.key} className="space-y-1">
          {f.type === 'evidence' && !preview ? (
            <EvidenceInput
              label={f.label}
              required={f.required}
              serviceCode={serviceCode}
              siteCode={siteCode ?? ''}
              value={evidence[f.key] ?? null}
              onChange={(ev) => onEvidence(f.key, ev)}
            />
          ) : (
            <>
              {label}
              {f.type === 'evidence' ? (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link2 className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input id={id} disabled placeholder="Paste a Google Drive link" className={`${base} pl-8`} />
                  </div>
                  <button type="button" disabled className="px-3 rounded-lg bg-slate-200 text-slate-500 text-xs font-semibold">
                    Attach
                  </button>
                </div>
              ) : f.type === 'select' ? (
                <select id={id} value={String(v ?? '')} onChange={(e) => onValue(f.key, e.target.value)} className={base}>
                  <option value="">Choose</option>
                  {(f.options ?? []).filter(Boolean).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : f.type === 'boolean' ? (
                <div className="flex gap-2" role="group" aria-labelledby={id}>
                  {['Yes', 'No'].map((o) => (
                    <button
                      key={o}
                      id={o === 'Yes' ? id : undefined}
                      type="button"
                      aria-pressed={v === o}
                      onClick={() => onValue(f.key, o)}
                      className={`flex-1 h-10 rounded-lg border text-sm font-semibold transition active:scale-[0.98] cursor-pointer ${
                        v === o ? 'bg-(--color-ink) text-white border-(--color-ink)' : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              ) : f.type === 'textarea' ? (
                <textarea id={id} rows={3} value={String(v ?? '')} onChange={(e) => onValue(f.key, e.target.value)} className={base} />
              ) : (
                <input
                  id={id}
                  type={f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : numeric ? 'number' : 'text'}
                  inputMode={numeric ? 'decimal' : undefined}
                  min={f.min}
                  max={f.max}
                  step="any"
                  value={String(v ?? '')}
                  onChange={(e) => onValue(f.key, e.target.value)}
                  className={base}
                />
              )}
            </>
          )}
          {f.helperText && !err && <p className="text-[11px] text-slate-500">{f.helperText}</p>}
          {err && <p className="text-[11px] text-rose-600">{err}</p>}
        </div>
      );
    })}
  </div>
);
