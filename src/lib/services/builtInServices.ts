/**
 * Services the app always offers, whether or not Master Data lists them.
 *
 * Every screen — the sidebar, the Filing Desk, Operational Sheets, Records,
 * the Control Room — builds its service list from Service_Registry. A
 * service with its own screen in the app but no row in the Master Data sheet
 * would therefore be built and working yet invisible everywhere. Fire Pump
 * Healthiness is such a service, so it is added when the sheet does not have
 * it.
 *
 * The sheet still decides: a row it does hold always wins, so adding FIRE
 * with Active = No to Service_Registry switches the service off.
 */

import type { ServiceRegistry } from '../../types/masterData';

const defaults = (code: string, name: string): ServiceRegistry => ({
  Service_Code: code,
  Service_Name: name,
  Needs_Approval: 'No',
  Needs_Delivery_Validation: 'No',
  Requires_Evidence: 'No',
  Cadence: 'DAILY',
  Submission_Window: '',
  SLA_Hours: '',
  AppScript_URL: '',
  Records_Tab: '',
  Audit_Tab: '',
  Active: 'Yes',
  Last_Updated_By: '',
  Last_Updated_At: '',
});

export const ALWAYS_OFFERED: readonly ServiceRegistry[] = [defaults('FIRE', 'Fire Pump Healthiness')];

/**
 * The registry as the screens should see it: the sheet's rows, plus any
 * always-offered service the sheet does not list.
 *
 * An empty registry is returned as it is — Master Data has not loaded yet,
 * and the screens already fall back to every built-in service in that case.
 */
export function withBuiltInServices(registry: ServiceRegistry[]): ServiceRegistry[] {
  if (registry.length === 0) return registry;
  const listed = new Set(registry.map((r) => String(r.Service_Code).trim().toUpperCase()));
  const missing = ALWAYS_OFFERED.filter((s) => !listed.has(s.Service_Code));
  return missing.length ? [...registry, ...missing] : registry;
}

/**
 * A sheet list saved in this browser, with the always-offered services' own
 * definitions brought up to date.
 *
 * Demo mode keeps the whole list of forms in localStorage, so a browser that
 * saved it before Fire Pump Healthiness existed would go on showing the old
 * "Fire Safety" sheet with no columns. The app's definition replaces it;
 * questions an admin added to it (isExtra) are kept.
 */
export function refreshBuiltInSheets<T extends { id: string; fieldsConfig?: { key: string; isExtra?: boolean }[]; fieldsCount: number }>(
  saved: T[],
  shipped: readonly T[],
  codeOf: (sheetId: string) => string,
): T[] {
  const offered = new Set(ALWAYS_OFFERED.map((s) => s.Service_Code));
  const current = shipped.filter((s) => offered.has(codeOf(s.id)));
  if (current.length === 0) return saved;

  const out = saved.map((sheet) => {
    const fresh = current.find((c) => c.id === sheet.id);
    if (!fresh) return sheet;
    const own = fresh.fieldsConfig ?? [];
    const keys = new Set(own.map((f) => f.key));
    const added = (sheet.fieldsConfig ?? []).filter((f) => f.isExtra === true && !keys.has(f.key));
    const fieldsConfig = [...own, ...added];
    return { ...fresh, fieldsConfig, fieldsCount: fieldsConfig.length };
  });
  for (const fresh of current) if (!out.some((s) => s.id === fresh.id)) out.push(fresh);
  return out;
}
