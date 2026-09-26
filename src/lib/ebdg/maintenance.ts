/**
 * EB-DG maintenance alerts: a DG at or near its B-check, and a grid power
 * factor low enough to draw an EB penalty.
 *
 * The bell raises these for everyone who holds EB-DG at that site: the POC
 * who files it and the Service Admin who runs it (and Super Admins). The
 * rules are the dashboard's own (bcheckState, and PF under 0.90), so the bell
 * and "Needs attention" never disagree.
 *
 * Only recent readings count: a B-check reading from the last 30 days, a PF
 * from the last 7. A site that stopped filing does not keep ringing the bell
 * with a months-old reading.
 */

import { bcheckState, DGS, num, shiftDay, type BCheck, type DgNo } from './dashboard';

export interface MaintenanceAlert {
  siteCode: string;
  kind: 'bcheck' | 'pf';
  tone: 'bad' | 'soon';
  /** Which DG, for a B-check. */
  dg?: DgNo;
  label: string;
}

/** Power factor under this risks a penalty on the EB bill. */
export const PF_ALERT_BELOW = 0.9;
const BCHECK_WINDOW_DAYS = 30;
const PF_WINDOW_DAYS = 7;

type Row = Record<string, unknown>;

export function maintenanceAlerts(rows: readonly object[], today: string): MaintenanceAlert[] {
  const bcheckFrom = shiftDay(today, -BCHECK_WINDOW_DAYS);
  const pfFrom = shiftDay(today, -PF_WINDOW_DAYS);

  // Per site, oldest first, so the latest reading of each kind wins.
  const bySite = new Map<string, Row[]>();
  for (const r of rows as Row[]) {
    const code = String(r.Site_Code ?? '');
    const d = String(r.Date ?? '').slice(0, 10);
    if (!code || !d || d > today || d < bcheckFrom) continue;
    const list = bySite.get(code);
    if (list) list.push(r);
    else bySite.set(code, [r]);
  }

  const alerts: MaintenanceAlert[] = [];
  for (const [siteCode, list] of bySite) {
    list.sort((a, b) => String(a.Date).localeCompare(String(b.Date)));

    const latest: Partial<Record<DgNo, BCheck>> = {};
    let pf: number | null = null;
    for (const r of list) {
      for (const n of DGS) {
        if (num(r[`DG${n}_Hour_Meter`]) === null) continue;
        const remHrs = num(r[`DG${n}_B_Check_Remaining_Hrs`]);
        const remDays = num(r[`DG${n}_B_Check_Remaining_Days`]);
        if (remHrs === null && remDays === null) continue;
        latest[n] = { remHrs, remDays, due: String(r[`DG${n}_B_Check_Due_Date`] ?? ''), status: '' };
      }
      const p = num(r.Grid_PF);
      if (String(r.Date).slice(0, 10) >= pfFrom && p !== null && p > 0 && p <= 1.2) pf = p;
    }

    for (const n of DGS) {
      const b = latest[n];
      if (!b) continue;
      const { state } = bcheckState([b]);
      if (state !== 'OVERDUE' && state !== 'DUE SOON') continue;
      const left =
        state === 'OVERDUE'
          ? 'overdue'
          : b.remHrs !== null && b.remHrs <= 50
            ? `due in ${Math.round(b.remHrs)} h`
            : `due in ${Math.round(b.remDays ?? 0)} days`;
      alerts.push({ siteCode, kind: 'bcheck', dg: n, tone: state === 'OVERDUE' ? 'bad' : 'soon', label: `DG ${n} B-check ${left}` });
    }
    if (pf !== null && pf < PF_ALERT_BELOW) {
      alerts.push({ siteCode, kind: 'pf', tone: 'soon', label: `Power factor ${pf.toFixed(2)}, EB penalty risk` });
    }
  }

  const rank = { bad: 0, soon: 1 };
  return alerts.sort((a, b) => rank[a.tone] - rank[b.tone] || a.siteCode.localeCompare(b.siteCode));
}
