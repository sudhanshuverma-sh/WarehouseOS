/**
 * Daily Site Activity Report — what the readings mean.
 *
 * Shared by the browser (to show the POC the result before they submit)
 * and the API (to decide what is stored). The API never trusts a
 * worst_status sent by the client: a report is "clear" because its
 * numbers say so, not because the payload says so.
 */

export type SiteHealth = 'clear' | 'partial' | 'critical' | 'missing';

/** Utility availability, %. `isCrit` marks a stock-at-risk failure. */
export const UTILITY_KEYS = [
  { label: 'UPS', key: 'ups', remarkKey: 'upsRemark' },
  { label: 'DG', key: 'dg', remarkKey: 'dgRemark' },
  { label: 'LT Panel', key: 'ltPanel', remarkKey: 'ltPanelRemark' },
  { label: 'Cold Room', key: 'coldRoom', remarkKey: 'coldRoomRemark', isCrit: true },
  { label: 'HVLS', key: 'hvls', remarkKey: 'hvlsRemark' },
  { label: 'Water Coolers', key: 'waterCoolers', remarkKey: 'waterCoolersRemark' },
  { label: 'Freezers GGP', key: 'freezersGgp', remarkKey: 'freezersGgpRemark', isCrit: true },
  { label: 'Door Buzzer', key: 'doorBuzzer', remarkKey: 'doorBuzzerRemark' },
] as const;

/** MHE availability, %. */
export const MHE_KEYS = [
  { label: 'RT', key: 'rt', remarkKey: 'rtRemark' },
  { label: 'BOPT', key: 'bopt', remarkKey: 'boptRemark' },
  { label: 'Stackers', key: 'stackers', remarkKey: 'stackersRemark' },
  { label: 'VRC', key: 'vrc', remarkKey: 'vrcRemark' },
] as const;

/** Routine checks: Done / Not Done / NA. */
export const ROUTINE_KEYS = [
  { label: 'MTS Inspection', key: 'mtsInspection', remarkKey: 'mtsRemark' },
  { label: 'Lights Inspection', key: 'lightsInspection', remarkKey: 'lightsRemark' },
  { label: 'Air Circulation', key: 'airCirculation', remarkKey: 'airCirculationRemark' },
  { label: 'Gemba', key: 'gemba', remarkKey: 'gembaRemark' },
] as const;

export const ROUTINE_VALUES = ['Done', 'Not Done', 'NA'] as const;

const PERCENT_KEYS = [...UTILITY_KEYS, ...MHE_KEYS];

/** A reading left blank means "fully available" — the form's default. */
const percent = (v: unknown) => (v === undefined || v === null || v === '' ? 100 : Number(v));

export interface DailySiteScore {
  worstStatus: SiteHealth;
  deviationsCount: number;
}

/**
 * Anything below 100% is a deviation. A critical utility (cold room,
 * freezers) or any routine check not Done makes the whole site critical;
 * everything else makes it partial.
 */
export function scoreDailySite(values: Record<string, unknown>): DailySiteScore {
  let deviationsCount = 0;
  let worstStatus: SiteHealth = 'clear';

  for (const u of UTILITY_KEYS) {
    if (percent(values[u.key]) < 100) {
      deviationsCount++;
      if ('isCrit' in u && u.isCrit) worstStatus = 'critical';
      else if (worstStatus !== 'critical') worstStatus = 'partial';
    }
  }

  for (const m of MHE_KEYS) {
    if (percent(values[m.key]) < 100) {
      deviationsCount++;
      if (worstStatus !== 'critical') worstStatus = 'partial';
    }
  }

  for (const r of ROUTINE_KEYS) {
    if ((values[r.key] || 'Done') !== 'Done') {
      deviationsCount++;
      worstStatus = 'critical';
    }
  }

  return { worstStatus, deviationsCount };
}

/** Readings that cannot be right, by key. Empty when the report is valid. */
export function dailySiteValueErrors(values: Record<string, unknown>): string[] {
  const errors: string[] = [];

  for (const { key, label } of PERCENT_KEYS) {
    const v = values[key];
    if (v === undefined || v === null || v === '') continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 100) errors.push(`${label} must be a percentage from 0 to 100.`);
  }

  for (const { key, label } of ROUTINE_KEYS) {
    const v = values[key];
    if (v === undefined || v === null || v === '') continue;
    if (!(ROUTINE_VALUES as readonly unknown[]).includes(v)) {
      errors.push(`${label} must be Done, Not Done or NA.`);
    }
  }

  return errors;
}
