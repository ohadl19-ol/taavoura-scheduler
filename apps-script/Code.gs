var SHEET_NAME = 'אילוצים';
var LOG_SHEET  = 'יומן הגשות';

function doPost(e) {
  try {
    var raw  = e.postData ? e.postData.contents : '';
    var data = JSON.parse(raw);
    writeConstraints(data);
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function doGet(e) {
  return jsonResponse({ ok: true, status: 'active' });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Converts a cell value (possibly a Date object) to "YYYY-MM-DD" string
function cellToDateStr(cell) {
  if (cell instanceof Date) {
    return Utilities.formatDate(cell, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(cell).trim();
}

function writeConstraints(data) {
  var name        = data.name;
  var start       = data.start;
  var end         = data.end;
  var constraints = data.constraints || [];

  if (!name || !start || !end) throw new Error('missing fields');

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1).setValue('תאריך');
  }

  // Ensure row 1 is a proper header
  var r1v = sheet.getRange(1, 1).getValue();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cellToDateStr(r1v))) {
    // Old structure: A1 has a date — insert header row above
    sheet.insertRowBefore(1);
    sheet.setFrozenRows(1);
  }
  // Always ensure A1 = 'תאריך' (covers empty/cleared sheets too)
  sheet.getRange(1, 1).setValue('תאריך');

  ensureDates(sheet, start, end);

  // Re-read after ensureDates
  var allData   = sheet.getDataRange().getValues();
  var dateToRow = {};
  for (var i = 1; i < allData.length; i++) {
    var v = cellToDateStr(allData[i][0]);
    if (v) dateToRow[v] = i + 1;
  }

  // Find or create column for this employee
  var headerRow = allData[0] || [];
  var colIdx = -1;
  for (var h = 0; h < headerRow.length; h++) {
    if (String(headerRow[h]).trim() === name) { colIdx = h; break; }
  }
  if (colIdx === -1) {
    colIdx = 0;
    while (colIdx < headerRow.length && headerRow[colIdx]) colIdx++;
    var hCell = sheet.getRange(1, colIdx + 1);
    hCell.setValue(name);
    hCell.setBackground('#1e3a5f');
    hCell.setFontColor('#ffffff');
    hCell.setFontWeight('bold');
  }

  // Clear previous entries for this employee, then write new ones
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, colIdx + 1, lastRow - 1, 1).clearContent();
  }

  for (var c = 0; c < constraints.length; c++) {
    var row = dateToRow[constraints[c].date];
    if (row) sheet.getRange(row, colIdx + 1).setValue(constraints[c].label);
  }

  logSubmission(ss, name, start, end, constraints.length);
}

function ensureDates(sheet, start, end) {
  var tz      = Session.getScriptTimeZone();
  var existing = {};
  var lastRow  = sheet.getLastRow();

  if (lastRow > 1) {
    var colA = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < colA.length; i++) {
      var v = cellToDateStr(colA[i][0]);
      if (v) existing[v] = true;
    }
  }

  var cur   = new Date(start + 'T00:00:00');
  var endD  = new Date(end   + 'T00:00:00');
  var toAdd = [];

  while (cur <= endD) {
    var ds = Utilities.formatDate(cur, tz, 'yyyy-MM-dd');
    if (!existing[ds]) toAdd.push([ds]);
    cur.setDate(cur.getDate() + 1);
  }

  if (toAdd.length === 0) return;

  // Dates always start from row 2 (row 1 is the header)
  var nextRow = Math.max(sheet.getLastRow() + 1, 2);
  var rng = sheet.getRange(nextRow, 1, toAdd.length, 1);
  rng.setNumberFormat('@');   // store as plain text, not Date object
  rng.setValues(toAdd);

  var total = sheet.getLastRow();
  if (total > 2) {
    sheet.getRange(2, 1, total - 1, sheet.getLastColumn())
      .sort({ column: 1, ascending: true });
  }
}

function logSubmission(ss, name, start, end, count) {
  var log = ss.getSheetByName(LOG_SHEET);
  if (!log) {
    log = ss.insertSheet(LOG_SHEET);
    log.appendRow(['זמן', 'שם', 'תקופה', 'מספר אילוצים']);
    log.getRange(1, 1, 1, 4).setFontWeight('bold');
  }
  var tz  = Session.getScriptTimeZone();
  var now = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  log.appendRow([now, name, start + ' - ' + end, count]);
}
