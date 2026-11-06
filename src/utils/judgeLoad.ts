// ── יומן שופטים מנט המשפט ──────────────────────────────────────────────────────
// הקובץ מגיע מהתוסף (📥 קובץ לסידור העבודה). קוד טהור — בלי DOM ובלי IPC.
// המידע הזה פנימי: מוצג בעורך ובתבנית למכין הסידור, ולא בסידור שמופץ לתובעים.

import type { AppConfig, JudgeLoad, JudgeSitting, ScheduleData } from '../types'
import type { DayInfo } from './dateUtils'

export const DEFAULT_BUSY_THRESHOLD = 100   // יום עמוס = 100 דיונים ומעלה (מעל 99)

export const sittingKey = (s: { judge: string; court: string }) => `${s.judge}|${s.court}`
export const keyJudge = (k: string) => k.split('|')[0]
export const keyCourt = (k: string) => k.split('|')[1] ?? ''
export const ANY_COURT = '*'
export const shortCourt = (c: string) => (c === ANY_COURT ? 'כל בתי המשפט' : c.replace(/^שלום\s*/, ''))

/** הישיבה של השופט ביום — לפי שופט+בית משפט, או לפי שופט בלבד ("שם|*": שופט אחד שיושב פעם כאן ופעם שם) */
export function findSitting(list: JudgeSitting[], key: string): JudgeSitting | undefined {
  if (keyCourt(key) !== ANY_COURT) return list.find(x => sittingKey(x) === key)
  const all = list.filter(x => x.judge === keyJudge(key))
  if (!all.length) return undefined
  return all.reduce((a, b) => ({
    judge: a.judge, court: a.court === b.court ? a.court : `${a.court} + ${b.court}`,
    total: a.total + b.total, arr: a.arr + b.arr, proof: a.proof + b.proof, sen: a.sen + b.sen, other: a.other + b.other,
  }))
}

const norm = (s: string) => s.replace(/["'`׳״’‘”“.‏‎]/g, '').replace(/\s+/g, ' ').trim()

// ── קריאת הקובץ ──────────────────────────────────────────────────────────────

export function parseJudgeFile(text: string): { ok: true; load: JudgeLoad } | { ok: false; error: string } {
  let d: unknown
  try { d = JSON.parse(text) } catch { return { ok: false, error: 'הקובץ אינו JSON תקין.' } }
  const o = d as { type?: string; days?: Record<string, unknown>; courts?: unknown; fetchedAt?: unknown }
  if (!o || o.type !== 'judge-sittings' || !o.days || typeof o.days !== 'object') {
    return { ok: false, error: 'זה לא קובץ יומן שופטים. בנט המשפט, בדף "דיונים לשופט", לחץ "📥 קובץ לסידור העבודה".' }
  }
  const days: Record<string, JudgeSitting[]> = {}
  for (const [date, list] of Object.entries(o.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(list)) continue
    days[date] = list
      .filter(x => x && typeof x.judge === 'string' && typeof x.court === 'string')
      .map(x => ({
        judge: String(x.judge).trim(), court: String(x.court).trim(),
        total: +x.total || 0, arr: +x.arr || 0, proof: +x.proof || 0, sen: +x.sen || 0, other: +x.other || 0,
      }))
  }
  if (Object.keys(days).length === 0) return { ok: false, error: 'אין בקובץ ימים עם נתונים.' }
  return {
    ok: true,
    load: {
      fetchedAt: typeof o.fetchedAt === 'string' ? o.fetchedAt : new Date().toISOString(),
      courts: Array.isArray(o.courts) ? o.courts.map(String) : [],
      days,
    },
  }
}

/** מוסיף לנתונים הקיימים — ימים מהקובץ החדש מחליפים את הישנים. רק ימים בטווח הסידור. */
export function mergeLoad(prev: JudgeLoad | undefined, incoming: JudgeLoad, start: string, end: string) {
  const inRange = Object.keys(incoming.days).filter(d => d >= start && d <= end).sort()
  const outOfRange = Object.keys(incoming.days).length - inRange.length
  const days = { ...(prev?.days ?? {}) }
  const changed: string[] = []
  for (const d of inRange) {
    const before = JSON.stringify(sortSittings(days[d] ?? null))
    days[d] = incoming.days[d]
    if (prev?.days[d] && before !== JSON.stringify(sortSittings(days[d]))) changed.push(d)
  }
  const courts = [...new Set([...(prev?.courts ?? []), ...incoming.courts])]
  return { load: { fetchedAt: incoming.fetchedAt, courts, days } as JudgeLoad, inRange, outOfRange, changed }
}

const sortSittings = (l: JudgeSitting[] | null) => l && [...l].sort((a, b) => sittingKey(a).localeCompare(sittingKey(b)))

/** כל השופטים שמופיעים ביומן (שופט+בית משפט), עם סך הדיונים — לבחירה בהתאמה.
 *  שופט שמופיע ביותר מבית משפט אחד מקבל גם אפשרות "כל בתי המשפט". */
export function diaryJudges(load: JudgeLoad | undefined): { key: string; total: number }[] {
  const m = new Map<string, number>(), courts = new Map<string, Set<string>>()
  for (const list of Object.values(load?.days ?? {})) {
    for (const s of list) {
      m.set(sittingKey(s), (m.get(sittingKey(s)) ?? 0) + s.total)
      courts.set(s.judge, (courts.get(s.judge) ?? new Set()).add(s.court))
    }
  }
  for (const [judge, cs] of courts) {
    if (cs.size > 1) m.set(`${judge}|${ANY_COURT}`, [...cs].reduce((t, c) => t + (m.get(`${judge}|${c}`) ?? 0), 0))
  }
  return [...m.entries()].map(([key, total]) => ({ key, total })).sort((a, b) => b.total - a.total)
}

// ── התאמה: שופט בסידור ↔ שופט ביומן ────────────────────────────────────────────

/** ניחוש: "שירלי נצרת" ← שופטת ששמה כולל "שירלי" בבית משפט שכולל "נצרת". רק כשיש התאמה אחת. */
export function guessMatch(label: string, keys: string[]): string | undefined {
  const tokens = norm(label).split(' ').filter(Boolean)
  const courtTokens = tokens.filter(t => keys.some(k => norm(keyCourt(k)).includes(t)))
  const nameTokens = tokens.filter(t => !courtTokens.includes(t))
  if (!nameTokens.length) return undefined
  let best: string[] = [], bestScore = 0
  for (const k of keys) {
    const court = norm(keyCourt(k)), judge = norm(keyJudge(k))
    if (!courtTokens.every(t => court.includes(t))) continue
    const score = nameTokens.filter(t => judge.split(' ').some(w => w === t || (t.length >= 3 && w.includes(t)))).length
    if (score < nameTokens.length) continue   // כל המילים חייבות להתאים ("גישור רומן" ≠ רומן)
    if (score > bestScore) { bestScore = score; best = [k] } else if (score === bestScore && score > 0) best.push(k)
  }
  if (best.length === 1) return best[0]
  // אותו שופט בכמה בתי משפט (למשל רומן גם בטבריה) — בית המשפט שבו יש לו הכי הרבה דיונים.
  // keys ממוינים לפי סך הדיונים (diaryJudges), אז הראשון הוא העיקרי.
  if (best.length > 1 && best.every(k => keyJudge(k) === keyJudge(best[0]))) return best[0]
  return undefined
}

/** ערך שמור שמשמעו "לא לבדוק" (בחירה מפורשת). ריק / חסר = התאמה אוטומטית. */
export const NO_CHECK = '-'

/** ההתאמה בפועל: מה שנשמר בהגדרות, ולשאר — ניחוש. NO_CHECK = המשתמש בחר "לא לבדוק". */
export function effectiveMap(config: AppConfig, load: JudgeLoad | undefined): Record<string, string> {
  const keys = diaryJudges(load).map(j => j.key).filter(k => keyCourt(k) !== ANY_COURT)
  const saved = config.judgeDiaryMap ?? {}
  const out: Record<string, string> = {}
  for (const j of config.judges) {
    if (saved[j] === NO_CHECK) continue
    if (saved[j] && saved[j] !== NO_CHECK) { out[j] = saved[j]; continue }
    const g = guessMatch(j, keys)
    if (g) out[j] = g
  }
  return out
}

// ── ניתוח הסידור מול היומן ───────────────────────────────────────────────────

export interface DaySitting {
  key: string
  label: string             // שם לתצוגה ("שירלי" כששתי אפשרויות מותאמות לאותה שופטת)
  labels: string[]          // השמות בסידור שמותאמים לשופט הזה
  sitting: JudgeSitting
  prosecutors: number[]     // תובעים ששובצו אליו ביום הזה
}

export interface LoadAnalysis {
  loadedDays: Set<number>                    // ימים שיש עליהם נתונים מהיומן
  perDay: Map<number, DaySitting[]>          // רק שופטים מותאמים, עם דיונים
  uncovered: { dayIdx: number; ds: DaySitting }[]
  busy: { dayIdx: number; ds: DaySitting }[]
  idleCells: Map<string, string>             // "day-pro" → הסבר: שובץ לשופט שלא יושב
  proHearings: number[]                      // דיונים לכל תובע בתקופה (מתחלק כששניים על אותו שופט)
  map: Record<string, string>
}

export function analyzeLoad(schedule: ScheduleData, config: AppConfig, days: DayInfo[]): LoadAnalysis | null {
  const load = schedule.judgeLoad
  if (!load) return null
  const map = effectiveMap(config, load)
  const threshold = config.busyDayThreshold ?? DEFAULT_BUSY_THRESHOLD
  const labelsOf = new Map<string, string[]>()
  for (const [label, key] of Object.entries(map)) labelsOf.set(key, [...(labelsOf.get(key) ?? []), label])

  const res: LoadAnalysis = {
    loadedDays: new Set(), perDay: new Map(), uncovered: [], busy: [], idleCells: new Map(),
    proHearings: config.prosecutors.map(() => 0), map,
  }

  days.forEach((day, dayIdx) => {
    const list = load.days[day.date]
    if (!list || day.isWeekend) return
    res.loadedDays.add(dayIdx)

    // מי שובץ לאיזה שופט (לפי ההתאמה)
    const assignedTo = new Map<string, number[]>()
    config.prosecutors.forEach((_, proIdx) => {
      const v = schedule.assignments[`${dayIdx}-${proIdx}`]
      if (!v || v.category !== 'judge') return
      const label = v.judgeKey ?? v.label
      const key = map[label]
      if (!key) return
      const s = findSitting(list, key)
      if (!s || s.total === 0) {
        res.idleCells.set(`${dayIdx}-${proIdx}`,
          `לפי נט המשפט, ${keyJudge(key)} (${shortCourt(keyCourt(key))}) לא יושב/ת ביום הזה`)
        return
      }
      assignedTo.set(key, [...(assignedTo.get(key) ?? []), proIdx])
    })

    const out: DaySitting[] = []
    for (const [key, labels] of labelsOf) {
      const s = findSitting(list, key)
      if (!s || s.total === 0) continue
      const pros = assignedTo.get(key) ?? []
      const ds = { key, label: displayLabel(labels), labels, sitting: s, prosecutors: pros }
      out.push(ds)
      if (pros.length === 0) res.uncovered.push({ dayIdx, ds })
      else {
        pros.forEach(p => { res.proHearings[p] += s.total / pros.length })
        if (pros.length === 1 && s.total >= threshold) res.busy.push({ dayIdx, ds })
      }
    }
    out.sort((a, b) => b.sitting.total - a.sitting.total)
    res.perDay.set(dayIdx, out)
  })
  res.proHearings = res.proHearings.map(Math.round)
  return res
}

/** כמה שמות בסידור לאותו שופט ("שירלי נצרת", "שירלי טבריה") — המילים המשותפות ("שירלי") */
function displayLabel(labels: string[]): string {
  if (labels.length === 1) return labels[0]
  const words = labels.map(l => l.split(/\s+/))
  const common = words[0].filter(w => words.every(ws => ws.includes(w)))
  return common.length ? common.join(' ') : labels[0]
}

/** פירוט קצר לסוגי דיונים */
export function breakdown(s: JudgeSitting): string {
  return [
    s.arr && `הקראות ${s.arr}`, s.proof && `הוכחות ${s.proof}`,
    s.sen && `לעונש ${s.sen}`, s.other && `אחר ${s.other}`,
  ].filter(Boolean).join(' · ')
}

/** טקסט ליום בתבנית למכין הסידור */
export function sittingsText(a: LoadAnalysis, dayIdx: number): string {
  if (!a.loadedDays.has(dayIdx)) return ''
  const list = a.perDay.get(dayIdx) ?? []
  if (!list.length) return 'אין ישיבות'
  return list.map(ds => `${ds.label} ${ds.sitting.total}${ds.sitting.proof ? ` (הוכחות ${ds.sitting.proof})` : ''}`).join(' · ')
}
