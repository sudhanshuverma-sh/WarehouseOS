/**
 * The app names services by sheet (SHEET_DIESEL); the database names them
 * by Service_Code (DIESEL). This is the one place the two meet.
 *
 * A form created in the app after this file was written has no entry, so
 * its code is derived from its sheet id — the same rule both directions,
 * so it round-trips.
 */

export const SHEET_TO_SERVICE: Readonly<Record<string, string>> = {
  SHEET_DAILY_SITE: 'SITE_ACTIVITY',
  SHEET_DIESEL: 'DIESEL',
  SHEET_EB_DG: 'EB_DG',
  SHEET_DG_POWER_WATER: 'EB_DG', // the old power/water card opens the EB-DG form
  SHEET_HOUSEKEEPING: 'HOUSEKEEPING',
  SHEET_WASHING: 'WASHING',
  SHEET_ADHOC: 'ADHOC',
  SHEET_COLD: 'COLD_ROOM',
  SHEET_RT: 'RT',
  SHEET_BOPT: 'BOPT',
  SHEET_UPS: 'UPS',
  SHEET_LT: 'LT_PANEL',
  SHEET_FIRE: 'FIRE',
  SHEET_HVLS: 'HVLS',
  SHEET_WATER: 'WATER',
  SHEET_SECURITY: 'SECURITY',
};

/** Aliases that must not win the reverse lookup. */
const ALIASES = new Set(['SHEET_DG_POWER_WATER']);

export function serviceCodeFor(sheetId: string): string {
  const known = SHEET_TO_SERVICE[sheetId];
  if (known) return known;
  const derived = sheetId.replace(/^SHEET_/, '').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  return /^[A-Z]/.test(derived) ? derived : `S_${derived}`;
}

export function sheetIdFor(serviceCode: string): string {
  for (const [sheetId, code] of Object.entries(SHEET_TO_SERVICE)) {
    if (code === serviceCode && !ALIASES.has(sheetId)) return sheetId;
  }
  return `SHEET_${serviceCode}`;
}
