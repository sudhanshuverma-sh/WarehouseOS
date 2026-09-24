/**
 * Site_DG_Config — per-site DG count, DEF/Solar presence, and B-check
 * intervals (they vary by DG make). This is its own small master tab per
 * the spec ("Read DG_Count from Site_DG_Config... Read B_Check_Interval_Hrs
 * and B_Check_Interval_Days per site from the Site_DG_Config tab").
 *
 * No live Site_DG_Config source exists yet (see MASTERDATA.md §11 — this
 * kind of config sits outside POC_Master/Site_Master/Service_Registry
 * today). OVERRIDES below is a stand-in a SUPER_ADMIN can extend per site;
 * every site not listed gets DEFAULT_CONFIG. Swapping this for a real
 * Site_DG_Config sheet/table later only means changing getSiteDgConfig()'s
 * body — every caller (the form, calculate()) is unaffected.
 */

import { resolveSiteDgConfig, SiteDgConfig } from '../../types/ebdg';

const DEFAULT_CONFIG: Omit<SiteDgConfig, 'Site_Code'> = {
  DG_Count: 3, // every site is shown DG 1, 2 and 3; a DG left blank books nothing
  Has_DEF: 'Yes',
  Has_Solar: 'No',
  B_Check_Interval_Hrs: 500,
  B_Check_Interval_Days: 365
};

/** Per-site overrides — extend as real Site_DG_Config data becomes available. */
const OVERRIDES: Record<string, Partial<Omit<SiteDgConfig, 'Site_Code'>>> = {};

export function getSiteDgConfig(siteCode: string): SiteDgConfig {
  return resolveSiteDgConfig({ Site_Code: siteCode, ...DEFAULT_CONFIG, ...OVERRIDES[siteCode] });
}
