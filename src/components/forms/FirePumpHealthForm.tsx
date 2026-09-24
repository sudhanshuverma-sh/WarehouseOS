import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Flame, Info, Save, ShieldAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageHeader } from '../common/PageHeader';
import { AlreadyFiled } from '../common/AlreadyFiled';
import { PhotoCapture } from '../common/PhotoCapture';
import { useExtraQuestions } from './ExtraQuestions';
import {
  FIRE_PUMP_CHECKS,
  MIN_REMARK,
  PRESSURE_RANGE,
  isFailure,
  issueLabels,
  scoreFirePump,
  visibleChecks,
  type FirePumpAnswers,
  type FirePumpCheck,
  type FirePumpKey,
} from '../../lib/firePump/checks';
import type { FirePumpLog } from '../../lib/firePump/records';

/**
 * Fire Pump Healthiness — the daily check.
 *
 * Every failed answer opens a box for what is wrong and an optional photo,
 * and Submit stays off until each one says what is wrong. A bare "No" tells
 * an admin nothing — which hydrant box, where, since when — so the record
 * has to be actionable the moment it lands. The rules live in src/lib/firePump/checks.ts and the
 * server applies the same ones.
 */

const SERVICE = 'FIRE';

interface Draft {
  answers: FirePumpAnswers;
  remarks: Partial<Record<FirePumpKey, string>>;
  photos: Partial<Record<FirePumpKey, string>>;
  pressure: string;
}

const EMPTY: Draft = { answers: {}, remarks: {}, photos: {}, pressure: '' };
const draftKey = (site: string, date: string) => `wos_firepump_draft_${site}_${date}`;

const fromLog = (log: FirePumpLog): Draft => ({
  answers: { ...log.answers },
  remarks: { ...log.remarks },
  photos: { ...log.photos },
  pressure: log.hydrantPressureBar == null ? '' : String(log.hydrantPressureBar),
});

export const FirePumpHealthForm: React.FC<{ onBack?: () => void; onSuccess?: () => void }> = ({ onBack, onSuccess }) => {
  const { warehouses, selectedWarehouseId, setSelectedWarehouseId, currentUser, currentDate, firePumpLogs, submitFirePumpLog, notify } = useApp();

  const siteCode =
    (warehouses.find((w) => w.id === selectedWarehouseId) ?? warehouses.find((w) => w.id === currentUser.warehouseId) ?? warehouses[0])?.id ?? '';
  const site = warehouses.find((w) => w.id === siteCode);
  const [date, setDate] = useState(currentDate);

  const extras = useExtraQuestions(SERVICE, siteCode);
  const existing = firePumpLogs.find((l) => l.siteCode === siteCode && l.date === date);

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [amending, setAmending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<FirePumpLog | null>(null);

  // A filed day opens as it was filed; otherwise any unsent draft comes back.
  useEffect(() => {
    setAmending(false);
    setDone(null);
    if (existing) {
      setDraft(fromLog(existing));
      return;
    }
    try {
      const saved = localStorage.getItem(draftKey(siteCode, date));
      setDraft(saved ? { ...EMPTY, ...JSON.parse(saved) } : EMPTY);
    } catch {
      setDraft(EMPTY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteCode, date, existing?.id]);

  // Site connectivity is unreliable; nothing typed is lost to a dropped page.
  useEffect(() => {
    if (!siteCode || existing) return;
    try {
      localStorage.setItem(draftKey(siteCode, date), JSON.stringify(draft));
    } catch {
      /* a photo data URL can fill a demo browser's storage; the form still works */
    }
  }, [draft, siteCode, date, existing]);

  const asked = useMemo(() => visibleChecks(draft.answers), [draft.answers]);
  const answered = asked.filter((c) => draft.answers[c.key]);
  const failed = asked.filter((c) => isFailure(c, draft.answers[c.key]));
  const incomplete = failed.filter(
    (c) => String(draft.remarks[c.key] ?? '').trim().length < MIN_REMARK,
  );
  const pressureBad =
    draft.pressure !== '' &&
    (!Number.isFinite(Number(draft.pressure)) || Number(draft.pressure) < PRESSURE_RANGE.min || Number(draft.pressure) > PRESSURE_RANGE.max);
  const locked = Boolean(existing) && !amending;
  const canSubmit = !locked && !saving && answered.length === asked.length && incomplete.length === 0 && !pressureBad;

  const answer = (check: FirePumpCheck, value: string) =>
    setDraft((d) => {
      const answers: FirePumpAnswers = { ...d.answers, [check.key]: value };
      // No sprinkler system: the line-charged answer below it no longer applies.
      for (const c of FIRE_PUMP_CHECKS) if (c.showIf && !c.showIf(answers)) delete answers[c.key];
      const next = { ...d, answers };
      if (!isFailure(check, value)) {
        next.remarks = { ...d.remarks };
        next.photos = { ...d.photos };
        delete next.remarks[check.key];
        delete next.photos[check.key];
      }
      return next;
    });

  const submit = async () => {
    if (!canSubmit) return;
    const extraAnswers = extras.collect();
    if (!extraAnswers) {
      notify('error', 'More questions', 'Please answer the questions at the end of the form.');
      return;
    }
    setSaving(true);
    const res = await submitFirePumpLog({
      site: siteCode,
      date,
      answers: draft.answers,
      remarks: draft.remarks,
      photos: draft.photos,
      pressure: draft.pressure,
      extras: extraAnswers,
      amend: amending,
    });
    setSaving(false);
    if (!res.ok) {
      notify('error', res.alreadyFiled ? 'Already filed' : 'Check not filed', res.alreadyFiled ? `${res.message} Choose Amend it to replace it.` : res.message);
      return;
    }
    try {
      localStorage.removeItem(draftKey(siteCode, date));
    } catch {
      /* nothing to clear */
    }
    setDone(res.log ?? null);
    setAmending(false);
    const critical = res.log?.overallStatus === 'CRITICAL';
    notify(critical ? 'warning' : 'success', res.message, critical ? 'Overall status CRITICAL — the Service Admin is alerted.' : 'Overall status OK.');
    onSuccess?.();
  };

  if (!site) {
    return <div className="p-8 text-center text-sm text-slate-400">No warehouse assigned to your account.</div>;
  }

  if (done) {
    const score = scoreFirePump(done.answers);
    const critical = done.overallStatus === 'CRITICAL';
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <PageHeader title="Fire Pump Healthiness" subtitle={`${site.name} · ${date}`} onBack={onBack} backLabel="Back" />
        <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm border-t-8 p-7 space-y-3 ${critical ? 'border-t-rose-600' : 'border-t-emerald-600'}`}>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${critical ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
            {critical ? <ShieldAlert className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
          </div>
          <h2 className="text-xl font-bold text-slate-900">Check filed</h2>
          <p className="text-sm text-slate-600">
            Overall status <strong className={critical ? 'text-rose-700' : 'text-emerald-700'}>{done.overallStatus}</strong>
            {critical ? ` — ${score.issues.length} issue${score.issues.length > 1 ? 's' : ''}: ${issueLabels(score.issues)}. The Service Admin is alerted.` : ' — no issues found.'}
          </p>
          <button type="button" onClick={() => setDone(null)} className="text-sm font-semibold text-slate-700 hover:underline cursor-pointer">
            View the check
          </button>
        </div>
      </div>
    );
  }

  let lastGroup = '';

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-4">
      <PageHeader
        title="Fire Pump Healthiness"
        subtitle="Daily check of detection, the pump room, the hydrant system and sprinklers."
        categoryBadge="FIRE"
        categoryColor="bg-rose-50 text-rose-700 border-rose-200"
        onBack={onBack}
        backLabel="Back"
        breadcrumbs={[{ label: 'Portal', onClick: onBack }, { label: 'EHS & Facilities' }, { label: 'Fire Pump Healthiness' }]}
      />

      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs grid grid-cols-1 xs:grid-cols-3 gap-3 text-xs">
        <div>
          <span className="text-slate-400 block mb-1">Site</span>
          {warehouses.length > 1 ? (
            <select value={siteCode} onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold bg-white">
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          ) : (
            <span className="font-semibold text-slate-800">{site.name} ({siteCode})</span>
          )}
        </div>
        <div>
          <label className="text-slate-400 block mb-1">Date</label>
          <input type="date" value={date} max={currentDate} onChange={(e) => setDate(e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold" />
        </div>
        <div>
          <span className="text-slate-400 block mb-1">Filed by</span>
          <span className="font-semibold text-slate-800 break-all">{currentUser.email}</span>
        </div>
      </div>

      {existing && (
        <AlreadyFiled
          filing={{ code: SERVICE, site: siteCode, day: date, at: existing.submittedAt || date, by: existing.submittedByName || existing.submittedBy || '' }}
          amendNote={amending ? 'Saving replaces this check. What it says now is kept in its history.' : `This check was filed with overall status ${existing.overallStatus}. Amend it if something needs correcting.`}
          onAmend={amending ? undefined : () => setAmending(true)}
        />
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm">
        {asked.map((c) => {
          const value = draft.answers[c.key];
          const bad = isFailure(c, value);
          const heading = c.group !== lastGroup ? (lastGroup = c.group) : null;
          return (
            <React.Fragment key={c.key}>
              {heading && <div className="text-[10px] font-bold uppercase tracking-wider text-teal-700 mt-5 first:mt-0 mb-2">{heading}</div>}
              <div className="py-3.5 border-b border-slate-100 last:border-b-0">
                <div className="text-[13px] font-medium text-slate-900 mb-2.5 flex gap-1.5">
                  <span className="text-rose-600 font-semibold">*</span>
                  <span>{c.label}</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {c.options.map((o) => {
                    const selected = value === o;
                    const tone = !selected
                      ? 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                      : c.neutral
                        ? 'border-slate-400 bg-slate-100 text-slate-900 font-semibold'
                        : isFailure(c, o)
                          ? 'border-rose-500 bg-rose-50 text-rose-700 font-semibold'
                          : 'border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold';
                    return (
                      <button key={o} type="button" disabled={locked} onClick={() => answer(c, o)}
                        className={`flex-1 min-w-26 min-h-11 px-3.5 rounded-lg border text-[13px] transition active:scale-[0.97] disabled:cursor-not-allowed cursor-pointer ${tone}`}>
                        {o}
                      </button>
                    );
                  })}
                </div>

                {c.key === 'hydrant_pressure' && (
                  <div className="mt-2.5">
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Pressure reading (bar) — optional</label>
                    <input type="number" step="0.1" min={PRESSURE_RANGE.min} max={PRESSURE_RANGE.max} placeholder="e.g. 7.0"
                      value={draft.pressure} disabled={locked}
                      onChange={(e) => setDraft((d) => ({ ...d, pressure: e.target.value }))}
                      className={`w-full min-h-11 px-3 rounded-lg border text-sm ${pressureBad ? 'border-rose-400' : 'border-slate-300'}`} />
                    {pressureBad && <p className="text-[11px] text-rose-700 mt-1">Between {PRESSURE_RANGE.min} and {PRESSURE_RANGE.max} bar.</p>}
                  </div>
                )}

                {bad && (
                  <div className="mt-3 p-3 bg-rose-50 border-l-4 border-rose-500 rounded-r-lg space-y-2">
                    <label className="block text-[11px] font-medium text-rose-700">What is wrong? Be specific — which unit, where.</label>
                    <textarea rows={2} disabled={locked} value={draft.remarks[c.key] ?? ''}
                      placeholder="e.g. Hydrant box near Gate 2 — glass broken, hose missing"
                      onChange={(e) => setDraft((d) => ({ ...d, remarks: { ...d.remarks, [c.key]: e.target.value } }))}
                      className="w-full min-h-11 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm" />
                    {!locked && (
                      <PhotoCapture serviceCode={SERVICE} siteCode={siteCode} name={c.key}
                        value={draft.photos[c.key]}
                        onChange={(v) => setDraft((d) => ({ ...d, photos: { ...d.photos, [c.key]: v } }))} />
                    )}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}

        {draft.answers.sprinkler_available === 'No' && (
          <div className="mt-3 p-3 rounded-lg bg-slate-50 text-xs text-slate-500 flex gap-2">
            <Info className="w-4 h-4 shrink-0" />
            <span>No sprinkler system at this site, so the line-charged check does not apply. It is recorded as <b>Not applicable</b>, not as a fault.</span>
          </div>
        )}
      </div>

      {extras.node}

      <div className="sticky bottom-2 z-10 bg-white border border-slate-200 rounded-2xl shadow-lg p-3.5 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-40 text-xs text-slate-600 flex items-center gap-2">
          {answered.length < asked.length ? (
            <><span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">{answered.length}/{asked.length}</span> Answer all checks to continue.</>
          ) : incomplete.length ? (
            <><span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold">{incomplete.length} incomplete</span> Say what is wrong for every failed check.</>
          ) : failed.length ? (
            <><AlertTriangle className="w-4 h-4 text-rose-600" /><span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold">{failed.length} issue{failed.length > 1 ? 's' : ''}</span> Service Admin will be alerted on submit.</>
          ) : (
            <><span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">All clear</span> No issues found.</>
          )}
        </div>
        <button type="button" onClick={submit} disabled={!canSubmit}
          className="min-h-11 px-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
          {saving ? <Flame className="w-4 h-4 animate-pulse" /> : <Save className="w-4 h-4" />}
          {amending ? 'Save amendment' : 'Submit check'}
        </button>
      </div>
    </div>
  );
};
