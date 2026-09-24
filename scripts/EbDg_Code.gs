/**
 * EB-DG daily entry — Apps Script Web App for the EB_DG_B2B / EB_DG_B2C tabs.
 *
 * DEPLOY
 *   1. Open the EB-DG spreadsheet → Extensions → Apps Script.
 *   2. Paste this file in, save.
 *   3. Tabs missing or empty? Select setupSheet → Run, once. It writes the
 *      110-column header into EB_DG_B2B and EB_DG_B2C and never touches a
 *      tab that already has data.
 *   4. Deploy → New deployment → Web app.
 *        Execute as:        Me
 *        Who has access:    Anyone within <your Workspace domain>
 *   5. Copy the /exec URL into the app: EB-DG form → Link sheet → paste, Save.
 *      The link is saved in the database, so every POC's browser uses it.
 *
 * HOW ROWS ARRIVE
 *   The browser of whoever files the entry sends the row, right after the
 *   app has saved it — the same as Diesel. Be signed in to your Workspace
 *   Google account in that browser and allow pop-ups for the app. If a row
 *   is ever missing, EB-DG → Link sheet → "Send all to sheet" re-sends every
 *   entry; existing rows are updated, never duplicated.
 *
 * REDEPLOYING AFTER AN EDIT
 *   Deploy → Manage deployments → pencil icon → Version: New version.
 *   A *new deployment* gets a different /exec URL, and the app keeps posting
 *   to the old code.
 *
 * CONTRACT
 *   The client sends the 110 header names alongside the 110 values. This
 *   script maps value → column BY HEADER NAME against the live sheet, so if
 *   someone inserts a column in the tab, the write still lands in the right
 *   cells. If the sheet is missing a header the client sent, the write is
 *   REFUSED rather than written misaligned (MASTERDATA.md I5: an inserted
 *   column must fail loudly, not write diesel litres into a date field).
 *
 *   One row per site per date: an existing Record_ID is updated in place,
 *   never appended a second time.
 */

var ALLOWED_TABS = ['EB_DG_B2B', 'EB_DG_B2C'];

var KEY_COLUMN = 'Record_ID';

/** The tab's header, 110 columns. Must equal EBDG_SHEET_HEADER in src/lib/ebdg/sheetWriter.ts (pinned by sheetWriter.test.ts). */
var EBDG_HEADER = [
  'Record_ID', 'Date', 'Day', 'Site_Code', 'WH_Code', 'Zone',
  'DG1_HSD_Opening', 'DG1_HSD_Added', 'DG1_HSD_Closing', 'DG1_HSD_Consumption',
  'DG1_KWH_Opening', 'DG1_KWH_Closing', 'DG1_KWH_Consumption', 'DG1_Run_Hrs',
  'DG1_Unit_Per_Ltr', 'DG1_Ltr_Per_Hr', 'DG1_Hour_Meter',
  'DG1_B_Check_Done_Today', 'DG1_B_Check_Last_Hrs', 'DG1_B_Check_Last_Date',
  'DG1_B_Check_Due_Hrs', 'DG1_B_Check_Remaining_Hrs', 'DG1_B_Check_Due_Date',
  'DG1_B_Check_Remaining_Days', 'DG1_B_Check_Status',
  'DG2_HSD_Opening', 'DG2_HSD_Added', 'DG2_HSD_Closing', 'DG2_HSD_Consumption',
  'DG2_KWH_Opening', 'DG2_KWH_Closing', 'DG2_KWH_Consumption', 'DG2_Run_Hrs',
  'DG2_Unit_Per_Ltr', 'DG2_Ltr_Per_Hr', 'DG2_Hour_Meter',
  'DG2_B_Check_Done_Today', 'DG2_B_Check_Last_Hrs', 'DG2_B_Check_Last_Date',
  'DG2_B_Check_Due_Hrs', 'DG2_B_Check_Remaining_Hrs', 'DG2_B_Check_Due_Date',
  'DG2_B_Check_Remaining_Days', 'DG2_B_Check_Status',
  'DG3_HSD_Opening', 'DG3_HSD_Added', 'DG3_HSD_Closing', 'DG3_HSD_Consumption',
  'DG3_KWH_Opening', 'DG3_KWH_Closing', 'DG3_KWH_Consumption', 'DG3_Run_Hrs',
  'DG3_Unit_Per_Ltr', 'DG3_Ltr_Per_Hr', 'DG3_Hour_Meter',
  'DG3_B_Check_Done_Today', 'DG3_B_Check_Last_Hrs', 'DG3_B_Check_Last_Date',
  'DG3_B_Check_Due_Hrs', 'DG3_B_Check_Remaining_Hrs', 'DG3_B_Check_Due_Date',
  'DG3_B_Check_Remaining_Days', 'DG3_B_Check_Status',
  'DEF_Opening', 'DEF_Added', 'DEF_Closing', 'DEF_Used',
  'Total_HSD_Consumption', 'Total_KWH_Consumption', 'Total_Run_Hrs',
  'Total_Unit_Per_Ltr', 'Total_Ltr_Per_Hr',
  'HSD_Tank_Opening', 'HSD_Received_Ltr', 'HSD_Rate', 'HSD_Amount', 'HSD_Tank_Closing',
  'Grid_MF', 'Grid_KWH_Opening', 'Grid_KWH_Closing', 'Grid_KWH_Consumed',
  'Grid_KVAH_Opening', 'Grid_KVAH_Closing', 'Grid_KVAH_Consumed', 'Grid_PF',
  'Grid_Supply_Hrs', 'Grid_Supply_Pct', 'DG_Supply_Pct', 'EB_Power_Cuts', 'Max_Load_KW',
  'Solar_Opening', 'Solar_Closing', 'Solar_Generated', 'Total_KWH_All_Sources',
  'EB_Rate_Per_Unit', 'EB_Amount', 'DG_Amount', 'DG_Rate_Per_Unit',
  'Solar_Rate_Per_Unit', 'Solar_Amount', 'Total_Amount', 'Blended_Rate_Per_Unit',
  'Water_Opening', 'Water_Closing', 'Water_Consumed', 'Raw_Water_Procured_KL',
  'Remark', 'Submitted_By', 'Submitted_At', 'Status'
];

function doPost(e) {
  try {
    var payload = JSON.parse(e.parameter.payload);

    var lock = LockService.getScriptLock();
    lock.waitLock(30000); // two POCs can submit at the same second
    try {
      // One day's entry, from the Submit click.
      if (payload.action === 'upsertEbDgRow') {
        if (ALLOWED_TABS.indexOf(payload.tab) === -1) {
          return respond({ status: 'error', message: 'Unknown tab: ' + payload.tab });
        }
        if (!payload.recordId) {
          return respond({ status: 'error', message: 'Record_ID is required.' });
        }
        if (!payload.header || !payload.values || payload.header.length !== payload.values.length) {
          return respond({ status: 'error', message: 'header and values must be the same length.' });
        }
        return respond(upsertRow(payload));
      }

      // Every entry at once — the "Send all to sheet" catch-up. Each row
      // names its own tab, so B2B and B2C sites travel in one post.
      if (payload.action === 'upsertEbDgRows') {
        if (!payload.header || !payload.rows) {
          return respond({ status: 'error', message: 'header and rows are required.' });
        }
        var results = {};
        for (var t = 0; t < ALLOWED_TABS.length; t++) {
          var tab = ALLOWED_TABS[t];
          var rows = payload.rows.filter(function (r) { return r && r.tab === tab; });
          if (rows.length) results[tab] = upsertRows(tab, payload.header, rows);
        }
        return respond({ status: 'ok', tabs: results });
      }

      return respond({ status: 'error', message: 'Unknown action: ' + payload.action });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ status: 'error', message: String(err) });
  }
}

/**
 * Header name → column index of the live tab, or an error naming what the
 * tab lacks. Shared by the single and batch writes so both refuse the same way.
 */
function mapHeader(sheet, header) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    return { error: 'The tab is empty — run setupSheet() to write the header row first.' };
  }
  var sheetHeader = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h).trim();
  });

  var indexByName = {};
  for (var i = 0; i < sheetHeader.length; i++) {
    if (sheetHeader[i]) indexByName[sheetHeader[i]] = i;
  }

  var missing = header.filter(function (h) { return indexByName[h] === undefined; });
  if (missing.length) {
    return {
      error:
        'Refusing to write: the sheet has no column named ' + missing.join(', ') +
        '. Fix the tab header (or the app\'s column list) so they agree — writing anyway would ' +
        'put values in the wrong columns.'
    };
  }
  return { width: sheetHeader.length, indexByName: indexByName };
}

/** Values in the SHEET's own column order, not the client's. */
function toSheetOrder(map, header, values) {
  var rowValues = new Array(map.width).fill('');
  for (var v = 0; v < header.length; v++) {
    rowValues[map.indexByName[header[v]]] = values[v];
  }
  return rowValues;
}

function upsertRow(payload) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(payload.tab);
  if (!sheet) return { status: 'error', message: 'Tab not found: ' + payload.tab + '. Run setupSheet() once.' };

  var map = mapHeader(sheet, payload.header);
  if (map.error) return { status: 'error', message: map.error };

  var rowValues = toSheetOrder(map, payload.header, payload.values);
  var slots = readKeyColumn(sheet, map.indexByName[KEY_COLUMN]);
  var targetRow = slots.rowByKey[String(payload.recordId).trim()];

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    return { status: 'ok', mode: 'updated', row: targetRow, recordId: payload.recordId };
  }

  // The tab comes pre-filled with formula rows whose Record_ID is blank; a new
  // entry takes the first of those, not a row below all of them.
  var row = slots.emptyRows.length ? slots.emptyRows[0] : sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, rowValues.length).setValues([rowValues]);
  return { status: 'ok', mode: 'created', row: row, recordId: payload.recordId };
}

/**
 * Many rows for one tab. Reads the header and the Record_ID column once,
 * updates rows that exist, and writes the missing ones into the blank rows
 * in a few block writes — one call per row would run into Apps Script's
 * time limit.
 */
function upsertRows(tab, header, rows) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(tab);
  if (!sheet) return { status: 'error', message: 'Tab not found: ' + tab + '. Run setupSheet() once.' };

  var map = mapHeader(sheet, header);
  if (map.error) return { status: 'error', message: map.error };

  var slots = readKeyColumn(sheet, map.indexByName[KEY_COLUMN]);
  var rowByKey = slots.rowByKey;

  var creates = [];
  var updated = 0;
  var skipped = 0;

  for (var n = 0; n < rows.length; n++) {
    var item = rows[n];
    var key = item.key ? String(item.key).trim() : '';
    if (!key || !item.values || item.values.length !== header.length) {
      skipped++;
      continue;
    }

    var rowValues = toSheetOrder(map, header, item.values);
    if (rowByKey[key] > 0) {
      sheet.getRange(rowByKey[key], 1, 1, rowValues.length).setValues([rowValues]);
      updated++;
    } else if (rowByKey[key] === undefined) {
      creates.push(rowValues);
      rowByKey[key] = -1; // the same entry twice in one batch is added once
    }
  }

  // Blank rows first, in order; anything left over goes below the last row.
  var targets = slots.emptyRows.slice(0, creates.length);
  var next = sheet.getLastRow() + 1;
  while (targets.length < creates.length) targets.push(next++);

  // Consecutive target rows are written as one block.
  var start = 0;
  while (start < creates.length) {
    var end = start + 1;
    while (end < creates.length && targets[end] === targets[end - 1] + 1) end++;
    sheet.getRange(targets[start], 1, end - start, map.width).setValues(creates.slice(start, end));
    start = end;
  }

  return { status: 'ok', updated: updated, created: creates.length, skipped: skipped };
}

/**
 * One read of the Record_ID column: where each existing entry is, and which
 * rows below the header are still free (blank Record_ID), top to bottom.
 */
function readKeyColumn(sheet, keyCol) {
  var rowByKey = {};
  var emptyRows = [];
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var ids = sheet.getRange(2, keyCol + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      var id = String(ids[i][0]).trim();
      if (id) rowByKey[id] = i + 2;
      else emptyRows.push(i + 2);
    }
  }
  return { rowByKey: rowByKey, emptyRows: emptyRows };
}

/**
 * Run this ONCE from the Apps Script editor (select setupSheet → Run).
 *
 * Creates any missing tab and writes the header row into every EMPTY one.
 * A tab that already has content is left alone, so it can never overwrite
 * real data if someone runs it again.
 */
function setupSheet() {
  var ss = SpreadsheetApp.getActive();
  var done = [];
  for (var t = 0; t < ALLOWED_TABS.length; t++) {
    var name = ALLOWED_TABS[t];
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sheet.getLastRow() > 0) {
      done.push(name + ': already has data, left alone');
      continue;
    }
    sheet.getRange(1, 1, 1, EBDG_HEADER.length).setValues([EBDG_HEADER]);
    sheet.getRange(1, 1, 1, EBDG_HEADER.length)
      .setFontWeight('bold')
      .setBackground('#0F172A')
      .setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    done.push(name + ': header written (' + EBDG_HEADER.length + ' columns)');
  }
  return done.join('\n');
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Open the /exec URL in a browser tab to confirm the deployment is live.
 *
 * Reports, per tab, whether it exists and whether its header has every
 * column the app sends — a mismatch shows here before anyone files an
 * entry, not as a refused write afterwards.
 */
function doGet() {
  var ss = SpreadsheetApp.getActive();
  var tabs = {};
  for (var t = 0; t < ALLOWED_TABS.length; t++) {
    var name = ALLOWED_TABS[t];
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      tabs[name] = { exists: false, message: 'Tab missing. Run setupSheet().' };
      continue;
    }
    var lastCol = sheet.getLastColumn();
    var header = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
    var missing = EBDG_HEADER.filter(function (h) { return header.indexOf(h) === -1; });
    tabs[name] = {
      exists: true,
      rows: Math.max(0, sheet.getLastRow() - 1),
      headerOk: missing.length === 0,
      missingColumns: missing
    };
  }
  return respond({ status: 'ok', message: 'EB-DG endpoint is live.', tabs: tabs });
}
