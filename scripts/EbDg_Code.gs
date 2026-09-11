/**
 * EB-DG daily entry — Apps Script Web App for the EB_DG_B2B / EB_DG_B2C tabs.
 *
 * DEPLOY
 *   1. Open the EB-DG spreadsheet → Extensions → Apps Script.
 *   2. Paste this file in, save.
 *   3. Deploy → New deployment → Web app.
 *        Execute as:        Me
 *        Who has access:    Anyone within <your Workspace domain>
 *   4. Copy the /exec URL into the app: EB-DG form → "Sheet sync" → paste URL.
 *
 * CONTRACT
 *   The client sends the 109 header names alongside the 109 values. This
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

function doPost(e) {
  try {
    var payload = JSON.parse(e.parameter.payload);

    if (payload.action !== 'upsertEbDgRow') {
      return respond({ status: 'error', message: 'Unknown action: ' + payload.action });
    }
    if (ALLOWED_TABS.indexOf(payload.tab) === -1) {
      return respond({ status: 'error', message: 'Unknown tab: ' + payload.tab });
    }
    if (!payload.recordId) {
      return respond({ status: 'error', message: 'Record_ID is required.' });
    }
    if (!payload.header || !payload.values || payload.header.length !== payload.values.length) {
      return respond({ status: 'error', message: 'header and values must be the same length.' });
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(30000); // two POCs can submit at the same second
    try {
      return respond(upsertRow(payload));
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ status: 'error', message: String(err) });
  }
}

function upsertRow(payload) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(payload.tab);
  if (!sheet) return { status: 'error', message: 'Tab not found: ' + payload.tab };

  var lastCol = sheet.getLastColumn();
  var sheetHeader = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h).trim();
  });

  // Header-name mapping. Every column the client sent must exist in the sheet.
  var indexByName = {};
  for (var i = 0; i < sheetHeader.length; i++) {
    if (sheetHeader[i]) indexByName[sheetHeader[i]] = i;
  }

  var missing = [];
  for (var h = 0; h < payload.header.length; h++) {
    if (indexByName[payload.header[h]] === undefined) missing.push(payload.header[h]);
  }
  if (missing.length) {
    return {
      status: 'error',
      message:
        'Refusing to write: the sheet has no column named ' + missing.join(', ') +
        '. Fix the tab header (or the app\'s column list) so they agree — writing anyway would ' +
        'put values in the wrong columns.'
    };
  }

  // Build the row in the SHEET's own column order, not the client's.
  var rowValues = new Array(sheetHeader.length).fill('');
  for (var v = 0; v < payload.header.length; v++) {
    rowValues[indexByName[payload.header[v]]] = payload.values[v];
  }

  var recordIdCol = indexByName['Record_ID'];
  var targetRow = findRowByRecordId(sheet, recordIdCol, payload.recordId);

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    return { status: 'ok', mode: 'updated', row: targetRow, recordId: payload.recordId };
  }

  sheet.appendRow(rowValues);
  return { status: 'ok', mode: 'created', row: sheet.getLastRow(), recordId: payload.recordId };
}

/** Scans the Record_ID column only — cheap even at 25,000+ rows. */
function findRowByRecordId(sheet, recordIdCol, recordId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  var ids = sheet.getRange(2, recordIdCol + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === recordId) return i + 2;
  }
  return -1;
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Open the /exec URL in a browser tab to confirm the deployment is reachable. */
function doGet() {
  return respond({ status: 'ok', message: 'EB-DG endpoint is live.', tabs: ALLOWED_TABS });
}
