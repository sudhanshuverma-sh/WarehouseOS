/**
 * Turns Google Sheets "Download as web page" exports into the master-data
 * JSON that scripts/json-to-sql.mjs already consumes.
 *
 *   1. In the master sheet: File > Download > Web page (.html)
 *   2. Unzip it and drop the per-tab .html files into data/sheets/
 *   3. node scripts/html-to-json.mjs data/sheets data/master-data.json
 *   4. node scripts/json-to-sql.mjs data/master-data.json db/seed.sql
 *
 * Pass the output path as an argument rather than using a `>` redirect:
 * PowerShell writes redirects as UTF-16 with a BOM, which no JSON parser
 * will accept.
 *
 * Why parse HTML rather than CSV: the HTML export keeps every tab, keeps
 * cell text exactly as displayed, and cannot silently reinterpret a
 * Contact_Number as a float or a Site_Code as a date the way a CSV round
 * trip through Excel can. The cost is that Google splits long cells into
 * a nested <div class="softmerge-inner">, which is why cellText() below
 * flattens children instead of reading a single text node.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const outFile = process.argv[3];
if (!dir) {
  console.error('Usage: node scripts/html-to-json.mjs <folder-with-tab-html-files> [output.json]');
  process.exit(1);
}

/** Which JSON key each tab feeds. Anything else in the folder is ignored. */
const TABS = {
  site_master: 'siteMaster',
  poc_master: 'pocMaster',
  service_registry: 'serviceRegistry',
  dropdowns: 'dropdowns',
};

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&nbsp;': ' ', '&apos;': "'",
};

/**
 * The export is UTF-8, but sheets that were themselves pasted in from a
 * mis-decoded source carry the classic double-encoding: an em dash arrives
 * as 'Ã¢â‚¬â€ù' or, once mangled further, a bare 'â'. Repairing the handful
 * that actually occur is safer than a blanket re-decode, which would
 * corrupt the rows that are already correct.
 */
const MOJIBAKE = [
  [/â€"|â€“|â€|â(?=\s)/g, '—'],
  [/â€™/g, "'"], [/â€˜/g, "'"],
  [/â€œ/g, '"'], [/â€/g, '"'],
  [/Â°/g, '°'], [/Â /g, ' '], [/Â/g, ''],
];

const decode = (s) => {
  let out = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  for (const [k, v] of Object.entries(ENTITIES)) out = out.split(k).join(v);
  for (const [re, v] of MOJIBAKE) out = out.replace(re, v);
  return out;
};

/** Cell text with nested markup (softmerge wrappers, <br>) flattened away. */
const cellText = (html) =>
  decode(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

/** Every <td> in a row, in document order. Row-header <th> is skipped. */
const rowCells = (rowHtml) => [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cellText(m[1]));

function parseTable(html) {
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!body) return [];

  const rows = [...body[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((m) => rowCells(m[1]))
    .filter((cells) => cells.some((c) => c !== ''));   // drops the freezebar row

  if (rows.length === 0) return [];

  const headers = rows[0];
  return rows.slice(1).map((cells) => {
    const rec = {};
    headers.forEach((h, i) => {
      if (h) rec[h] = cells[i] ?? '';
    });
    return rec;
  });
}

const out = { generatedAt: new Date().toISOString(), source: 'Google Sheets HTML export' };
const summary = [];

for (const file of readdirSync(dir)) {
  if (!file.toLowerCase().endsWith('.html')) continue;
  const key = TABS[file.replace(/\.html$/i, '').toLowerCase()];
  if (!key) {
    summary.push(`  skipped ${file} (not a master-data tab)`);
    continue;
  }
  const rows = parseTable(readFileSync(join(dir, file), 'utf8'));
  out[key] = rows;
  summary.push(`  ${file} -> ${key}: ${rows.length} rows`);
}

// Dropdowns is column-per-list, not a record table. Reshape it so the
// enums in db/schema.sql can be checked against what the sheet allows.
if (out.dropdowns) {
  const lists = {};
  for (const rec of out.dropdowns) {
    for (const [k, v] of Object.entries(rec)) {
      if (v) (lists[k] ??= []).push(v);
    }
  }
  out.dropdowns = lists;
}

// Prefer writing the file ourselves. PowerShell's `>` redirect encodes as
// UTF-16 with a BOM, which is not JSON any parser will accept — passing an
// output path sidesteps the shell entirely and always writes UTF-8.
if (outFile) {
  writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8');
  console.error(`Wrote ${outFile}`);
} else {
  console.log(JSON.stringify(out, null, 2));
}

console.error('Parsed:');
console.error(summary.join('\n'));

// A missing tab is not an error here — you may be re-importing just one —
// but it silently produces a seed file with nothing in it, so say so.
for (const [tab, key] of Object.entries(TABS)) {
  if (!out[key]) console.error(`  NOTE: no ${tab}.html found, so ${key} will be empty in the seed`);
}
