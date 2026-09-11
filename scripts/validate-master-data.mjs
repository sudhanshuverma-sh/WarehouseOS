/**
 * Checks a master-data snapshot against everything db/schema.sql will
 * enforce — before you run the seed against a real database.
 *
 *   node scripts/validate-master-data.mjs data/master-data.json
 *
 * Exits non-zero if anything would fail the import, so this can gate a
 * deploy. Advisories (a site with nobody to file for it) are reported but
 * do not fail the run: they are operational problems, not schema errors.
 *
 * Worth running after every sheet edit. A seed that aborts halfway leaves
 * a partly-populated database, and working out which of 262 rows stopped
 * it from a Postgres error message is much slower than reading this.
 */

import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/validate-master-data.mjs <master-data.json>');
  process.exit(1);
}

/** Same BOM sniffing as json-to-sql.mjs — PowerShell redirects write UTF-16. */
function readText(path) {
  const buf = readFileSync(path);
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le').slice(1);
  if (buf[0] === 0xfe && buf[1] === 0xff) return buf.swap16().toString('utf16le').slice(1);
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.toString('utf8').slice(1);
  return buf.toString('utf8');
}

const d = JSON.parse(readText(file));
const sites = d.siteMaster ?? [];
const pocs = d.pocMaster ?? [];
const services = d.serviceRegistry ?? [];

// These mirror the enums in db/schema.sql §1. A value outside them aborts
// the whole seed transaction, so they are errors rather than warnings.
const ZONE = ['North', 'South', 'East', 'West', 'Central'];
const CHANNEL = ['B2B', 'B2C', 'BOTH'];
const BUSINESS = ['WHS', 'Grozo', 'HP', 'SS B2B'];
const ROLE = ['SITE_POC', 'WAREHOUSE_ADMIN', 'SERVICE_ADMIN', 'SUPER_ADMIN'];
const CADENCE = ['DAILY', 'WEEKLY', 'MONTHLY', 'EVENT_DRIVEN'];

// apps.blinkit.in signs people in from these domains only (platform FAQ).
// An address anywhere else may resolve to no identity at all.
const SSO_DOMAINS = ['blinkit.com', 'grofers.com', 'zomato.com'];

const errors = [];
const advisories = [];

const enumCheck = (rows, field, allowed, label) => {
  const bad = [...new Set(rows.map((r) => r[field]).filter((v) => v && !allowed.includes(v)))];
  if (bad.length) errors.push(`${label}.${field}: ${JSON.stringify(bad)} not in ${JSON.stringify(allowed)}`);
};

enumCheck(sites, 'Zone', ZONE, 'Site_Master');
enumCheck(sites, 'Channel', CHANNEL, 'Site_Master');
enumCheck(sites, 'Business_Type', BUSINESS, 'Site_Master');
enumCheck(pocs, 'Role', ROLE, 'POC_Master');
enumCheck(services, 'Cadence', CADENCE, 'Service_Registry');

// --- primary keys -----------------------------------------------------
const dupes = (arr) => [...new Set(arr.filter((x, i) => x && arr.indexOf(x) !== i))];
const dupSite = dupes(sites.map((s) => s.Site_Code));
const dupAccess = dupes(pocs.map((p) => p.Access_ID));
if (dupSite.length) errors.push(`Duplicate Site_Code: ${dupSite.join(', ')}`);
if (dupAccess.length) errors.push(`Duplicate Access_ID: ${dupAccess.join(', ')}`);

// --- foreign keys -----------------------------------------------------
const codes = new Set(sites.map((s) => s.Site_Code));
for (const p of pocs) {
  const s = String(p.Site_Code ?? '').trim();
  if (s && s !== 'ALL' && !codes.has(s)) {
    errors.push(`${p.Access_ID}: Site_Code '${s}' has no Site_Master row`);
  }
}

// --- the scope matrix (schema.sql: constraint scope_matches_role) ------
for (const p of pocs) {
  const site = String(p.Site_Code ?? 'ALL').trim();
  const svc = String(p.Service_Codes ?? 'ALL').trim();
  const nationwide = site === 'ALL';
  const allServices = svc === 'ALL';
  const ok =
    p.Role === 'SUPER_ADMIN' ? nationwide && allServices
    : p.Role === 'SERVICE_ADMIN' ? nationwide && !allServices
    : p.Role === 'WAREHOUSE_ADMIN' ? !nationwide && allServices
    : p.Role === 'SITE_POC' ? !nationwide
    : true;
  if (!ok) errors.push(`${p.Access_ID}: ${p.Role} with site='${site}' services='${svc}' fails scope_matches_role`);
}

// --- advisories: valid data, operationally wrong ----------------------

// Nobody with SUPER_ADMIN means nobody can administer master data, and RLS
// gives no way back in through the app.
const supers = pocs.filter((p) => p.Role === 'SUPER_ADMIN' && String(p.Active).trim() === 'Yes');
if (supers.length === 0) errors.push('No active SUPER_ADMIN — you would be locked out of your own admin UI');
else if (supers.length === 1) advisories.push(`Only one SUPER_ADMIN (${supers[0].POC_Email}). If they leave, nobody can administer master data.`);

// A blank Active silently revokes someone.
for (const p of pocs) {
  if (String(p.Active ?? '').trim() === '') advisories.push(`${p.Access_ID} (${p.POC_Email}): Active is blank, so the seed marks them INACTIVE`);
}

// An address outside the SSO domains may never resolve to a signed-in user.
const offDomain = pocs.filter((p) => {
  const dom = String(p.POC_Email ?? '').split('@')[1];
  return dom && !SSO_DOMAINS.includes(dom);
});
if (offDomain.length) {
  advisories.push(`${offDomain.length} POC(s) on domains outside ${SSO_DOMAINS.join('/')}: ${offDomain.map((p) => p.POC_Email).join(', ')}`);
}

// The sharp version of that: a site whose every POC is unreachable has
// nobody who can file for it.
const bySite = {};
for (const p of pocs) if (p.Role === 'SITE_POC') (bySite[p.Site_Code] ??= []).push(p);
for (const [site, ps] of Object.entries(bySite)) {
  if (ps.every((p) => offDomain.includes(p))) {
    advisories.push(`${site}: every POC is off-domain (${ps.map((p) => p.POC_Email).join(', ')}) — nobody may be able to sign in and file`);
  }
}

// A site with no POC at all cannot file either — usually a new site that
// nobody has been assigned to yet.
const noPoc = sites.filter((s) => s.Site_Code !== 'ALL' && String(s.Active).trim() !== 'No' && !bySite[s.Site_Code]);
if (noPoc.length) {
  advisories.push(`${noPoc.length} active site(s) have no SITE_POC: ${noPoc.map((s) => `${s.Site_Code} (${s.WH_Code})`).join(', ')}`);
}

// --- report -----------------------------------------------------------
const people = new Set(pocs.map((p) => p.POC_Email)).size;
console.log(`Sites ${sites.length} | Access rows ${pocs.length} (${people} people) | Services ${services.length}`);

if (advisories.length) {
  console.log(`\nAdvisories (${advisories.length}) — valid data, worth a look:`);
  for (const a of advisories) console.log(`  - ${a}`);
}

if (errors.length) {
  console.error(`\nERRORS (${errors.length}) — the seed will abort on these:`);
  for (const e of errors) console.error(`  ! ${e}`);
  process.exit(1);
}

console.log('\nNo blocking errors. Safe to run db/seed.sql.');
