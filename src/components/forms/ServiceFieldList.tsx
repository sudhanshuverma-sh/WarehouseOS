import React from 'react';
import { AlertTriangle, Camera, Link2 } from 'lucide-react';
import type { FieldDefinition } from '../../types';
import { validateSubmissionData } from '../../lib/services/validateSubmission';
import { commentKey, isShown, keyMap, openFollowUp, photoKey, pruneEntry } from '../../lib/services/formLogic';
import { EvidenceInput, type EvidenceValue } from '../common/EvidenceInput';
import { PhotoCapture } from '../common/PhotoCapture';

/**
 * The questions of a service form, as a POC answers them.
 *
 * One renderer for the POC desk, the admin "Fill" dialog and the form
 * builder's preview, so what an admin previews is exactly what a POC gets.
 *
 * It also carries out what the builder set: section headings, questions shown
 * only after a certain answer, and answers that open a follow-up — a comment,
 * a photo — and, when they count as an issue, mark it in red.
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

/**
 * A form's answers as saved, and what is wrong with them, keyed by question.
 * `status: false` is for the extra questions of a screen that keeps its own
 * status: their answers never set it.
 */
export function collectEntry(
  fields: FieldDefinition[],
  values: Record<string, unknown>,
  evidence: Record<string, EvidenceValue | null>,
  { status = true }: { status?: boolean } = {},
): { data: Record<string, unknown>; errors: Record<string, string> } {
  const raw: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.type === 'section') continue;
    if (f.type === 'evidence') raw[f.key] = evidence[f.key]?.id ?? evidence[f.key]?.url ?? '';
    else if (values[f.key] !== undefined) raw[f.key] = values[f.key];
    for (const k of [commentKey(f.key), photoKey(f.key)]) if (values[k] !== undefined && values[k] !== '') raw[k] = values[k];
  }
  // No answer to a question that was not asked, no follow-up the answer did not open.
  const data = pruneEntry(fields, raw, { status });
  const byKey = keyMap(fields);
  const errors: Record<string, string> = {};
  for (const e of validateSubmissionData(fields.filter((f) => f.type !== 'evidence'), data)) {
    errors[e.field] ??= e.message;
  }
  for (const f of fields) {
    if (f.type === 'evidence' && f.required && isShown(f, data, byKey) && !data[f.key]) errors[f.key] = `${f.label}: attach a link.`;
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
}) => {
  const byKey = keyMap(fields);
  return (
  <div className="space-y-4">
    {fields.map((f) => {
      if (!isShown(f, values, byKey)) return null;
      if (f.type === 'section') {
        return (
          <div key={f.key} className="pt-2 first:pt-0">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-teal-700">{f.label}</h3>
            {f.helperText && <p className="mt-0.5 text-[11px] text-slate-500">{f.helperText}</p>}
          </div>
        );
      }
      const err = errors[f.key];
      const fu = openFollowUp(f, values[f.key]);
      const cKey = commentKey(f.key);
      const pKey = photoKey(f.key);
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
                  {['Yes', 'No'].map((o) => {
                    const picked = v === o;
                    // An answer that is an issue shows red once picked.
                    const bad = picked && f.followUp?.issue && f.followUp.when.includes(o);
                    return (
                      <button
                        key={o}
                        id={o === 'Yes' ? id : undefined}
                        type="button"
                        aria-pressed={picked}
                        onClick={() => onValue(f.key, o)}
                        className={`flex-1 h-10 rounded-lg border text-sm font-semibold transition active:scale-[0.98] cursor-pointer ${
                          bad
                            ? 'bg-rose-50 text-rose-700 border-rose-500'
                            : picked
                              ? 'bg-(--color-ink) text-white border-(--color-ink)'
                              : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        {o}
                      </button>
                    );
                  })}
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

          {fu && (fu.comment !== 'off' || fu.photo !== 'off' || fu.issue) && (
            <div
              className={`mt-2 p-3 rounded-r-lg border-l-4 space-y-2 ${
                fu.issue ? 'bg-rose-50 border-rose-500' : 'bg-slate-50 border-slate-400'
              }`}
            >
              {fu.issue && (
                <p className="text-[11px] font-semibold text-rose-700 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> This answer is reported as an issue.
                </p>
              )}
              {fu.comment !== 'off' && (
                <div>
                  <label
                    htmlFor={`${id}-comment`}
                    className={`block text-[11px] font-medium mb-1 ${fu.issue ? 'text-rose-700' : 'text-slate-700'}`}
                  >
                    {fu.prompt?.trim() || 'Why? Say what is wrong — which unit, where.'}
                    {fu.comment === 'required' ? <span className="text-rose-600"> *</span> : <span className="text-slate-500"> (optional)</span>}
                  </label>
                  <textarea
                    id={`${id}-comment`}
                    rows={2}
                    value={String(values[cKey] ?? '')}
                    onChange={(e) => onValue(cKey, e.target.value)}
                    className={`${base} bg-white`}
                  />
                  {errors[cKey] && <p className="text-[11px] text-rose-600 mt-1">{errors[cKey]}</p>}
                </div>
              )}
              {fu.photo !== 'off' &&
                (preview ? (
                  <button
                    type="button"
                    disabled
                    className="w-full min-h-10 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 text-slate-500 text-xs font-semibold"
                  >
                    <Camera className="w-4 h-4" /> Take or attach a photo {fu.photo === 'required' ? '— required' : '(optional)'}
                  </button>
                ) : (
                  <div>
                    <PhotoCapture
                      serviceCode={serviceCode}
                      siteCode={siteCode ?? ''}
                      name={f.key}
                      required={fu.photo === 'required'}
                      value={typeof values[pKey] === 'string' && values[pKey] ? (values[pKey] as string) : undefined}
                      onChange={(ref) => onValue(pKey, ref ?? '')}
                    />
                    {errors[pKey] && <p className="text-[11px] text-rose-600 mt-1">{errors[pKey]}</p>}
                  </div>
                ))}
            </div>
          )}
        </div>
      );
    })}
  </div>
  );
};
