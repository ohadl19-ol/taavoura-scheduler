"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");
const OWNER = "ohadl19-ol";
const REPO = "taavoura-scheduler";
const BRANCH = "gh-pages";
const FILE = "index.html";
async function ghFetch(token, path2, opts = {}) {
  const resp = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path2}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...opts.headers ?? {}
    }
  });
  return resp;
}
async function ensureBranch(token) {
  const check = await ghFetch(token, `/branches/${BRANCH}`);
  if (check.ok) return;
  const defaultResp = await ghFetch(token, "/git/ref/heads/main");
  if (!defaultResp.ok) throw new Error("Cannot read main branch");
  const { object } = await defaultResp.json();
  const createResp = await ghFetch(token, "/git/refs", {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: object.sha })
  });
  if (!createResp.ok) {
    const text = await createResp.text();
    throw new Error(`Cannot create gh-pages branch: ${text}`);
  }
}
async function enablePages(token) {
  await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/pages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ source: { branch: BRANCH, path: "/" } })
  });
}
async function publishToPages(token, html) {
  await ensureBranch(token);
  let sha;
  const getResp = await ghFetch(token, `/contents/${FILE}?ref=${BRANCH}`);
  if (getResp.ok) {
    const data = await getResp.json();
    sha = data.sha;
  }
  const body = {
    message: "עדכון סידור עבודה",
    content: Buffer.from(html).toString("base64"),
    branch: BRANCH
  };
  if (sha) body.sha = sha;
  const putResp = await ghFetch(token, `/contents/${FILE}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
  if (!putResp.ok) {
    const text = await putResp.text();
    throw new Error(`GitHub publish failed: ${text}`);
  }
  const putData = await putResp.json();
  const newSha = putData.content.sha;
  await enablePages(token);
  const verifyResp = await ghFetch(token, `/contents/${FILE}?ref=${BRANCH}`);
  let verified = false;
  if (verifyResp.ok) {
    const verifyData = await verifyResp.json();
    verified = verifyData.sha === newSha;
  }
  return { url: `https://${OWNER}.github.io/${REPO}/`, verified };
}
const HOME = "https://www.court.gov.il/NGCS.Web.Site/HomePage.aspx";
const COURT_SEL = "_ctl0_Basereportcontrol2__ctl0_NGCSWebComboBoxCourt";
const DATE_INP = "_ctl0_Basereportcontrol2__ctl0_NGCSWebCalendar";
const PARSE_WEEK = `(() => {
  const t = document.body.innerText, k = t.indexOf('יום א');
  const dates = k < 0 ? [] : (t.slice(k).match(/\\d{2}\\/\\d{2}\\/\\d{4}/g) || []).slice(0, 7);
  let tr = null, best = 0;
  for (const r of document.querySelectorAll('tr')) {
    if (r.cells.length !== 7) continue;
    const n = [...r.querySelectorAll('tr')].filter(x => [...x.cells].some(c => /^\\d+$/.test(c.innerText.trim()))).length;
    if (n > best) { best = n; tr = r; }
  }
  if (!tr || dates.length < 5) return { dates, rows: [], empty: !tr };
  const out = [];
  [...tr.cells].forEach((td, i) => {
    let j = null;
    for (const el of td.querySelectorAll('a, tr')) {
      if (el.tagName === 'A') { j = { judge: el.textContent.trim(), date: dates[i], items: [] }; out.push(j); continue; }
      if (!j || el.querySelector('a') || el.querySelector('tr')) continue;
      const c = [...el.cells].map(x => x.innerText.replace(/\\s+/g, ' ').trim());
      const n = c.find(x => /^\\d+$/.test(x)), ty = c.find(x => x && !/^\\d+$/.test(x));
      if (n && ty) j.items.push([ty, Number(n)]);
    }
  });
  return { dates, rows: out };
})()`;
const cat = (ty) => /טיעונים לעונש|גזר דין/.test(ty) ? "sen" : /^הקראה/.test(ty) ? "arr" : /הוכחות/.test(ty) ? "proof" : "other";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchCourtDiary(req, progress) {
  const win = new electron.BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  const wc = win.webContents;
  wc.on("will-navigate", (e, url) => {
    if (!url.startsWith("https://www.court.gov.il/")) e.preventDefault();
  });
  wc.setWindowOpenHandler(() => ({ action: "deny" }));
  const loaded = (timeout = 3e4) => new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      reject(new Error("האתר לא הגיב בזמן"));
    }, timeout);
    const ok = () => {
      cleanup();
      resolve();
    };
    const fail = (_e, code, desc, _url, main) => {
      if (main && code !== -3) {
        cleanup();
        reject(new Error(`שגיאת טעינה: ${desc}`));
      }
    };
    const cleanup = () => {
      clearTimeout(t);
      wc.off("did-finish-load", ok);
      wc.off("did-fail-load", fail);
    };
    wc.on("did-finish-load", ok);
    wc.on("did-fail-load", fail);
  });
  const js = (code) => wc.executeJavaScript(code, true);
  try {
    progress("מתחבר לנט המשפט…");
    const first = loaded();
    await win.loadURL(HOME).catch(() => {
    });
    await first;
    const toDiary = loaded();
    const hasMenu = await js(`typeof __doPostBack === 'function' && (__doPostBack('Header1$UpperMenu1$btnCourtDiary',''), true)`);
    if (!hasMenu) throw new Error('לא נמצא התפריט "יומן בית משפט" באתר');
    await toDiary;
    const collected = [];
    const allDates = /* @__PURE__ */ new Set();
    const steps = req.sundays.flatMap((date) => req.courts.map((court) => ({ date, court })));
    for (let i = 0; i < steps.length; i++) {
      const { date, court } = steps[i];
      progress(`שולף ${i + 1}/${steps.length}: ${court.replace(/^שלום\s*/, "")} · שבוע ${date.slice(0, 5)}`);
      if (await js(`!!document.querySelector('iframe[src*=recaptcha], .g-recaptcha')`)) {
        throw new Error('האתר ביקש אימות "אני לא רובוט" — אפשר לשלוף דרך התוסף בכרום ולייבא קובץ');
      }
      const nav = loaded();
      const err = await js(`(() => {
        const sel = document.getElementById('${COURT_SEL}'), d = document.getElementById('${DATE_INP}');
        if (!sel || !d) return 'לא נמצאו שדות היומן באתר — ייתכן שהדף השתנה';
        const o = [...sel.options].find(o => o.text.trim() === ${JSON.stringify(court)});
        if (!o) return 'בית המשפט "' + ${JSON.stringify(court)} + '" לא נמצא ברשימה באתר';
        sel.value = o.value; d.value = ${JSON.stringify(date)};
        __doPostBack('_ctl0$Basereportcontrol2$makeReportUIButton', '');
        return '';
      })()`);
      if (err) {
        nav.catch(() => {
        });
        throw new Error(err);
      }
      await nav;
      const shown = await js(`({ court: (document.getElementById('${COURT_SEL}')?.selectedOptions[0]?.text || '').trim(), date: document.getElementById('${DATE_INP}')?.value || '' })`);
      if (shown.court !== court || shown.date !== date) throw new Error("האתר הציג שבוע או בית משפט אחר מהמבוקש");
      const w = await js(PARSE_WEEK);
      w.dates.forEach((d) => allDates.add(d));
      w.rows.forEach((r) => collected.push({ ...r, court }));
      await sleep(700);
    }
    const iso = (d) => `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}`;
    const dow = (d) => new Date(+d.slice(6, 10), +d.slice(3, 5) - 1, +d.slice(0, 2)).getDay();
    const days = {};
    for (const d of allDates) if (dow(d) <= 4) days[iso(d)] = [];
    for (const r of collected) {
      const k = iso(r.date);
      if (!days[k]) continue;
      let s = days[k].find((x) => x.judge === r.judge && x.court === r.court);
      if (!s) days[k].push(s = { judge: r.judge, court: r.court, total: 0, arr: 0, proof: 0, sen: 0, other: 0 });
      for (const [ty, n] of r.items) {
        s.total += n;
        s[cat(ty)] += n;
      }
    }
    progress("");
    return { type: "judge-sittings", version: 1, fetchedAt: (/* @__PURE__ */ new Date()).toISOString(), courts: req.courts, days };
  } finally {
    win.destroy();
  }
}
const colLetter = (n) => {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};
async function writeTemplate(p, filePath) {
  const jc = p.judgeCols ?? [];
  const lead = 2 + jc.length;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("סידור", { views: [{ rightToLeft: true, state: "frozen", xSplit: lead, ySplit: 2 }] });
  const lists = wb.addWorksheet("רשימות", { state: "hidden" });
  p.options.forEach((o, i) => {
    lists.getCell(i + 1, 1).value = o;
  });
  const lastCol = p.prosecutors.length + lead;
  ws.mergeCells(1, 1, 1, lastCol);
  const t = ws.getCell(1, 1);
  t.value = p.title;
  t.font = { bold: true, size: 13, color: { argb: "FF1E3A5F" } };
  t.alignment = { horizontal: "center" };
  const hdr = ws.getRow(2);
  ["תאריך", "יום", ...jc.map((j) => `⚖️ ${j.label}`), ...p.prosecutors].forEach((h, i) => {
    hdr.getCell(i + 1).value = h;
  });
  hdr.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.alignment = { horizontal: "center" };
  });
  const listRef = `'רשימות'!$A$1:$A$${Math.max(1, p.options.length)}`;
  p.rows.forEach((r, i) => {
    const row = ws.getRow(i + 3);
    row.getCell(1).value = r.date;
    row.getCell(2).value = r.day;
    jc.forEach((_, k) => {
      const v = r.judges?.[k];
      const cell = row.getCell(3 + k);
      if (v) {
        cell.value = v.n;
        cell.note = v.note;
      } else cell.value = null;
    });
    r.cells.forEach((v, ci) => {
      row.getCell(ci + lead + 1).value = v || null;
    });
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c);
      cell.alignment = { horizontal: "center" };
      cell.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } }, left: { style: "thin", color: { argb: "FFE5E7EB" } } };
      if (r.weekend) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
      if (c <= 2) cell.font = { bold: true };
      else if (c <= lead) {
        cell.font = { bold: true, color: { argb: "FF7C2D12" } };
        cell.numFmt = '0;-0;""';
        if (!r.weekend) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } };
      } else cell.dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [listRef],
        showErrorMessage: false
        // מותר גם להקליד טקסט חופשי
      };
    }
  });
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 8;
  jc.forEach((_, k) => {
    ws.getColumn(3 + k).width = 9;
  });
  for (let c = lead + 1; c <= lastCol; c++) ws.getColumn(c).width = 14;
  const note = ws.getRow(p.rows.length + 4).getCell(1);
  note.value = "בחרו מהרשימה הנפתחת בכל תא, או הקלידו טקסט חופשי. אין לשנות את שמות התובעים בכותרת ואת עמודת התאריך.";
  note.font = { italic: true, color: { argb: "FF6B7280" } };
  if (jc.length) {
    const first = 3, last = p.rows.length + 2;
    const pros = `$${colLetter(lead + 1)}${first}:$${colLetter(lastCol)}${first}`;
    const fill = (argb) => ({ fill: { type: "pattern", pattern: "solid", bgColor: { argb } } });
    const T = p.busyThreshold ?? 100;
    jc.forEach((j, k) => {
      const L = colLetter(3 + k), c = `${L}${first}`, cnt = `COUNTIF(${pros},"*${j.match.replace(/"/g, '""')}*")`;
      ws.addConditionalFormatting({
        ref: `${L}${first}:${L}${last}`,
        rules: [
          { type: "expression", priority: 1, formulae: [`AND(ISNUMBER(${c}),${c}>0,${cnt}=0)`], style: fill("FFFCA5A5") },
          { type: "expression", priority: 2, formulae: [`AND(ISNUMBER(${c}),${c}=0,${cnt}>0)`], style: fill("FFFDBA74") },
          { type: "expression", priority: 3, formulae: [`AND(ISNUMBER(${c}),${c}>=${T},${cnt}=1)`], style: fill("FFFDE68A") },
          { type: "expression", priority: 4, formulae: [`AND(ISNUMBER(${c}),${c}>0,${cnt}>0)`], style: fill("FFBBF7D0") }
        ]
      });
    });
    const lines = [
      "⚖️ עמודות השופטים — מספר הדיונים ביום לפי נט המשפט (לא כולל תיקים חסויים). מעבר עם העכבר על מספר מציג פירוט.",
      `🔴 אדום = השופט יושב ואין תובע בשורה · 🟢 ירוק = יש תובע · 🟠 כתום = שובץ תובע אבל השופט לא יושב · 🟡 צהוב = ${T}+ דיונים עם תובע אחד. "גישור" נחשב לאותה ישיבה.`,
      "לשימוש פנימי בלבד — לא להעביר לתובעים."
    ];
    lines.forEach((text, i) => {
      const n = ws.getRow(p.rows.length + 5 + i).getCell(1);
      n.value = text;
      n.font = { italic: true, color: { argb: "FF7C2D12" } };
    });
  }
  await wb.xlsx.writeFile(filePath);
}
const isDev = process.env["NODE_ENV"] === "development";
let dataDir;
let schedulesDir;
let configPath;
const defaultDataDir = () => path.join(electron.app.getPath("userData"), "data");
const locationFile = () => path.join(electron.app.getPath("userData"), "data-location.json");
function readCustomDataDir() {
  try {
    const dir = JSON.parse(fs.readFileSync(locationFile(), "utf-8")).dataDir;
    return typeof dir === "string" && dir ? dir : null;
  } catch {
    return null;
  }
}
function initPaths() {
  const custom = readCustomDataDir();
  dataDir = custom && fs.existsSync(custom) ? custom : defaultDataDir();
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
electron.ipcMain.handle("export:excel", async (_e, filename, headers, rows) => {
  const { filePath } = await electron.dialog.showSaveDialog({
    title: "ייצא Excel",
    defaultPath: filename,
    filters: [{ name: "Excel", extensions: ["xlsx"] }]
  });
  if (!filePath) return false;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("סידור עבודה", { views: [{ rightToLeft: true }] });
  ws.addRow(headers);
  const hdrRow = ws.getRow(1);
  hdrRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1A2E" } };
    cell.font = { color: { argb: "FFC7D2FE" }, bold: true, size: 11 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  hdrRow.height = 22;
  rows.forEach((row, ri) => {
    const wsRow = ws.addRow(row);
    const isWeekend = row[1] === "שישי" || row[1] === "שבת";
    wsRow.eachCell((cell, colNum) => {
      cell.alignment = { horizontal: "center", vertical: "middle" };
      if (isWeekend) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
        cell.font = { color: { argb: "FF9CA3AF" }, italic: true };
      } else if (colNum <= 2) {
        cell.font = { bold: true };
      }
      cell.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };
    });
    wsRow.height = 20;
    if (ri % 2 === 0 && !isWeekend) {
      wsRow.eachCell((cell) => {
        if (!cell.fill || cell.fill.fgColor?.argb === "FFF3F4F6") return;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      });
    }
  });
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 8;
  for (let c = 3; c <= headers.length; c++) ws.getColumn(c).width = 14;
  const buf = await wb.xlsx.writeBuffer();
  fs.writeFileSync(filePath, Buffer.from(buf));
  electron.shell.openPath(filePath);
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
electron.ipcMain.handle("pages:publish", async (_e, token, html) => {
  const { url, verified } = await publishToPages(token, html);
  electron.clipboard.writeText(url);
  return { url, verified };
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
electron.ipcMain.handle("storage:info", () => {
  const custom = readCustomDataDir();
  return { dir: dataDir, isDefault: dataDir === defaultDataDir(), missingCustom: !!custom && custom !== dataDir };
});
electron.ipcMain.handle("storage:open", () => electron.shell.openPath(dataDir));
electron.ipcMain.handle("storage:choose", async () => {
  const { filePaths } = await electron.dialog.showOpenDialog({
    title: "בחר תיקייה לשמירת נתוני הסידור",
    buttonLabel: "בחר תיקייה",
    properties: ["openDirectory", "createDirectory"]
  });
  const target = filePaths[0];
  if (!target || target === dataDir) return false;
  const hasData = fs.existsSync(path.join(target, "config.json")) || fs.existsSync(path.join(target, "schedules"));
  if (hasData) {
    const { response } = await electron.dialog.showMessageBox({
      type: "question",
      buttons: ["השתמש בנתונים שבתיקייה", "ביטול"],
      defaultId: 0,
      cancelId: 1,
      message: "בתיקייה שבחרת כבר יש נתוני סידור.",
      detail: "האפליקציה תעבור לעבוד עם הנתונים שבתיקייה הזו. הנתונים הנוכחיים לא יימחקו."
    });
    if (response !== 0) return false;
  } else {
    fs.cpSync(dataDir, target, { recursive: true });
  }
  fs.writeFileSync(locationFile(), JSON.stringify({ dataDir: target }, null, 2), "utf-8");
  electron.app.relaunch();
  electron.app.exit(0);
  return true;
});
function excelCellToText(v) {
  if (v === null || v === void 0) return "";
  if (v instanceof Date) {
    return `${String(v.getUTCDate()).padStart(2, "0")}.${String(v.getUTCMonth() + 1).padStart(2, "0")}.${v.getUTCFullYear()}`;
  }
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return excelCellToText(v.result);
    if ("text" in v) return String(v.text);
    return "";
  }
  return String(v);
}
electron.ipcMain.handle("import:pickTable", async () => {
  const { filePaths } = await electron.dialog.showOpenDialog({
    title: "בחר קובץ סידור",
    filters: [{ name: "Excel / CSV", extensions: ["xlsx", "csv", "txt"] }],
    properties: ["openFile"]
  });
  const fp = filePaths[0];
  if (!fp) return null;
  const name = fp.split(/[\\/]/).pop() ?? "";
  if (!/\.xlsx$/i.test(fp)) {
    return { name, text: fs.readFileSync(fp, "utf-8").replace(/^\uFEFF/, "") };
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(fp);
  const sheets = [];
  wb.eachSheet((ws) => {
    if (ws.state && ws.state !== "visible") return;
    const grid = [];
    ws.eachRow({ includeEmpty: true }, (row, rn) => {
      const cells = [];
      for (let c = 1; c <= ws.columnCount; c++) cells.push(excelCellToText(row.getCell(c).value).trim());
      grid[rn - 1] = cells;
    });
    sheets.push(Array.from(grid, (r) => r ?? []));
  });
  return { name, sheets };
});
electron.ipcMain.handle("export:template", async (_e, p) => {
  const { filePath } = await electron.dialog.showSaveDialog({
    title: "שמור תבנית סידור",
    defaultPath: p.filename,
    filters: [{ name: "Excel", extensions: ["xlsx"] }]
  });
  if (!filePath) return false;
  await writeTemplate(p, filePath);
  electron.shell.showItemInFolder(filePath);
  return true;
});
let diaryBusy = false;
electron.ipcMain.handle("diary:fetch", async (e, req) => {
  if (diaryBusy) return { ok: false, error: "שליפה כבר רצה" };
  diaryBusy = true;
  try {
    const data = await fetchCourtDiary(req, (text) => {
      if (!e.sender.isDestroyed()) e.sender.send("diary:progress", text);
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    diaryBusy = false;
  }
});
