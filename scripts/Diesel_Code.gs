/**
 * Diesel & DEF procurement — Apps Script Web App for the Diesel master sheet.
 *
 * Same contract as scripts/EbDg_Code.gs, keyed on Unique ID instead of
 * Record_ID. If you have already deployed that one, everything here will
 * look familiar on purpose: one pattern to understand, not two.
 *
 * DEPLOY
 *   1. Open the Diesel spreadsheet → Extensions → Apps Script.
 *   2. Delete whatever is in Code.gs, paste this file in, Save.
 *   3. Deploy → New deployment → type "Web app".
 *        Description:     Diesel sync v1
 *        Execute as:      Me
 *        Who has access:  Anyone within Zomato   (NOT "Anyone")
 *   4. Authorise when prompted. It will warn the app is unverified —
 *      that is normal for a script you wrote yourself.
 *   5. Copy the /exec URL.
 *   6. In WarehouseOS: Diesel → Sheet sync → paste the URL → Test.
 *
 * REDEPLOYING AFTER AN EDIT
 *   Deploy → Manage deployments → pencil icon → Version: New version.
 *   Creating a *new deployment* instead gives you a different /exec URL and
 *   the app keeps posting to the old code, which is the single most common
 *   way this appears "not to work".
 *
 * CONTRACT
 *   The client sends header names alongside values. This script maps
 *   value → column BY HEADER NAME against the live sheet, so inserting or
 *   reordering a column in the tab does not corrupt the write. If the sheet
 *   is missing a header the client sent, the write is REFUSED rather than
 *   written misaligned — litres must never land in a rate column.
 *
 *   One row per Unique ID: an existing request is updated in place, so a
 *   delivery validation or an approval edits the row it belongs to instead
 *   of appending a near-duplicate.
 */

var DIESEL_TAB = 'Records';

/**
 * The columns this script expects, in the order of the ZHPL Diesel master
 * sheet. Used only by setupSheet() and the health check — the actual write
 * maps by name against whatever the sheet really contains.
 */
var DIESEL_HEADER = [
  'Timestamp',
  'Email Address',
  'Entity',
  'WH NAME (B2B)',
  'WH NAME (B2C)',
  'COST CENTER',
  'Zone',
  'Fuel',
  'Type',
  'Vendor Name(Payment)',
  'Quantity',
  'Rate per Litres',
  'Final Amount',
  'QR Code Image',
  'Vendor Name(Delivery)',
  'Order Quantity',
  'Unique ID',
  'Status',
  'Validation',
  'Delivered Quantity',
  "POD's"
];

var KEY_COLUMN = 'Unique ID';

function doPost(e) {
  try {
    var payload = JSON.parse(e.parameter.payload);

    // Two POCs can submit in the same second, and appendRow is not atomic
    // across concurrent executions — without this, one write can land on
    // top of the other.
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      // A new request, or a re-send of one: the whole row.
      if (payload.action === 'upsertDieselRow') {
        if (!payload.key) {
          return respond({ status: 'error', message: KEY_COLUMN + ' is required.' });
        }
        if (!payload.header || !payload.values || payload.header.length !== payload.values.length) {
          return respond({ status: 'error', message: 'header and values must be the same length.' });
        }
        return respond(upsertRow(payload));
      }

      // An approval, a rejection, a delivery validation: only the fields
      // that changed. The app has always sent this shape, so the script
      // accepts it rather than forcing every status change to resend all
      // 21 columns — which would overwrite anything edited in the sheet
      // meanwhile with a stale copy.
      if (payload.action === 'updateDiesel') {
        if (!payload.uniqueId) {
          return respond({ status: 'error', message: 'uniqueId is required.' });
        }
        return respond(updateFields(payload.uniqueId, payload.updates || {}));
      }

      return respond({ status: 'error', message: 'Unknown action: ' + payload.action });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ status: 'error', message: String(err) });
  }
}

function upsertRow(payload) {
  var tabName = payload.tab || DIESEL_TAB;
  var sheet = SpreadsheetApp.getActive().getSheetByName(tabName);
  if (!sheet) {
    return {
      status: 'error',
      message: 'Tab not found: ' + tabName + '. Run setupSheet() once, or rename the tab to ' + DIESEL_TAB + '.'
    };
  }

  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    return { status: 'error', message: 'The tab is empty — run setupSheet() to write the header row first.' };
  }

  var sheetHeader = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h).trim();
  });

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
        'Refusing to write: the sheet has no column named "' + missing.join('", "') +
        '". Fix the tab header so it matches, or re-run setupSheet() on an empty tab. ' +
        'Writing anyway would put values in the wrong columns.'
    };
  }

  if (indexByName[KEY_COLUMN] === undefined) {
    return { status: 'error', message: 'The sheet has no "' + KEY_COLUMN + '" column to match rows on.' };
  }

  // Built in the SHEET's column order, not the client's, so a reordered
  // tab still receives each value in its own column.
  var rowValues = new Array(sheetHeader.length).fill('');
  for (var v = 0; v < payload.header.length; v++) {
    rowValues[indexByName[payload.header[v]]] = payload.values[v];
  }

  var targetRow = findRowByKey(sheet, indexByName[KEY_COLUMN], payload.key);

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    return { status: 'ok', mode: 'updated', row: targetRow, key: payload.key };
  }

  sheet.appendRow(rowValues);
  return { status: 'ok', mode: 'created', row: sheet.getLastRow(), key: payload.key };
}

/**
 * Writes only the named fields of an existing request.
 *
 * Field names are the app's own (status, validation, deliveredQuantityLitres)
 * rather than sheet headers, so they are translated here. A field with no
 * mapping is ignored rather than guessed at — writing to a column chosen by
 * a near-match is how litres end up in a rate column.
 */
var FIELD_TO_COLUMN = {
  status: 'Status',
  validation: 'Validation',
  deliveredQuantityLitres: 'Delivered Quantity',
  orderQuantityLitres: 'Order Quantity',
  quantity: 'Quantity',
  finalAmount: 'Final Amount',
  ratePerLitre: 'Rate per Litres',
  podUrl: "POD's",
  qrCodeImageUrl: 'QR Code Image',
  vendorNamePayment: 'Vendor Name(Payment)',
  vendorNameDelivery: 'Vendor Name(Delivery)'
};

function updateFields(uniqueId, updates) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(DIESEL_TAB);
  if (!sheet) return { status: 'error', message: 'Tab not found: ' + DIESEL_TAB };

  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return { status: 'error', message: 'The tab has no header row.' };

  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var indexByName = {};
  for (var i = 0; i < header.length; i++) {
    if (header[i]) indexByName[header[i]] = i;
  }

  if (indexByName[KEY_COLUMN] === undefined) {
    return { status: 'error', message: 'The sheet has no "' + KEY_COLUMN + '" column.' };
  }

  var row = findRowByKey(sheet, indexByName[KEY_COLUMN], uniqueId);
  if (row < 0) {
    // Not an error worth shouting about: the request may pre-date the
    // link, in which case the next full submission will create it.
    return { status: 'ok', mode: 'not-found', key: uniqueId };
  }

  var written = [];
  var skipped = [];

  for (var field in updates) {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) continue;

    var columnName = FIELD_TO_COLUMN[field];
    if (!columnName || indexByName[columnName] === undefined) {
      skipped.push(field);
      continue;
    }
    sheet.getRange(row, indexByName[columnName] + 1).setValue(updates[field]);
    written.push(columnName);
  }

  return { status: 'ok', mode: 'updated', row: row, key: uniqueId, written: written, skipped: skipped };
}

/** Scans the key column only — one read, cheap even at tens of thousands of rows. */
function findRowByKey(sheet, keyCol, key) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  var ids = sheet.getRange(2, keyCol + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === String(key).trim()) return i + 2;
  }
  return -1;
}

/**
 * Run this ONCE from the Apps Script editor (select setupSheet → Run).
 *
 * Creates the tab and writes the header row, frozen and formatted. Refuses
 * to touch a tab that already has content, so it can never overwrite real
 * data if someone runs it again by accident.
 */
function setupSheet() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(DIESEL_TAB) || ss.insertSheet(DIESEL_TAB);

  if (sheet.getLastRow() > 0) {
    throw new Error(
      'Tab "' + DIESEL_TAB + '" already has data. setupSheet() only writes the header to an empty tab, ' +
      'so it cannot overwrite anything. Clear the tab first if that is really what you want.'
    );
  }

  sheet.getRange(1, 1, 1, DIESEL_HEADER.length).setValues([DIESEL_HEADER]);
  sheet.getRange(1, 1, 1, DIESEL_HEADER.length)
    .setFontWeight('bold')
    .setBackground('#0F172A')
    .setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, DIESEL_HEADER.length);

  return 'Header written: ' + DIESEL_HEADER.length + ' columns.';
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Open the /exec URL in a browser tab to confirm the deployment is live.
 *
 * Reports whether the tab exists and whether its header matches, so a
 * mismatch is visible before anyone tries to file a request rather than
 * as a failed write afterwards.
 */
function doGet() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(DIESEL_TAB);
  if (!sheet) {
    return respond({ status: 'ok', message: 'Endpoint live, but tab "' + DIESEL_TAB + '" does not exist yet. Run setupSheet().' });
  }

  var lastCol = sheet.getLastColumn();
  var header = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
  var missing = DIESEL_HEADER.filter(function (h) { return header.indexOf(h) === -1; });

  return respond({
    status: 'ok',
    message: 'Diesel endpoint is live.',
    tab: DIESEL_TAB,
    rows: Math.max(0, sheet.getLastRow() - 1),
    headerOk: missing.length === 0,
    missingColumns: missing
  });
}
