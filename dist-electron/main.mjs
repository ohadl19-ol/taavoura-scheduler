import { BrowserWindow, app, dialog, ipcMain, shell } from "electron/main";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
//#region electron/main.ts
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var isDev = process.env.NODE_ENV === "development";
var dataDir;
var schedulesDir;
var configPath;
function initPaths() {
	dataDir = path.join(app.getPath("userData"), "data");
	schedulesDir = path.join(dataDir, "schedules");
	configPath = path.join(dataDir, "config.json");
	if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
	if (!fs.existsSync(schedulesDir)) fs.mkdirSync(schedulesDir, { recursive: true });
}
function createWindow() {
	const win = new BrowserWindow({
		width: 1400,
		height: 900,
		minWidth: 1e3,
		minHeight: 700,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			contextIsolation: true,
			nodeIntegration: false
		},
		title: "סידור עבודה — תביעות תעבורה",
		show: false
	});
	if (isDev) {
		win.loadURL("http://localhost:5173");
		win.webContents.openDevTools({ mode: "detach" });
	} else win.loadFile(path.join(__dirname, "../dist/index.html"));
	win.once("ready-to-show", () => win.show());
}
app.whenReady().then(() => {
	initPaths();
	createWindow();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
ipcMain.handle("config:read", () => {
	if (!fs.existsSync(configPath)) return null;
	return JSON.parse(fs.readFileSync(configPath, "utf-8"));
});
ipcMain.handle("config:write", (_e, data) => {
	fs.writeFileSync(configPath, JSON.stringify(data, null, 2), "utf-8");
	return true;
});
ipcMain.handle("config:export", async (_e, data) => {
	const { filePath } = await dialog.showSaveDialog({
		title: "ייצא הגדרות",
		defaultPath: "config.json",
		filters: [{
			name: "JSON",
			extensions: ["json"]
		}]
	});
	if (!filePath) return false;
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
	return true;
});
ipcMain.handle("config:import", async () => {
	const { filePaths } = await dialog.showOpenDialog({
		title: "ייבא הגדרות",
		filters: [{
			name: "JSON",
			extensions: ["json"]
		}],
		properties: ["openFile"]
	});
	if (!filePaths[0]) return null;
	return JSON.parse(fs.readFileSync(filePaths[0], "utf-8"));
});
ipcMain.handle("schedule:list", () => {
	return fs.readdirSync(schedulesDir).filter((f) => f.endsWith(".json")).map((f) => {
		const raw = JSON.parse(fs.readFileSync(path.join(schedulesDir, f), "utf-8"));
		return {
			id: f.replace(".json", ""),
			year: raw.year,
			month: raw.month,
			version: raw.version
		};
	}).sort((a, b) => `${b.year}-${String(b.month).padStart(2, "0")}`.localeCompare(`${a.year}-${String(a.month).padStart(2, "0")}`));
});
ipcMain.handle("schedule:read", (_e, id) => {
	const fp = path.join(schedulesDir, `${id}.json`);
	if (!fs.existsSync(fp)) return null;
	return JSON.parse(fs.readFileSync(fp, "utf-8"));
});
ipcMain.handle("schedule:write", (_e, id, data) => {
	fs.writeFileSync(path.join(schedulesDir, `${id}.json`), JSON.stringify(data, null, 2), "utf-8");
	return true;
});
ipcMain.handle("schedule:delete", (_e, id) => {
	const fp = path.join(schedulesDir, `${id}.json`);
	if (fs.existsSync(fp)) fs.unlinkSync(fp);
	return true;
});
ipcMain.handle("export:html", async (_e, filename, html) => {
	const { filePath } = await dialog.showSaveDialog({
		title: "ייצא HTML להפצה",
		defaultPath: filename,
		filters: [{
			name: "HTML",
			extensions: ["html"]
		}]
	});
	if (!filePath) return false;
	fs.writeFileSync(filePath, html, "utf-8");
	shell.openPath(filePath);
	return true;
});
//#endregion
export {};
