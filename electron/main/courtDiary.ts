// ── שליפת יומן בית משפט שבועי מהאתר הציבורי של נט המשפט (בלי הזדהות) ─────────
// חלון נסתר טוען את דף הבית, עובר ל"יומן בית משפט", ולכל שבוע × בית משפט בוחר ומציג —
// כמו משתמש. רק קריאה. התוצאה באותו מבנה כמו הקובץ מהתוסף (type: 'judge-sittings').

import { BrowserWindow } from 'electron'

const HOME = 'https://www.court.gov.il/NGCS.Web.Site/HomePage.aspx'
const COURT_SEL = '_ctl0_Basereportcontrol2__ctl0_NGCSWebComboBoxCourt'
const DATE_INP = '_ctl0_Basereportcontrol2__ctl0_NGCSWebCalendar'

export interface DiaryRequest { courts: string[]; sundays: string[] }   // sundays: "dd/mm/yyyy"
type Progress = (text: string) => void

// אותה קריאת טבלה כמו ב-weekly.js בתוסף
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
})()`

const cat = (ty: string) =>
  /טיעונים לעונש|גזר דין/.test(ty) ? 'sen' : /^הקראה/.test(ty) ? 'arr' : /הוכחות/.test(ty) ? 'proof' : 'other'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function fetchCourtDiary(req: DiaryRequest, progress: Progress) {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
  const wc = win.webContents
  // מוודא שהחלון נשאר רק באתר בתי המשפט
  wc.on('will-navigate', (e, url) => { if (!url.startsWith('https://www.court.gov.il/')) e.preventDefault() })
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))

  const loaded = (timeout = 30000) => new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => { cleanup(); reject(new Error('האתר לא הגיב בזמן')) }, timeout)
    const ok = () => { cleanup(); resolve() }
    const fail = (_e: unknown, code: number, desc: string, _url: string, main: boolean) => {
      if (main && code !== -3) { cleanup(); reject(new Error(`שגיאת טעינה: ${desc}`)) }
    }
    const cleanup = () => { clearTimeout(t); wc.off('did-finish-load', ok); wc.off('did-fail-load', fail) }
    wc.on('did-finish-load', ok); wc.on('did-fail-load', fail)
  })
  const js = <T>(code: string) => wc.executeJavaScript(code, true) as Promise<T>

  try {
    progress('מתחבר לנט המשפט…')
    const first = loaded(); await win.loadURL(HOME).catch(() => {}); await first

    // מעבר ליומן בית משפט (כמו לחיצה בתפריט)
    const toDiary = loaded()
    const hasMenu = await js<boolean>(`typeof __doPostBack === 'function' && (__doPostBack('Header1$UpperMenu1$btnCourtDiary',''), true)`)
    if (!hasMenu) throw new Error('לא נמצא התפריט "יומן בית משפט" באתר')
    await toDiary

    const collected: { judge: string; date: string; court: string; items: [string, number][] }[] = []
    const allDates = new Set<string>()
    const steps = req.sundays.flatMap(date => req.courts.map(court => ({ date, court })))

    for (let i = 0; i < steps.length; i++) {
      const { date, court } = steps[i]
      progress(`שולף ${i + 1}/${steps.length}: ${court.replace(/^שלום\s*/, '')} · שבוע ${date.slice(0, 5)}`)
      if (await js<boolean>(`!!document.querySelector('iframe[src*=recaptcha], .g-recaptcha')`)) {
        throw new Error('האתר ביקש אימות "אני לא רובוט" — אפשר לשלוף דרך התוסף בכרום ולייבא קובץ')
      }
      const nav = loaded()
      const err = await js<string>(`(() => {
        const sel = document.getElementById('${COURT_SEL}'), d = document.getElementById('${DATE_INP}');
        if (!sel || !d) return 'לא נמצאו שדות היומן באתר — ייתכן שהדף השתנה';
        const o = [...sel.options].find(o => o.text.trim() === ${JSON.stringify(court)});
        if (!o) return 'בית המשפט "' + ${JSON.stringify(court)} + '" לא נמצא ברשימה באתר';
        sel.value = o.value; d.value = ${JSON.stringify(date)};
        __doPostBack('_ctl0$Basereportcontrol2$makeReportUIButton', '');
        return '';
      })()`)
      if (err) { nav.catch(() => {}); throw new Error(err) }
      await nav
      const shown = await js<{ court: string; date: string }>(`({ court: (document.getElementById('${COURT_SEL}')?.selectedOptions[0]?.text || '').trim(), date: document.getElementById('${DATE_INP}')?.value || '' })`)
      if (shown.court !== court || shown.date !== date) throw new Error('האתר הציג שבוע או בית משפט אחר מהמבוקש')
      const w = await js<{ dates: string[]; rows: { judge: string; date: string; items: [string, number][] }[] }>(PARSE_WEEK)
      w.dates.forEach(d => allDates.add(d))
      w.rows.forEach(r => collected.push({ ...r, court }))
      await sleep(700)   // קצב אנושי
    }

    // לאותו מבנה כמו הקובץ מהתוסף
    const iso = (d: string) => `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}`
    const dow = (d: string) => new Date(+d.slice(6, 10), +d.slice(3, 5) - 1, +d.slice(0, 2)).getDay()
    const days: Record<string, { judge: string; court: string; total: number; arr: number; proof: number; sen: number; other: number }[]> = {}
    for (const d of allDates) if (dow(d) <= 4) days[iso(d)] = []
    for (const r of collected) {
      const k = iso(r.date)
      if (!days[k]) continue
      let s = days[k].find(x => x.judge === r.judge && x.court === r.court)
      if (!s) days[k].push(s = { judge: r.judge, court: r.court, total: 0, arr: 0, proof: 0, sen: 0, other: 0 })
      for (const [ty, n] of r.items) { s.total += n; s[cat(ty) as 'arr'] += n }
    }
    progress('')
    return { type: 'judge-sittings', version: 1, fetchedAt: new Date().toISOString(), courts: req.courts, days }
  } finally {
    win.destroy()
  }
}
