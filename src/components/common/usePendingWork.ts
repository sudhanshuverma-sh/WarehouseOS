import { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { canSeeSite, capabilitiesFor } from '../../lib/permissions';
import {
  controlRoomServices,
  controlRoomSites,
  siteMatches,
  type ControlRoomRecords,
} from '../../lib/controlRoom/siteServiceStatus';
import { pendingWork, type PendingWork } from '../../lib/alerts/pendingWork';

/**
 * What is outstanding for the person looking, at the sites they can see.
 *
 * One source for the bell in the top bar, the Alerts badge on mobile and
 * the notification list, so all three always agree. A POC sees their own
 * site; an admin sees the facility chosen in the top bar, or every site
 * they may see when that is "All Hubs".
 */
export function usePendingWork(): PendingWork {
  const {
    currentUser,
    currentDate,
    warehouses,
    siteMasterRows,
    serviceRegistryRows,
    operationalSheets,
    selectedWarehouseId,
    dailySiteLogs,
    dieselLogs,
    ebdgRows,
    submissions,
    sheetRecords,
  } = useApp();

  const caps = useMemo(() => capabilitiesFor(currentUser), [currentUser]);

  const sites = useMemo(() => {
    const all = controlRoomSites(siteMasterRows, warehouses);
    const mine = all.filter((s) => caps.canViewAllSites || s.aliases.some((a) => canSeeSite(caps, a)));
    // The top bar's facility filter narrows it further, so the number the
    // bell shows is about what the person is actually looking at.
    if (selectedWarehouseId === 'ALL') return mine;
    const picked = mine.filter((s) => siteMatches(s, selectedWarehouseId));
    return picked.length ? picked : mine;
  }, [siteMasterRows, warehouses, caps, selectedWarehouseId]);

  const services = useMemo(() => {
    const all = controlRoomServices(serviceRegistryRows, operationalSheets);
    const held = currentUser.serviceCodes;
    return caps.isSuperAdmin || !held || held === 'ALL' ? all : all.filter((s) => held.includes(s.code));
  }, [serviceRegistryRows, operationalSheets, currentUser.serviceCodes, caps.isSuperAdmin]);

  const records: ControlRoomRecords = useMemo(
    () => ({ dailySiteLogs, dieselLogs, ebdgRows, submissions, sheetRecords }),
    [dailySiteLogs, dieselLogs, ebdgRows, submissions, sheetRecords],
  );

  return useMemo(
    () => pendingWork({ sites, services, records, dieselLogs, today: currentDate }),
    [sites, services, records, dieselLogs, currentDate],
  );
}
