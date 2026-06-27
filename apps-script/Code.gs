// Google Apps Script — taavoura-scheduler constraints backend
// הדבק קוד זה ב-Apps Script המחובר ל-Google Sheet שלך
// פרסם כ-Web App: Execute as "Me", Who has access "Anyone"

const SHEET_NAME = 'אילוצים'

// ── Entry point ──────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    const raw  = e.postData ? e.postData.contents : ''
    const data = JSON.parse(raw)
    writeConstraints(data)
    return jsonResponse({ ok: true })
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message })
  }
}

// Allow browser preflight (OPTIONS) — needed for some fetch configurations
function doGet(e) {
  return jsonResponse({ ok: true, message: 'taavoura-constraints endpoint active' })
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
}

// ── Core logic ───────────────────────────────────────────────────────────────

function writeConstraints(data) {
  const { name, start, end, constraints } = data
  if (!name || !start || !end) throw new Error('missing required fields')

  const ss    = SpreadsheetApp.getActiveSpreadsheet()
  let   sheet = ss.getSheetByName(SHEET_NAME)

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME)
    // Freeze header row
    sheet.setFrozenRows(1)
  }

  // ── Build date index (column A) ──
  ensureDates(sheet, start, end)

  // Re-read after ensuring dates exist
  const allData = sheet.getDataRange().getValues()
  const dateToRow = {}
  for (let i = 1; i < allData.length; i++) {
    const v = allData[i][0]
    if (v) dateToRow[String(v).trim()] = i + 1  // 1-based row
  }

  // ── Find or create employee column ──
  const headerRow  = allData[0] || []
  let   colIdx     = headerRow.findIndex(h => String(h).trim() === name)
  if (colIdx === -1) {
    colIdx = headerRow.filter(Boolean).length  // next empty header slot
    sheet.getRange(1, colIdx + 1).setValue(name)
    // Style header cell
    const hCell = sheet.getRange(1, colIdx + 1)
    hCell.setBackground('#1e3a5f')
    hCell.setFontColor('#ffffff')
    hCell.setFontWeight('bold')
  }

  // ── Clear existing constraints for this employee ──
  const lastRow = sheet.getLastRow()
  if (lastRow > 1) {
    sheet.getRange(2, colIdx + 1, lastRow - 1, 1).clearContent()
  }

  // ── Write new constraints ──
  constraints.forEach(({ date, label }) => {
    const row = dateToRow[date]
    if (row) sheet.getRange(row, colIdx + 1).setValue(label)
  })

  // ── Log submission ──
  logSubmission(name, start, end, constraints.length)
}

// ── Ensure all dates in range exist as rows in column A ──────────────────────

function ensureDates(sheet, start, end) {
  const tz       = Session.getScriptTimeZone()
  const existing = {}

  // Read current date column
  const lastRow  = sheet.getLastRow()
  if (lastRow > 1) {
    const colA = sheet.getRange(2, 1, lastRow - 1, 1).getValues()
    colA.forEach(([v]) => { if (v) existing[String(v).trim()] = true })
  }

  // Generate dates in range
  const cur = new Date(start + 'T00:00:00')
  const end_ = new Date(end   + 'T00:00:00')
  const toAdd = []

  while (cur <= end_) {
    const dateStr = Utilities.formatDate(cur, tz, 'yyyy-MM-dd')
    if (!existing[dateStr]) toAdd.push(dateStr)
    cur.setDate(cur.getDate() + 1)
  }

  if (toAdd.length === 0) return

  // Append missing dates
  const nextRow = sheet.getLastRow() + 1
  const data    = toAdd.map(d => [d])
  sheet.getRange(nextRow, 1, data.length, 1).setValues(data)

  // Sort by date (column A), skipping header
  const total = sheet.getLastRow()
  if (total > 2) {
    sheet.getRange(2, 1, total - 1, sheet.getLastColumn())
      .sort({ column: 1, ascending: true })
  }
}

// ── Submission log (optional sheet) ─────────────────────────────────────────

function logSubmission(name, start, end, count) {
  const ss   = SpreadsheetApp.getActiveSpreadsheet()
  let   log  = ss.getSheetByName('יומן הגשות')
  if (!log) {
    log = ss.insertSheet('יומן הגשות')
    log.appendRow(['זמן', 'שם', 'תקופה', 'מספר אילוצים'])
    log.getRange(1, 1, 1, 4).setFontWeight('bold')
  }
  const tz   = Session.getScriptTimeZone()
  const now  = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm')
  log.appendRow([now, name, `${start} – ${end}`, count])
}
