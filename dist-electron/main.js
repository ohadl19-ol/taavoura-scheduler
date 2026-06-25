//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
let electron = require("electron");
let path = require("path");
path = __toESM(path);
let fs = require("fs");
fs = __toESM(fs);
//#region electron/main.ts
var isDev = process.env.NODE_ENV === "development";
var dataDir;
var schedulesDir;
var configPath;
function initPaths() {
	dataDir = path.default.join(electron.app.getPath("userData"), "data");
	schedulesDir = path.default.join(dataDir, "schedules");
	configPath = path.default.join(dataDir, "config.json");
	if (!fs.default.existsSync(dataDir)) fs.default.mkdirSync(dataDir, { recursive: true });
	if (!fs.default.existsSync(schedulesDir)) fs.default.mkdirSync(schedulesDir, { recursive: true });
}
function createWindow() {
	const win = new electron.BrowserWindow({
		width: 1400,
		height: 900,
		minWidth: 1e3,
		minHeight: 700,
		webPreferences: {
			preload: path.default.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false
		},
		title: "סידור עבודה — תביעות תעבורה",
		show: false
	});
	if (isDev) {
		win.loadURL("http://localhost:5173");
		win.webContents.openDevTools({ mode: "detach" });
	} else win.loadFile(path.default.join(__dirname, "../dist/index.html"));
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
	if (!fs.default.existsSync(configPath)) return null;
	return JSON.parse(fs.default.readFileSync(configPath, "utf-8"));
});
electron.ipcMain.handle("config:write", (_e, data) => {
	fs.default.writeFileSync(configPath, JSON.stringify(data, null, 2), "utf-8");
	return true;
});
electron.ipcMain.handle("config:export", async (_e, data) => {
	const { filePath } = await electron.dialog.showSaveDialog({
		title: "ייצא הגדרות",
		defaultPath: "config.json",
		filters: [{
			name: "JSON",
			extensions: ["json"]
		}]
	});
	if (!filePath) return false;
	fs.default.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
	return true;
});
electron.ipcMain.handle("config:import", async () => {
	const { filePaths } = await electron.dialog.showOpenDialog({
		title: "ייבא הגדרות",
		filters: [{
			name: "JSON",
			extensions: ["json"]
		}],
		properties: ["openFile"]
	});
	if (!filePaths[0]) return null;
	return JSON.parse(fs.default.readFileSync(filePaths[0], "utf-8"));
});
electron.ipcMain.handle("schedule:list", () => {
	return fs.default.readdirSync(schedulesDir).filter((f) => f.endsWith(".json")).map((f) => {
		const raw = JSON.parse(fs.default.readFileSync(path.default.join(schedulesDir, f), "utf-8"));
		return {
			id: f.replace(".json", ""),
			year: raw.year,
			month: raw.month,
			version: raw.version
		};
	}).sort((a, b) => `${b.year}-${String(b.month).padStart(2, "0")}`.localeCompare(`${a.year}-${String(a.month).padStart(2, "0")}`));
});
electron.ipcMain.handle("schedule:read", (_e, id) => {
	const fp = path.default.join(schedulesDir, `${id}.json`);
	if (!fs.default.existsSync(fp)) return null;
	return JSON.parse(fs.default.readFileSync(fp, "utf-8"));
});
electron.ipcMain.handle("schedule:write", (_e, id, data) => {
	fs.default.writeFileSync(path.default.join(schedulesDir, `${id}.json`), JSON.stringify(data, null, 2), "utf-8");
	return true;
});
electron.ipcMain.handle("schedule:delete", (_e, id) => {
	const fp = path.default.join(schedulesDir, `${id}.json`);
	if (fs.default.existsSync(fp)) fs.default.unlinkSync(fp);
	return true;
});
electron.ipcMain.handle("export:html", async (_e, filename, html) => {
	const { filePath } = await electron.dialog.showSaveDialog({
		title: "ייצא HTML להפצה",
		defaultPath: filename,
		filters: [{
			name: "HTML",
			extensions: ["html"]
		}]
	});
	if (!filePath) return false;
	fs.default.writeFileSync(filePath, html, "utf-8");
	electron.shell.openPath(filePath);
	return true;
});
//#endregion
