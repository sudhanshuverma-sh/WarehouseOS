/**
 * Fire Pump Healthiness — the daily check, its rules and its score.
 *
 * One module for the browser and the API (server/routes/firePump.ts), the
 * way src/lib/dailySite/scoring.ts is shared: the form uses it to decide when
 * Submit is allowed, and the server uses the same rules before saving, so a
 * failed check cannot reach the database without its remark.
 *
 * Why every failure needs a remark: a bare "No" tells an admin nothing —
 * which hydrant box, where, since when. The record has to be actionable the
 * moment it lands; a fire alarm marked faulty with no detail is the same as
 * not reporting it. A photo helps and is asked for, but it is optional: a
 * site with no camera or signal must still be able to report the fault.
 */

export type FirePumpKey =
  | 'fire_alarm'
  | 'mcp'
  | 'pump_room'
  | 'hydrant_pressure'
  | 'hydrant_line'
  | 'hydrant_boxes'
  | 'hose_reel'
  | 'sprinkler_available'
  | 'sprinkler_charged';

export interface FirePumpCheck {
  key: FirePumpKey;
  group: string;
  label: string;
  /** The label Records shows for the column. */
  short: string;
  options: readonly string[];
  /** The healthy answer. Anything else is a failure. */
  good?: string;
  /** A fact about the site, not a fault: no answer here is a failure. */
  neutral?: boolean;
  /** Asked only when this holds for the answers so far. */
  showIf?: (answers: FirePumpAnswers) => boolean;
}

export type FirePumpAnswers = Partial<Record<FirePumpKey, string>>;

export const FIRE_PUMP_CHECKS: readonly FirePumpCheck[] = [
  { key: 'fire_alarm', group: 'Detection', label: 'Is the fire alarm system working OK?', short: 'Fire alarm OK', options: ['Yes', 'No'], good: 'Yes' },
  { key: 'mcp', group: 'Detection', label: 'Are all MCPs (manual call points) OK?', short: 'MCPs OK', options: ['Yes', 'No'], good: 'Yes' },
  { key: 'pump_room', group: 'Pump room', label: 'Fire pump room operation', short: 'Pump room', options: ['Operational', 'Non operational'], good: 'Operational' },
  { key: 'hydrant_pressure', group: 'Pump room', label: 'Pressure maintained for hydrant pump?', short: 'Hydrant pressure maintained', options: ['Yes', 'No'], good: 'Yes' },
  { key: 'hydrant_line', group: 'Hydrant system', label: 'Fire hydrant line charged?', short: 'Hydrant line charged', options: ['Yes', 'No'], good: 'Yes' },
  { key: 'hydrant_boxes', group: 'Hydrant system', label: 'Are all hydrant boxes OK?', short: 'Hydrant boxes OK', options: ['Yes', 'No'], good: 'Yes' },
  { key: 'hose_reel', group: 'Hydrant system', label: 'Are the hose reels OK?', short: 'Hose reels OK', options: ['Yes', 'No'], good: 'Yes' },
  // Availability is a fact about the site, not a fault. "No" is not an
  // issue — it simply means the next question does not apply.
  { key: 'sprinkler_available', group: 'Sprinkler', label: 'Is a fire sprinkler system available?', short: 'Sprinkler available', options: ['Yes', 'No'], neutral: true },
  {
    key: 'sprinkler_charged',
    group: 'Sprinkler',
    label: 'Is the sprinkler line charged?',
    short: 'Sprinkler line charged',
    options: ['Yes', 'No'],
    good: 'Yes',
    showIf: (a) => a.sprinkler_available === 'Yes',
  },
];

/** What Records and the sheet show for a check that was not asked. */
export const NOT_APPLICABLE = 'Not applicable';

/** The shortest remark that says which unit and where. */
export const MIN_REMARK = 8;

/** Hydrant header pressure, in bar. A reading outside this is a typo, not a pump. */
export const PRESSURE_RANGE = { min: 0, max: 20 } as const;

export function visibleChecks(answers: FirePumpAnswers): FirePumpCheck[] {
  return FIRE_PUMP_CHECKS.filter((c) => !c.showIf || c.showIf(answers));
}

export function isFailure(check: FirePumpCheck, value: string | undefined): boolean {
  if (check.neutral || value === undefined || value === '') return false;
  return value !== check.good;
}

export type FirePumpOverall = 'OK' | 'CRITICAL';

export interface FirePumpScore {
  overall: FirePumpOverall;
  /** Keys of the checks that failed, in form order. */
  issues: FirePumpKey[];
}

export function scoreFirePump(answers: FirePumpAnswers): FirePumpScore {
  const issues = visibleChecks(answers)
    .filter((c) => isFailure(c, answers[c.key]))
    .map((c) => c.key);
  return { overall: issues.length ? 'CRITICAL' : 'OK', issues };
}

/** "Hydrant boxes OK, Hose reels OK" — for an alert line. */
export function issueLabels(keys: readonly string[]): string {
  return keys
    .map((k) => FIRE_PUMP_CHECKS.find((c) => c.key === k)?.short ?? k)
    .join(', ');
}

export interface FirePumpEntry {
  answers: FirePumpAnswers;
  remarks: Partial<Record<FirePumpKey, string>>;
  /** Attachment id (or, in demo mode, a local reference) per failed check. */
  photos: Partial<Record<FirePumpKey, string>>;
  /** Optional hydrant pressure reading, bar. */
  pressure?: number | string | null;
}

/**
 * Everything wrong with an entry, in words a POC can act on. Empty means it
 * can be saved.
 */
export function firePumpErrors(entry: FirePumpEntry): string[] {
  const errors: string[] = [];
  const answers = entry.answers ?? {};
  const asked = visibleChecks(answers);

  for (const c of asked) {
    const v = answers[c.key];
    if (v === undefined || v === '') {
      errors.push(`Answer "${c.label}"`);
      continue;
    }
    if (!c.options.includes(v)) {
      errors.push(`"${c.label}" must be ${c.options.join(' or ')}.`);
      continue;
    }
    if (isFailure(c, v)) {
      const remark = String(entry.remarks?.[c.key] ?? '').trim();
      if (remark.length < MIN_REMARK) errors.push(`"${c.short}": say what is wrong — which unit, where.`);
    }
  }

  // A check that is not asked must not carry an answer: no sprinkler system
  // means there is no sprinkler line to be charged or not.
  for (const c of FIRE_PUMP_CHECKS) {
    if (asked.includes(c)) continue;
    const v = answers[c.key];
    if (v !== undefined && v !== '' && v !== NOT_APPLICABLE) errors.push(`"${c.label}" does not apply here.`);
  }

  const p = entry.pressure;
  if (p !== undefined && p !== null && p !== '') {
    const n = Number(p);
    if (!Number.isFinite(n) || n < PRESSURE_RANGE.min || n > PRESSURE_RANGE.max) {
      errors.push(`Pressure reading must be between ${PRESSURE_RANGE.min} and ${PRESSURE_RANGE.max} bar.`);
    }
  }

  return errors;
}
