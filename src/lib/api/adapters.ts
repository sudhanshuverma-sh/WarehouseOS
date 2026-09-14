/**
 * API responses → the app's own types.
 *
 * The screens were written against `User` and `Warehouse`. Mapping at this
 * one boundary keeps them unchanged while the data underneath becomes
 * Postgres (MASTERDATA.md I8). The important difference: a warehouse's id
 * is now its real Site_Code (ZHPL-HR-03), the same key every record in the
 * database uses — not the demo data's WH_DEL_01.
 */

import type { User, UserRole, Warehouse } from '../../types';

export interface MeResponse {
  email: string;
  name: string;
  roles: string[];
  sites: 'ALL' | string[];
  services: 'ALL' | string[];
  grants: { access_id: string; poc_name: string; role: string; site_code: string; service_codes: string }[];
}

export interface MySiteRow {
  site_code: string;
  wh_code: string;
  facility_name: string;
  channel: 'B2B' | 'B2C' | 'BOTH';
  entity: string;
  cost_center: string | null;
  sap_code: string | null;
  zone: Warehouse['zone'];
  state: string;
  city: string | null;
  address: string | null;
  business_type: string;
  services_enabled: string;
}

/** Most powerful first: someone holding two roles acts with the wider one. */
const ROLE_ORDER: UserRole[] = ['SUPER_ADMIN', 'SERVICE_ADMIN', 'WAREHOUSE_ADMIN', 'SITE_POC'];

export function userFromMe(me: MeResponse): User {
  const role = ROLE_ORDER.find((r) => me.roles.includes(r)) ?? 'SITE_POC';
  const sites = me.sites === 'ALL' ? undefined : me.sites;
  return {
    // The email is the identity everywhere in the database; there is no
    // separate user id to keep in step with it.
    id: me.email,
    email: me.email,
    fullName: me.name || me.email,
    role,
    warehouseId: sites?.[0],
    siteCodes: sites,
    serviceCodes: me.services,
    isActive: true,
    createdAt: '',
  };
}

export function warehouseFromSite(s: MySiteRow): Warehouse {
  return {
    id: s.site_code,
    code: s.wh_code,
    name: s.facility_name,
    facilityName: s.facility_name,
    sapCode: s.sap_code ?? undefined,
    state: s.state,
    b2bName: s.channel !== 'B2C' ? s.facility_name : undefined,
    b2cName: s.channel !== 'B2B' ? s.facility_name : undefined,
    entity: s.entity,
    costCenter: s.cost_center ?? s.sap_code ?? '',
    zone: s.zone,
    city: s.city ?? '',
    address: s.address ?? '',
    isActive: true,
    createdAt: '',
    channel: s.channel,
    businessType: s.business_type,
  };
}
