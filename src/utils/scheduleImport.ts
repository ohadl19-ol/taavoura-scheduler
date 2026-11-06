// ── ייבוא סידור מטבלה (Excel / CSV / הדבקה) ─────────────────────────────────
// קוד טהור, בלי DOM ובלי IPC — מקבל טבלה (מערך של שורות) ומחזיר רשימת שינויים.

import type { AppConfig, Assignments, CellValue, ScheduleData } from '../types'
import { GENERAL_OPTIONS, HEBREW_MONTHS, SUPERVISOR_OPTIONS } from '../types'
import { getDaysForSchedule } from './dateUtils'

export type Grid = string[][]

export interface ImportChange {
  key: string            // "dayIdx-proIdx"
  dayIdx: number
  proIdx: number
  date: string           // YYYY-MM-DD
  prosecutor: string
  before: CellValue | null
  after: CellValue | null
}

export interface ImportResult {
  changes: ImportChange[]
  unchangedCount: number
  datesRead: string[]          // תאריכים בטווח הסידור שנקראו מהטבלה
  matchedProsecutors: string[] // תובעים שנמצאה להם עמודה
  missingProsecutors: string[] // תובעים מההגדרות שאין להם עמודה (לא ייגעו בהם)
  unknownColumns: string[]     // כותרות שלא זוהו כתובע
  outOfRangeDates: string[]    // תאריכים מהטבלה שמחוץ לטווח הסידור
  newLabels: string[]          // תוויות שאינן שופט/אפשרות קיימת
}

export type ParseOutcome = { ok: true; result: ImportResult } | { ok: false; error: string }

// ── נרמול טקסט ───────────────────────────────────────────────────────────────

/** מפתח השוואה: בלי רווחים, נקודות, גרש וגרשיים מכל הסוגים */
export function matchKey(s: string): string {
  return s.replace(/["'`׳״’‘”“.\s‏‎]/g, '').trim()
}

/** מאחד גרש/גרשיים לתווים העבריים התקניים ומנקה רווחים */
export function cleanText(s: string): string {
  return s
    .replace(/[‏‎ ]/g, ' ')
    .replace(/([א-ת])["”“״]([א-ת])/g, '$1״$2')
    .replace(/([א-ת])['’‘׳]/g, '$1׳')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── תאריכים ──────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')

function isoOf(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(y, m - 1, d)
  if (dt.getMonth() !== m - 1) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

/** כשאין שנה — בוחרים את השנה שמכניסה את התאריך לטווח הסידור */
function inferYear(m: number, d: number, start: string, end: string): number {
  const sy = Number(start.slice(0, 4)), ey = Number(end.slice(0, 4))
  for (const y of [sy, ey]) {
    const iso = isoOf(y, m, d)
    if (iso && iso >= start && iso <= end) return y
  }
  return sy
}

export function parseDateCell(raw: string, start: string, end: string): string | null {
  const s = cleanText(raw)
  if (!s) return null
  let m: RegExpMatchArray | null

  // 2026-11-08
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return isoOf(+m[1], +m[2], +m[3])

  // 08.11.26 / 8/11/2026 / 08-11-26 (אפשר עם טקסט אחריו)
  if ((m = s.match(/(?:^|\D)(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?!\d)/))) {
    let y = +m[3]
    if (y < 100) y += 2000
    return isoOf(y, +m[2], +m[1])
  }

  // 08.11 / 8/11 (בלי שנה)
  if ((m = s.match(/(?:^|\D)(\d{1,2})[./](\d{1,2})(?![./\d])/))) {
    const d = +m[1], mo = +m[2]
    return isoOf(inferYear(mo, d, start, end), mo, d)
  }

  // "8 נובמבר" / "8 בנובמבר 2026" (הפורמט של ייצוא ה-Excel של האפליקציה)
  for (let i = 0; i < HEBREW_MONTHS.length; i++) {
    const re = new RegExp(`(\\d{1,2})\\s+ב?${HEBREW_MONTHS[i]}(?:\\s+(\\d{4}))?`)
    if ((m = s.match(re))) {
      const d = +m[1]
      const y = m[2] ? +m[2] : inferYear(i + 1, d, start, end)
      return isoOf(y, i + 1, d)
    }
  }

  // מספר סידורי של Excel (ימים מאז 1899-12-30)
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s))
    if (serial > 30000 && serial < 80000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
      return isoOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
    }
  }
  return null
}

// ── תאים ─────────────────────────────────────────────────────────────────────

export function cellsEqual(a: CellValue | null, b: CellValue | null): boolean {
  if (!a || !b) return !a && !b
  return a.category === b.category
    && matchKey(a.label) === matchKey(b.label)
    && matchKey(a.subNote ?? '') === matchKey(b.subNote ?? '')
}

/** הופך טקסט מתא בטבלה לערך תא באפליקציה */
export function textToCell(raw: string, config: AppConfig): { cell: CellValue | null; known: boolean } {
  let text = cleanText(raw)
  if (!text || text === '-' || text === '—') return { cell: null, known: true }

  // "רומן (תיק מוצמד)" → הערה נוספת
  let subNote: string | undefined
  const sm = text.match(/^(.+?)\s*\((.+)\)$/)
  if (sm) { text = sm[1].trim(); subNote = sm[2].trim() }

  const k = matchKey(text)
  const withNote = (c: CellValue): CellValue => (subNote ? { ...c, subNote } : c)

  const judge = config.judges.find(j => matchKey(j) === k)
  if (judge) return { cell: withNote({ category: 'judge', label: judge, judgeKey: judge }), known: true }

  const sup = SUPERVISOR_OPTIONS.find(o => matchKey(o) === k)
  if (sup) return { cell: withNote({ category: 'supervisor', label: sup }), known: true }

  const generals = [...(config.generalOptions ?? GENERAL_OPTIONS), 'ת. עצורים']
  const gen = generals.find(o => matchKey(o) === k)
  if (gen) return { cell: withNote({ category: 'general', label: gen }), known: true }

  return { cell: withNote({ category: 'general', label: text }), known: false }
}

// ── זיהוי מבנה הטבלה ─────────────────────────────────────────────────────────

function findHeader(grid: Grid, prosecutors: string[]) {
  const proKeys = prosecutors.map(matchKey)
  let best: { row: number; cols: Map<number, number> } | null = null
  const limit = Math.min(grid.length, 15)
  for (let r = 0; r < limit; r++) {
    const cols = new Map<number, number>()
    grid[r].forEach((cell, c) => {
      const k = matchKey(cell ?? '')
      if (!k) return
      const pi = proKeys.indexOf(k)
      if (pi !== -1 && ![...cols.values()].includes(pi)) cols.set(c, pi)
    })
    if (cols.size >= 2 && (!best || cols.size > best.cols.size)) best = { row: r, cols }
  }
  return best
}

function findDateColumn(grid: Grid, headerRow: number, proCols: Map<number, number>, start: string, end: string): number {
  const width = Math.max(...grid.map(r => r.length))
  let bestCol = -1, bestHits = 0
  for (let c = 0; c < width; c++) {
    if (proCols.has(c)) continue
    let hits = 0
    for (let r = headerRow + 1; r < grid.length; r++) {
      if (parseDateCell(grid[r][c] ?? '', start, end)) hits++
    }
    if (hits > bestHits) { bestHits = hits; bestCol = c }
  }
  return bestCol
}

// ── הפונקציה הראשית ──────────────────────────────────────────────────────────

export function parseScheduleTable(grid: Grid, schedule: ScheduleData, config: AppConfig): ParseOutcome {
  const rows = grid
    .map(r => r.map(c => (c ?? '').toString()))
    .filter(r => r.some(c => c.trim() !== ''))
  if (rows.length < 2) return { ok: false, error: 'הטבלה ריקה — לא נמצאו שורות.' }

  const header = findHeader(rows, config.prosecutors)
  if (!header) {
    return { ok: false, error: 'לא נמצאה שורת כותרת עם שמות תובעים. ודא שהשמות בטבלה זהים לשמות בהגדרות.' }
  }

  const { startDate, endDate } = schedule
  const dateCol = findDateColumn(rows, header.row, header.cols, startDate, endDate)
  if (dateCol === -1) return { ok: false, error: 'לא נמצאה עמודת תאריכים בטבלה.' }

  const days = getDaysForSchedule(startDate, endDate)
  const dayIndex = new Map(days.map((d, i) => [d.date, i]))

  const unknownColumns = rows[header.row]
    .map((h, c) => ({ h: cleanText(h), c }))
    .filter(({ h, c }) => h && c !== dateCol && !header.cols.has(c) && !/^(יום|תאריך|יושבים היום)$/.test(h))
    .filter(({ c }) => rows.slice(header.row + 1).some(r => (r[c] ?? '').trim() && !/^[אבגדהוש]['׳]?$/.test(r[c].trim())))
    .map(({ h }) => h)

  const changes: ImportChange[] = []
  const datesRead: string[] = []
  const outOfRange = new Set<string>()
  const newLabels = new Set<string>()
  let unchangedCount = 0
  const assignments: Assignments = schedule.assignments

  for (let r = header.row + 1; r < rows.length; r++) {
    const date = parseDateCell(rows[r][dateCol] ?? '', startDate, endDate)
    if (!date) continue
    const dayIdx = dayIndex.get(date)
    if (dayIdx === undefined) { outOfRange.add(date); continue }
    if (datesRead.includes(date)) continue   // שורה כפולה — לוקחים את הראשונה
    datesRead.push(date)

    header.cols.forEach((proIdx, c) => {
      const { cell, known } = textToCell(rows[r][c] ?? '', config)
      if (cell && !known) newLabels.add(cell.label)
      const key = `${dayIdx}-${proIdx}`
      const before = assignments[key] ?? null
      if (cellsEqual(before, cell)) { unchangedCount++; return }
      changes.push({ key, dayIdx, proIdx, date, prosecutor: config.prosecutors[proIdx], before, after: cell })
    })
  }

  if (datesRead.length === 0) {
    const sample = [...outOfRange].sort()
    return {
      ok: false,
      error: sample.length
        ? `כל התאריכים בטבלה (${fmt(sample[0])}–${fmt(sample[sample.length - 1])}) מחוץ לטווח הסידור הפתוח. צור סידור שמכסה אותם.`
        : 'לא נמצאו שורות עם תאריך תקין.',
    }
  }

  const matched = new Set(header.cols.values())
  return {
    ok: true,
    result: {
      changes: changes.sort((a, b) => a.dayIdx - b.dayIdx || a.proIdx - b.proIdx),
      unchangedCount,
      datesRead: datesRead.sort(),
      matchedProsecutors: config.prosecutors.filter((_, i) => matched.has(i)),
      missingProsecutors: config.prosecutors.filter((_, i) => !matched.has(i)),
      unknownColumns,
      outOfRangeDates: [...outOfRange].sort(),
      newLabels: [...newLabels],
    },
  }
}

export function applyChanges(assignments: Assignments, changes: ImportChange[]): Assignments {
  const next = { ...assignments }
  for (const ch of changes) {
    if (ch.after) next[ch.key] = ch.after
    else delete next[ch.key]
  }
  return next
}

const fmt = (iso: string) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}`
export const formatShortDate = fmt

// ── קריאת טקסט מודבק ─────────────────────────────────────────────────────────

/** טבלה מ-HTML שהודבק (Excel / Word / Google Sheets / דפדפן) */
export function gridFromHtml(html: string): Grid | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const tables = Array.from(doc.querySelectorAll('table'))
  if (tables.length === 0) return null
  const table = tables.reduce((a, b) => (b.rows.length > a.rows.length ? b : a))
  const grid: Grid = []
  const spans: Record<string, string> = {}  // תאים שמכוסים ע"י rowspan
  Array.from(table.rows).forEach((tr, r) => {
    const row: string[] = []
    let c = 0
    const take = () => { while (spans[`${r}-${c}`] !== undefined) { row[c] = spans[`${r}-${c}`]; c++ } }
    Array.from(tr.cells).forEach(td => {
      take()
      const text = (td.textContent ?? '').replace(/\s+/g, ' ').trim()
      const cs = Math.max(1, td.colSpan || 1), rs = Math.max(1, td.rowSpan || 1)
      for (let i = 0; i < cs; i++) {
        row[c + i] = i === 0 ? text : ''
        for (let j = 1; j < rs; j++) spans[`${r + j}-${c + i}`] = ''
      }
      c += cs
    })
    take()
    grid.push(Array.from(row, v => v ?? ''))
  })
  return grid
}

/** טבלה מטקסט רגיל: טאבים (העתקה מ-Excel) או פסיקים (CSV) */
export function gridFromText(text: string): Grid {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const useTabs = lines.some(l => l.includes('\t'))
  return lines.map(l => (useTabs ? l.split('\t') : splitCsv(l)))
}

function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q
    } else if (ch === ',' && !q) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}
