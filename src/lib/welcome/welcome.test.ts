import { describe, expect, it } from 'vitest';
import type { User } from '../../types';
import type { PocMaster, ServiceRegistry } from '../../types/masterData';
import type { ControlRoomSite } from '../controlRoom/siteServiceStatus';
import {
  destinationFor,
  firstName,
  gmailCompose,
  helpContactFor,
  ownSites,
  problemRecipients,
  serviceAdminLine,
  welcomeDate,
} from './welcome';

/** What the welcome screen says to each person, and who it points them to. */

const site = (id: string, name: string, aliases: string[] = [id]): ControlRoomSite => ({
  id, whCode: '', name, city: 'New Delhi', zone: 'North', channel: 'B2B', services: 'ALL', aliases,
});
const SITES = [site('ZHPL-DL-03', 'WH DEL3 (Ghevra)', ['ZHPL-DL-03', 'WH_DEL3']), site('ZHPL-DL-06', 'WH DEL6 (Mundka)'), site('ZHPL-MH-01', 'Bhiwandi')];

const row = (p: Partial<PocMaster>): PocMaster => ({
  Access_ID: 'AC-1', POC_Email: '', POC_Name: '', WH_Code: '', Role: 'SITE_POC', Site_Code: '', Service_Codes: 'ALL',
  Contact_Number: '', Is_Primary: 'Yes', Active: 'Yes', Access_Start_Date: '', Access_End_Date: '', Description: '',
  Reporting_Manager_Email: '', Last_Updated_By: '', Last_Updated_At: '', ...p,
} as PocMaster);

const user = (p: Partial<User>): User => ({ id: 'u1', email: 'me@x.com', fullName: 'Ravi Kumar', role: 'SITE_POC', isActive: true, createdAt: '', ...p });

describe('the welcome greeting', () => {
  it('names the day the same way in every locale', () => {
    expect(welcomeDate('2026-09-27')).toBe('Sunday, 27 September');
    expect(welcomeDate('2026-01-01')).toBe('Thursday, 1 January');
    expect(welcomeDate('')).toBe('');
  });

  it('greets by first name', () => {
    expect(firstName('  Sudhanshu Verma ')).toBe('Sudhanshu');
    expect(firstName('')).toBe('there');
  });

  it("sends each role to its home screen", () => {
    expect(destinationFor('SUPER_ADMIN')).toEqual({ view: 'dashboard', label: 'Open Control Room' });
    expect(destinationFor('SERVICE_ADMIN')).toEqual({ view: 'adminDashboard', label: 'Open Service Hub' });
    expect(destinationFor('SITE_POC')).toEqual({ view: 'pocFiling', label: 'Open Filing Desk' });
    expect(destinationFor('WAREHOUSE_ADMIN').view).toBe('pocFiling');
  });

  it("names a service admin's services, or all of them", () => {
    const registry = [
      { Service_Code: 'DIESEL', Service_Name: 'Diesel' },
      { Service_Code: 'EB_DG', Service_Name: 'EB and DG' },
    ] as ServiceRegistry[];
    expect(serviceAdminLine({ serviceCodes: ['DIESEL', 'EB_DG'] }, registry)).toBe('Service Admin · Diesel, EB and DG');
    expect(serviceAdminLine({ serviceCodes: ['DIESEL', 'EB_DG', 'FIRE'] }, registry)).toBe('Service Admin · Diesel, EB and DG, FIRE');
    expect(serviceAdminLine({ serviceCodes: 'ALL' }, registry)).toBe('Service Admin · All services');
    expect(serviceAdminLine({}, registry)).toBe('Service Admin · All services');
  });
});

describe("a POC's sites", () => {
  it('finds every site they hold, by any name the site goes by', () => {
    expect(ownSites({ warehouseId: 'WH_DEL3' }, SITES).map((s) => s.name)).toEqual(['WH DEL3 (Ghevra)']);
    expect(ownSites({ siteCodes: ['ZHPL-DL-03', 'ZHPL-DL-06'] }, SITES)).toHaveLength(2);
    expect(ownSites({}, SITES)).toEqual([]);
  });
});

describe('who to call for help', () => {
  const rows = [
    row({ Access_ID: 'A1', Role: 'SUPER_ADMIN', POC_Name: 'Sudhanshu Verma', POC_Email: 'sv@x.com', Site_Code: 'ALL' }),
    row({ Access_ID: 'A2', Role: 'SERVICE_ADMIN', POC_Name: 'Neha Singh', POC_Email: 'neha@x.com', Site_Code: 'ZHPL-MH-01', Contact_Number: '+91 98100 00001' }),
    row({ Access_ID: 'A3', Role: 'SERVICE_ADMIN', POC_Name: 'Arjun Rao', POC_Email: 'arjun@x.com', Site_Code: 'ZHPL-DL-03', Contact_Number: '+91 98100 00002' }),
    row({ Access_ID: 'A4', Role: 'SERVICE_ADMIN', POC_Name: 'Old Admin', Site_Code: 'ALL', Active: 'No' }),
  ];

  it("gives a POC the Service Admin who covers their site", () => {
    const mine = ownSites({ warehouseId: 'WH_DEL3' }, SITES);
    expect(helpContactFor(user({}), mine, rows, [])).toEqual({ name: 'Arjun Rao', relation: 'Your Service Admin', phone: '+91 98100 00002', email: 'arjun@x.com' });
  });

  it('falls back to a Super Admin when no Service Admin covers the site', () => {
    const mine = ownSites({ siteCodes: ['ZHPL-DL-06'] }, SITES);
    expect(helpContactFor(user({}), mine, rows, [])).toMatchObject({ name: 'Sudhanshu Verma', relation: 'Your Super Admin' });
  });

  it('gives a Service Admin their Super Admin, and a Super Admin someone other than themselves', () => {
    expect(helpContactFor(user({ role: 'SERVICE_ADMIN', email: 'neha@x.com' }), [], rows, [])).toMatchObject({ name: 'Sudhanshu Verma', relation: 'Your Super Admin' });
    expect(helpContactFor(user({ role: 'SUPER_ADMIN', email: 'sv@x.com' }), [], rows, [])).toBeNull();
  });

  it("uses the app's own users before Master Data is imported", () => {
    const users = [user({ id: 'a', role: 'SUPER_ADMIN', fullName: 'Admin One', email: 'a@x.com', phone: '999' })];
    expect(helpContactFor(user({ role: 'SERVICE_ADMIN' }), [], [], users)).toMatchObject({ name: 'Admin One', phone: '999' });
  });

  it('reports problems to the Super Admins, never back to yourself', () => {
    expect(problemRecipients(user({}), rows, [])).toEqual(['sv@x.com']);
    expect(problemRecipients(user({ email: 'sv@x.com' }), rows, [])).toEqual([]);
  });

  it('opens a Gmail draft with everything filled in', () => {
    const url = gmailCompose(['a@x.com', 'b@x.com'], 'WarehouseOS: problem report', 'Line 1\nLine 2');
    expect(url).toContain('to=a%40x.com%2Cb%40x.com');
    expect(url).toContain('su=WarehouseOS%3A%20problem%20report');
    expect(url).toContain('body=Line%201%0ALine%202');
  });
});

describe('where a site is', () => {
  const blr = site('ZHPL-KA-09', 'CPC, BLR9', ['ZHPL-KA-09', 'WH_BLR9']);
  const siteRow = (p: Record<string, string>) => ({ Site_Code: 'ZHPL-KA-09', WH_Code: 'BLR9', Address: '', City: '', State: '', Pincode: '', Map_Link: '', ...p }) as never;

  it('names the WH code and writes the address once, however it was typed', async () => {
    const { sitePlace } = await import('./welcome');
    const place = sitePlace({ ...blr, whCode: 'BLR9' }, [siteRow({ Address: 'Plot 12, Hoskote, Bengaluru, 562114', City: 'Bengaluru', State: 'Karnataka', Pincode: '562114' })], []);
    expect(place).toMatchObject({ whCode: 'BLR9', siteCode: 'ZHPL-KA-09', name: 'CPC, BLR9' });
    expect(place.address).toBe('Plot 12, Hoskote, Bengaluru, 562114, Karnataka');
    expect(place.mapUrl).toContain('google.com/maps/search');
  });

  it("fills what Site_Master leaves blank from the app's warehouse, and keeps its map link", async () => {
    const { sitePlace } = await import('./welcome');
    const wh = [{ id: 'WH_BLR9', code: 'BLR9', address: 'Plot 12, Hoskote', city: 'Bengaluru', pincode: '562114', mapsUrl: 'https://maps.app.goo.gl/abc' }] as never;
    const place = sitePlace({ ...blr, whCode: '' }, [], wh);
    expect(place.whCode).toBe('BLR9');
    expect(place.address).toBe('Plot 12, Hoskote, Bengaluru, 562114');
    expect(place.mapUrl).toBe('https://maps.app.goo.gl/abc');
  });

  it('falls back to the site name, and offers no map without an address', async () => {
    const { sitePlace } = await import('./welcome');
    const place = sitePlace({ ...blr, whCode: '' }, [], []);
    expect(place).toMatchObject({ whCode: 'CPC, BLR9', address: '' });
    expect(place.mapUrl).toBeUndefined();
  });
});
