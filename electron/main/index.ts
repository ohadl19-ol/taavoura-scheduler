import { app, BrowserWindow, ipcMain, dialog, shell, clipboard } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { publishToPages } from './githubPages'

const isDev = process.env['NODE_ENV'] === 'development'

let dataDir: string
let schedulesDir: string
let configPath: string

function initPaths() {
  dataDir = join(app.getPath('userData'), 'data')
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
  const link = await publishToPages(token, html)
  clipboard.writeText(link)
  return link
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

