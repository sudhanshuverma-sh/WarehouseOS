import { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { controlRoomSites } from '../../lib/controlRoom/siteServiceStatus';
import { personasFromMaster } from '../../lib/masterData/personas';
import type { User } from '../../types';

/**
 * Who this app can be used as, for the two persona menus.
 *
 * One list, from POC_Master, so the sidebar and the top bar cannot disagree
 * about who exists. Falls back to the built-in demo users when no Master Data
 * has been imported yet, the same way controlRoomSites falls back to the
 * app's warehouses.
 *
 * The signed-in admin is always kept reachable: a Master Data import with no
 * SUPER_ADMIN row must not strip the way back to an admin view.
 */
export function usePersonas(): User[] {
  const { pocMasterRows, siteMasterRows, warehouses, users, currentUser } = useApp();

  return useMemo(() => {
    const sites = controlRoomSites(siteMasterRows, warehouses);
    const fromMaster = personasFromMaster(pocMasterRows, sites, warehouses);
    if (fromMaster.length === 0) return users;

    if (fromMaster.some(p => p.role === 'SUPER_ADMIN')) return fromMaster;
    const admin = users.find(u => u.role === 'SUPER_ADMIN') ?? currentUser;
    return [admin, ...fromMaster];
  }, [pocMasterRows, siteMasterRows, warehouses, users, currentUser]);
}
