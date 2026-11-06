import { app, BrowserWindow, ipcMain, dialog, shell, clipboard } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, cpSync } from 'fs'
import { publishToPages } from './githubPages'
import { fetchCourtDiary, type DiaryRequest } from './courtDiary'
import ExcelJS from 'exceljs'

const isDev = process.env['NODE_ENV'] === 'development'

let dataDir: string
let schedulesDir: string
let configPath: string

// מיקום תיקיית הנתונים נשמר בקובץ קטן ב-userData, כדי שאפשר יהיה להעביר
// את הנתונים לתיקייה לבחירת המשתמש (למשל iCloud) בלי לאבד את ההפניה.
const defaultDataDir = () => join(app.getPath('userData'), 'data')
const locationFile   = () => join(app.getPath('userData'), 'data-location.json')

function readCustomDataDir(): string | null {
  try {
    const dir = JSON.parse(readFileSync(locationFile(), 'utf-8')).dataDir
    return typeof dir === 'string' && dir ? dir : null
  } catch { return null }
}

function initPaths() {
  const custom = readCustomDataDir()
  dataDir = custom && existsSync(custom) ? custom : defaultDataDir()
  schedulesDir = join(dataDir, 'schedules')
  configPath = join(dataDir, 'config.json')
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  if (!existsSync(schedulesDir)) mkdirSync(schedulesDir, { recursive: true })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: 'סידור עבודה — תביעות תעבורה',
    show: false,
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.once('ready-to-show', () => win.show())
}

app.whenReady().then(() => {
  initPaths()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC: Config ──────────────────────────────────────────────────────────────

ipcMain.handle('config:read', () => {
  if (!existsSync(configPath)) return null
  return JSON.parse(readFileSync(configPath, 'utf-8'))
})

ipcMain.handle('config:write', (_e, data: unknown) => {
  writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8')
  return true
})

ipcMain.handle('config:export', async (_e, data: unknown) => {
  const { filePath } = await dialog.showSaveDialog({
    title: 'ייצא הגדרות',
    defaultPath: 'config.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (!filePath) return false
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  return true
})

ipcMain.handle('config:import', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'ייבא הגדרות',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (!filePaths[0]) return null
  return JSON.parse(readFileSync(filePaths[0], 'utf-8'))
})

// ── IPC: Schedules ───────────────────────────────────────────────────────────

ipcMain.handle('schedule:list', () => {
  const files = readdirSync(schedulesDir).filter((f: string) => f.endsWith('.json'))
  return files
    .map((f: string) => {
      try {
        const raw = JSON.parse(readFileSync(join(schedulesDir, f), 'utf-8'))
        if (!raw.startDate) return null   // skip old-format files
        return { id: f.replace('.json', ''), startDate: raw.startDate as string, endDate: raw.endDate as string, version: raw.version as number }
      } catch {
        return null
      }
    })
    .filter((s): s is { id: string; startDate: string; endDate: string; version: number } => s !== null)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
})

ipcMain.handle('schedule:read', (_e, id: string) => {
  const fp = join(schedulesDir, `${id}.json`)
  if (!existsSync(fp)) return null
  return JSON.parse(readFileSync(fp, 'utf-8'))
})

ipcMain.handle('schedule:write', (_e, id: string, data: unknown) => {
  writeFileSync(join(schedulesDir, `${id}.json`), JSON.stringify(data, null, 2), 'utf-8')
  return true
})

ipcMain.handle('schedule:delete', (_e, id: string) => {
  const fp = join(schedulesDir, `${id}.json`)
  if (existsSync(fp)) unlinkSync(fp)
  return true
})

// ── IPC: HTML Export ─────────────────────────────────────────────────────────

ipcMain.handle('export:excel', async (_e, filename: string, headers: string[], rows: string[][]) => {
  const { filePath } = await dialog.showSaveDialog({
    title: 'ייצא Excel',
    defaultPath: filename,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  })
  if (!filePath) return false

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('סידור עבודה', { views: [{ rightToLeft: true }] })

  ws.addRow(headers)
  const hdrRow = ws.getRow(1)
  hdrRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } }
    cell.font = { color: { argb: 'FFC7D2FE' }, bold: true, size: 11 }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  hdrRow.height = 22

  rows.forEach((row, ri) => {
    const wsRow = ws.addRow(row)
    const isWeekend = row[1] === 'שישי' || row[1] === 'שבת'
    wsRow.eachCell((cell, colNum) => {
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      if (isWeekend) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
        cell.font = { color: { argb: 'FF9CA3AF' }, italic: true }
      } else if (colNum <= 2) {
        cell.font = { bold: true }
      }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } }
    })
    wsRow.height = 20
    if (ri % 2 === 0 && !isWeekend) {
      wsRow.eachCell(cell => {
        if (!cell.fill || (cell.fill as ExcelJS.FillPattern).fgColor?.argb === 'FFF3F4F6') return
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
      })
    }
  })

  ws.getColumn(1).width = 12
  ws.getColumn(2).width = 8
  for (let c = 3; c <= headers.length; c++) ws.getColumn(c).width = 14

  const buf = await wb.xlsx.writeBuffer()
  writeFileSync(filePath, Buffer.from(buf))
  shell.openPath(filePath)
  return true
})

ipcMain.handle('export:html', async (_e, filename: string, html: string) => {
  const { filePath } = await dialog.showSaveDialog({
    title: 'ייצא HTML להפצה',
    defaultPath: filename,
    filters: [{ name: 'HTML', extensions: ['html'] }],
  })
  if (!filePath) return false
  writeFileSync(filePath, html, 'utf-8')
  shell.openPath(filePath)
  return true
})

// ── IPC: GitHub Pages ────────────────────────────────────────────────────────

ipcMain.handle('pages:publish', async (_e, token: string, html: string) => {
  const { url, verified } = await publishToPages(token, html)
  clipboard.writeText(url)
  return { url, verified }
})



// ── IPC: PDF Export ───────────────────────────────────────────────────────────

ipcMain.handle('export:pdf', async (_e, filename: string, html: string) => {
  const { filePath } = await dialog.showSaveDialog({
    title: 'ייצא PDF',
    defaultPath: filename,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (!filePath) return false

  const tmpPath = join(app.getPath('temp'), 'taavoura-pdf-tmp.html')
  writeFileSync(tmpPath, html, 'utf-8')

  const pdfWin = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  })

  try {
    await pdfWin.loadFile(tmpPath)
    const pdfBuffer = await pdfWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'none' },
      preferCSSPageSize: true,
      landscape: false,
    })
    writeFileSync(filePath, pdfBuffer)
    shell.openPath(filePath)
    return true
  } finally {
    pdfWin.destroy()
    try { unlinkSync(tmpPath) } catch { /* ignore */ }
  }
})



// ── IPC: Data folder ─────────────────────────────────────────────────────────

ipcMain.handle('storage:info', () => {
  const custom = readCustomDataDir()
  return { dir: dataDir, isDefault: dataDir === defaultDataDir(), missingCustom: !!custom && custom !== dataDir }
})

ipcMain.handle('storage:open', () => shell.openPath(dataDir))

ipcMain.handle('storage:choose', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'בחר תיקייה לשמירת נתוני הסידור',
    buttonLabel: 'בחר תיקייה',
    properties: ['openDirectory', 'createDirectory'],
  })
  const target = filePaths[0]
  if (!target || target === dataDir) return false

  const hasData = existsSync(join(target, 'config.json')) || existsSync(join(target, 'schedules'))
  if (hasData) {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: ['השתמש בנתונים שבתיקייה', 'ביטול'],
      defaultId: 0, cancelId: 1,
      message: 'בתיקייה שבחרת כבר יש נתוני סידור.',
      detail: 'האפליקציה תעבור לעבוד עם הנתונים שבתיקייה הזו. הנתונים הנוכחיים לא יימחקו.',
    })
    if (response !== 0) return false
  } else {
    cpSync(dataDir, target, { recursive: true })
  }

  writeFileSync(locationFile(), JSON.stringify({ dataDir: target }, null, 2), 'utf-8')
  app.relaunch()
  app.exit(0)
  return true
})

// ── IPC: Import table (Excel / CSV) ──────────────────────────────────────────

function excelCellToText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) {
    // ExcelJS מחזיר תאריכים ב-UTC
    return `${String(v.getUTCDate()).padStart(2, '0')}.${String(v.getUTCMonth() + 1).padStart(2, '0')}.${v.getUTCFullYear()}`
  }
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map(t => t.text).join('')
    if ('result' in v) return excelCellToText(v.result as ExcelJS.CellValue)
    if ('text' in v) return String(v.text)
    return ''
  }
  return String(v)
}

ipcMain.handle('import:pickTable', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'בחר קובץ סידור',
    filters: [{ name: 'Excel / CSV', extensions: ['xlsx', 'csv', 'txt'] }],
    properties: ['openFile'],
  })
  const fp = filePaths[0]
  if (!fp) return null
  const name = fp.split(/[\\/]/).pop() ?? ''

  if (!/\.xlsx$/i.test(fp)) {
    return { name, text: readFileSync(fp, 'utf-8').replace(/^\uFEFF/, '') }
  }

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(fp)
  const sheets: string[][][] = []
  wb.eachSheet(ws => {
    if (ws.state && ws.state !== 'visible') return
    const grid: string[][] = []
    ws.eachRow({ includeEmpty: true }, (row, rn) => {
      const cells: string[] = []
      for (let c = 1; c <= ws.columnCount; c++) cells.push(excelCellToText(row.getCell(c).value).trim())
      grid[rn - 1] = cells
    })
    sheets.push(Array.from(grid, r => r ?? []))
  })
  return { name, sheets }
})

// ── IPC: Template for the person who builds the schedule ────────────────────

interface TemplatePayload {
  filename: string
  title: string
  prosecutors: string[]
  rows: { date: string; day: string; weekend: boolean; cells: string[]; sittings?: string }[]
  options: string[]
}

ipcMain.handle('export:template', async (_e, p: TemplatePayload) => {
  const { filePath } = await dialog.showSaveDialog({
    title: 'שמור תבנית סידור',
    defaultPath: p.filename,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  })
  if (!filePath) return false

  // עמודת "יושבים היום" (מיומן השופטים) — רק בתבנית למכין, לא בסידור לתובעים
  const withSit = p.rows.some(r => r.sittings)
  const lead = withSit ? 3 : 2
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('סידור', { views: [{ rightToLeft: true, state: 'frozen', xSplit: lead, ySplit: 2 }] })
  const lists = wb.addWorksheet('רשימות', { state: 'hidden' })
  p.options.forEach((o, i) => { lists.getCell(i + 1, 1).value = o })

  const lastCol = p.prosecutors.length + lead
  ws.mergeCells(1, 1, 1, lastCol)
  const t = ws.getCell(1, 1)
  t.value = p.title
  t.font = { bold: true, size: 13, color: { argb: 'FF1E3A5F' } }
  t.alignment = { horizontal: 'center' }

  const hdr = ws.getRow(2)
  ;['תאריך', 'יום', ...(withSit ? ['יושבים היום'] : []), ...p.prosecutors].forEach((h, i) => { hdr.getCell(i + 1).value = h })
  hdr.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.alignment = { horizontal: 'center' }
  })

  const listRef = `'רשימות'!$A$1:$A$${Math.max(1, p.options.length)}`
  p.rows.forEach((r, i) => {
    const row = ws.getRow(i + 3)
    row.getCell(1).value = r.date
    row.getCell(2).value = r.day
    if (withSit) row.getCell(3).value = r.sittings || null
    r.cells.forEach((v, ci) => { row.getCell(ci + lead + 1).value = v || null })
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c)
      cell.alignment = { horizontal: 'center' }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } } }
      if (r.weekend) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
      if (c <= 2) cell.font = { bold: true }
      else if (c === 3 && withSit) {
        cell.font = { size: 9, color: { argb: 'FF7C2D12' } }
        cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true }
        if (!r.weekend) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } }
      }
      else cell.dataValidation = {
        type: 'list', allowBlank: true, formulae: [listRef],
        showErrorMessage: false,  // מותר גם להקליד טקסט חופשי
      }
    }
  })

  ws.getColumn(1).width = 12
  ws.getColumn(2).width = 8
  if (withSit) ws.getColumn(3).width = 30
  for (let c = lead + 1; c <= lastCol; c++) ws.getColumn(c).width = 14

  const note = ws.getRow(p.rows.length + 4).getCell(1)
  note.value = 'בחרו מהרשימה הנפתחת בכל תא, או הקלידו טקסט חופשי. אין לשנות את שמות התובעים בכותרת ואת עמודת התאריך.'
  note.font = { italic: true, color: { argb: 'FF6B7280' } }
  if (withSit) {
    const n2 = ws.getRow(p.rows.length + 5).getCell(1)
    n2.value = '"יושבים היום" — מספר הדיונים לכל שופט לפי נט המשפט (לא כולל תיקים חסויים), לעזרה בשיבוץ. לשימוש פנימי — לא להעביר לתובעים.'
    n2.font = { italic: true, color: { argb: 'FF7C2D12' } }
  }

  await wb.xlsx.writeFile(filePath)
  shell.showItemInFolder(filePath)
  return true
})

// ── יומן בית משפט מהאתר הציבורי של נט המשפט ──────────────────────────────────
let diaryBusy = false
ipcMain.handle('diary:fetch', async (e, req: DiaryRequest) => {
  if (diaryBusy) return { ok: false, error: 'שליפה כבר רצה' }
  diaryBusy = true
  try {
    const data = await fetchCourtDiary(req, text => { if (!e.sender.isDestroyed()) e.sender.send('diary:progress', text) })
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    diaryBusy = false
  }
})
