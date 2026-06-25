"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const isDev = process.env["NODE_ENV"] === "development";
let dataDir;
let schedulesDir;
let configPath;
function initPaths() {
  dataDir = path.join(electron.app.getPath("userData"), "data");
  schedulesDir = path.join(dataDir, "schedules");
  configPath = path.join(dataDir, "config.json");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(schedulesDir)) fs.mkdirSync(schedulesDir, { recursive: true });
}
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1e3,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    title: "סידור עבודה — תביעות תעבורה",
    show: false
  });
  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  win.once("ready-to-show", () => win.show());
}
electron.app.whenReady().then(() => {
  initPaths();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.ipcMain.handle("config:read", () => {
  if (!fs.existsSync(configPath)) return null;
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
});
electron.ipcMain.handle("config:write", (_e, data) => {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), "utf-8");
  return true;
});
electron.ipcMain.handle("config:export", async (_e, data) => {
  const { filePath } = await electron.dialog.showSaveDialog({
    title: "ייצא הגדרות",
    defaultPath: "config.json",
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (!filePath) return false;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  return true;
});
electron.ipcMain.handle("config:import", async () => {
  const { filePaths } = await electron.dialog.showOpenDialog({
    title: "ייבא הגדרות",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"]
  });
  if (!filePaths[0]) return null;
  return JSON.parse(fs.readFileSync(filePaths[0], "utf-8"));
});
electron.ipcMain.handle("schedule:list", () => {
  const files = fs.readdirSync(schedulesDir).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(schedulesDir, f), "utf-8"));
      if (!raw.startDate) return null;
      return { id: f.replace(".json", ""), startDate: raw.startDate, endDate: raw.endDate, version: raw.version };
    } catch {
      return null;
    }
  }).filter((s) => s !== null).sort((a, b) => b.startDate.localeCompare(a.startDate));
});
electron.ipcMain.handle("schedule:read", (_e, id) => {
  const fp = path.join(schedulesDir, `${id}.json`);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, "utf-8"));
});
electron.ipcMain.handle("schedule:write", (_e, id, data) => {
  fs.writeFileSync(path.join(schedulesDir, `${id}.json`), JSON.stringify(data, null, 2), "utf-8");
  return true;
});
electron.ipcMain.handle("schedule:delete", (_e, id) => {
  const fp = path.join(schedulesDir, `${id}.json`);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  return true;
});
electron.ipcMain.handle("export:html", async (_e, filename, html) => {
  const { filePath } = await electron.dialog.showSaveDialog({
    title: "ייצא HTML להפצה",
    defaultPath: filename,
    filters: [{ name: "HTML", extensions: ["html"] }]
  });
  if (!filePath) return false;
  fs.writeFileSync(filePath, html, "utf-8");
  electron.shell.openPath(filePath);
  return true;
});
electron.ipcMain.handle("export:pdf", async (_e, filename, html) => {
  const { filePath } = await electron.dialog.showSaveDialog({
    title: "ייצא PDF",
    defaultPath: filename,
    filters: [{ name: "PDF", extensions: ["pdf"] }]
  });
  if (!filePath) return false;
  const tmpPath = path.join(electron.app.getPath("temp"), "taavoura-pdf-tmp.html");
  fs.writeFileSync(tmpPath, html, "utf-8");
  const pdfWin = new electron.BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  try {
    await pdfWin.loadFile(tmpPath);
    const pdfBuffer = await pdfWin.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: { marginType: "none" },
      preferCSSPageSize: true,
      landscape: false
    });
    fs.writeFileSync(filePath, pdfBuffer);
    electron.shell.openPath(filePath);
    return true;
  } finally {
    pdfWin.destroy();
    try {
      fs.unlinkSync(tmpPath);
    } catch {
    }
  }
});
