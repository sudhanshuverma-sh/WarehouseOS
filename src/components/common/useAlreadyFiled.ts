import { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  type ControlRoomRecords,
  type Filing,
  controlRoomServices,
  controlRoomSites,
  filedThisPeriod,
  siteMatches,
} from '../../lib/controlRoom/siteServiceStatus';

/**
 * Whether this service has already been filed at this site, for the period
 * its cadence is judged over.
 *
 * One answer for every service. Before this, a second POC at the same
 * warehouse met three different behaviours: the daily report refused them,
 * EB-DG silently replaced the first person's meter readings, and the
 * generic services quietly took a second row nobody was told about.
 *
 * EVENT_DRIVEN services (Diesel, Crate Washing, Ad-hoc) are never "already
 * filed": several a day is what they are for.
 *
 * Sites are matched on the alias set, not string equality, so this agrees
 * with the Control Room about what counts as the same place.
 */
export function useAlreadyFiled(serviceCode: string, siteId: string | undefined): Filing | null {
  const {
    serviceRegistryRows,
    siteMasterRows,
    operationalSheets,
    warehouses,
    dailySiteLogs,
    dieselLogs,
    ebdgRows,
    submissions,
    sheetRecords,
    currentDate,
  } = useApp();

  const records: ControlRoomRecords = useMemo(
    () => ({ dailySiteLogs, dieselLogs, ebdgRows, submissions, sheetRecords }),
    [dailySiteLogs, dieselLogs, ebdgRows, submissions, sheetRecords],
  );

  return useMemo(() => {
    if (!siteId) return null;
    const service = controlRoomServices(serviceRegistryRows, operationalSheets).find((s) => s.code === serviceCode);
    const site = controlRoomSites(siteMasterRows, warehouses).find((s) => siteMatches(s, siteId));
    if (!service || !site) return null;
    return filedThisPeriod(service, site, records, currentDate);
  }, [serviceCode, siteId, serviceRegistryRows, operationalSheets, siteMasterRows, warehouses, records, currentDate]);
}
