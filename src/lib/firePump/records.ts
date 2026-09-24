/**
 * Fire Pump Healthiness as the rest of the app reads it.
 *
 * The check is kept as one log (answers, remarks and photos by check key).
 * Records, the Control Room and the bell read flat rows, so each log is
 * flattened once here: one column per check, then its remark and photo, in
 * form order. FIRE_PUMP_RECORD_FIELDS gives those columns their labels and
 * order (it is the service's fieldsConfig).
 */

import type { FieldDefinition } from '../../types';
import {
  FIRE_PUMP_CHECKS,
  NOT_APPLICABLE,
  issueLabels,
  visibleChecks,
  type FirePumpAnswers,
  type FirePumpKey,
  type FirePumpOverall,
} from './checks';

/** One filed check, as the API returns it and demo mode stores it. */
export interface FirePumpLog {
  id: string;
  siteCode: string;
  date: string;
  submittedAt?: string;
  submittedBy?: string;
  submittedByName?: string;
  answers: FirePumpAnswers;
  remarks: Partial<Record<FirePumpKey, string>>;
  /** Attachment id per failed check; in demo mode, the photo itself as a data URL. */
  photos: Partial<Record<FirePumpKey, string>>;
  hydrantPressureBar?: number | null;
  overallStatus: FirePumpOverall;
  issuesCount: number;
  [extra: string]: unknown;
}

const remarkKey = (k: string) => `${k}_remark`;
const photoKey = (k: string) => `${k}_photo`;

/** The columns Records shows, in form order. */
export const FIRE_PUMP_RECORD_FIELDS: FieldDefinition[] = [
  ...FIRE_PUMP_CHECKS.flatMap((c): FieldDefinition[] => {
    const own: FieldDefinition = { key: c.key, label: c.short, type: 'select', required: !c.showIf, options: [...c.options] };
    if (c.neutral) return [own];
    return [
      own,
      { key: remarkKey(c.key), label: `${c.short} — remark`, type: 'textarea', required: false },
      { key: photoKey(c.key), label: `${c.short} — photo`, type: 'evidence', required: false },
      ...(c.key === 'hydrant_pressure'
        ? [{ key: 'hydrant_pressure_bar', label: 'Hydrant pressure', type: 'number', unit: 'bar', required: false, min: 0, max: 20 } as FieldDefinition]
        : []),
    ];
  }),
  { key: 'issues', label: 'Issues', type: 'text', required: false },
];

/**
 * A photo as a link Records can open. An uploaded one is served by the API;
 * a demo-mode photo lives only in this browser, so it just says it is there.
 */
function photoLink(ref: string | undefined, origin: string): string | undefined {
  if (!ref) return undefined;
  if (ref.startsWith('data:')) return 'Attached';
  return `${origin}/api/attachments/${ref}`;
}

/** One log as a flat row: what Records lists and the Control Room counts. */
export function firePumpRecord(log: FirePumpLog, origin = ''): Record<string, unknown> {
  const asked = new Set(visibleChecks(log.answers).map((c) => c.key));
  const row: Record<string, unknown> = {
    id: log.id,
    sheetId: 'SHEET_FIRE',
    warehouseId: log.siteCode,
    date: log.date,
    submittedAt: log.submittedAt,
    submittedByName: log.submittedByName ?? log.submittedBy,
    status: log.overallStatus,
  };
  for (const c of FIRE_PUMP_CHECKS) {
    row[c.key] = asked.has(c.key) ? log.answers[c.key] ?? '' : NOT_APPLICABLE;
    if (c.neutral) continue;
    row[remarkKey(c.key)] = log.remarks?.[c.key];
    row[photoKey(c.key)] = photoLink(log.photos?.[c.key], origin);
  }
  row.hydrant_pressure_bar = log.hydrantPressureBar ?? undefined;
  const failed = FIRE_PUMP_CHECKS.filter((c) => asked.has(c.key) && !c.neutral && log.answers[c.key] && log.answers[c.key] !== c.good);
  row.issues = failed.length ? issueLabels(failed.map((c) => c.key)) : 'None';
  // Questions added to this service later sit beside the check's own columns.
  for (const [k, v] of Object.entries(log)) {
    if (!(k in row) && !['answers', 'remarks', 'photos', 'logId', 'siteCode', 'submittedBy', 'hydrantPressureBar', 'overallStatus', 'issuesCount'].includes(k)) {
      if (v === null || typeof v !== 'object') row[k] = v;
    }
  }
  return row;
}

/** What the form sends to file a check. */
export interface FirePumpSubmission {
  site: string;
  date: string;
  answers: FirePumpAnswers;
  remarks: Partial<Record<FirePumpKey, string>>;
  photos: Partial<Record<FirePumpKey, string>>;
  pressure?: number | string | null;
  extras?: Record<string, unknown>;
  /** Replace the check already filed for this site and day. */
  amend?: boolean;
}

export interface FirePumpSubmitResult {
  ok: boolean;
  message: string;
  log?: FirePumpLog;
  /** Set when the day already has a check and `amend` was not asked for. */
  alreadyFiled?: { by: string; at: string };
}
