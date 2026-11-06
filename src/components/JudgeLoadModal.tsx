import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppConfig, ScheduleData } from '../types'
import {
  parseJudgeFile, mergeLoad, diaryJudges, effectiveMap, keyJudge, keyCourt, shortCourt,
  DEFAULT_BUSY_THRESHOLD,
} from '../utils/judgeLoad'
import { formatShortDate } from '../utils/scheduleImport'

interface Props {
  schedule: ScheduleData
  config: AppConfig
  onApply: (next: ScheduleData) => void
  onSaveConfig: (next: AppConfig) => void
  onClose: () => void
}

type Summary = { inRange: string[]; outOfRange: number; changed: string[] }

export const DEFAULT_DIARY_COURTS = ['שלום נוף הגליל-נצרת', 'שלום טבריה']

/** ימי ראשון (dd/mm/yyyy) של כל השבועות שבטווח הסידור */
function sundaysOf(start: string, end: string): string[] {
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  const d = new Date(sy, sm - 1, sd, 12), last = new Date(ey, em - 1, ed, 12)
  d.setDate(d.getDate() - d.getDay())
  const out: string[] = []
  const p = (n: number) => String(n).padStart(2, '0')
  while (d <= last) { out.push(`${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`); d.setDate(d.getDate() + 7) }
  return out
}

export default function JudgeLoadModal({ schedule, config, onApply, onSaveConfig, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError]     = useState<string | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const load = schedule.judgeLoad

  const judges = useMemo(() => diaryJudges(load), [load])
  const [map, setMap] = useState<Record<string, string>>(() => {
    const eff = effectiveMap(config, load)
    return Object.fromEntries(config.judges.map(j => [j, eff[j] ?? '']))
  })
  const [threshold, setThreshold] = useState(String(config.busyDayThreshold ?? DEFAULT_BUSY_THRESHOLD))

  const [courts, setCourts]     = useState((config.diaryCourts ?? DEFAULT_DIARY_COURTS).join('\n'))
  const [fetching, setFetching] = useState(false)
  const [progress, setProgress] = useState('')
  useEffect(() => window.api.diary.onProgress(setProgress), [])

  const courtList = () => courts.split(/[\n,]/).map(c => c.trim()).filter(Boolean)

  const handleFetch = async () => {
    const list = courtList()
    if (!list.length) { setError('לא הוגדרו בתי משפט.'); return }
    setFetching(true); setError(null); setSummary(null)
    try {
      const r = await window.api.diary.fetch({ courts: list, sundays: sundaysOf(schedule.startDate, schedule.endDate) })
      if (!r.ok) { setError(`השליפה נכשלה: ${r.error}`); return }
      ingest(JSON.stringify(r.data))
      if (list.join('|') !== (config.diaryCourts ?? DEFAULT_DIARY_COURTS).join('|')) onSaveConfig({ ...config, diaryCourts: list })
    } finally { setFetching(false); setProgress('') }
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => ingest(String(reader.result ?? ''))
    reader.readAsText(f, 'utf-8')
  }

  const ingest = (text: string) => {
    {
      const parsed = parseJudgeFile(text)
      if (!parsed.ok) { setError(parsed.error); return }
      const m = mergeLoad(load, parsed.load, schedule.startDate, schedule.endDate)
      if (m.inRange.length === 0) {
        setError(`התאריכים בקובץ מחוץ לטווח הסידור (${formatShortDate(schedule.startDate)}–${formatShortDate(schedule.endDate)}).`)
        return
      }
      setError(null)
      onApply({ ...schedule, judgeLoad: m.load })
      setSummary({ inRange: m.inRange, outOfRange: m.outOfRange, changed: m.changed })
      // שופטים חדשים ביומן — להשלים ניחוש למי שעוד לא הותאם
      const eff = effectiveMap(config, m.load)
      setMap(prev => Object.fromEntries(config.judges.map(j => [j, prev[j] || eff[j] || ''])))
    }
  }

  const save = () => {
    const n = Number(threshold)
    onSaveConfig({
      ...config,
      judgeDiaryMap: map,
      busyDayThreshold: Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_BUSY_THRESHOLD,
    })
    onClose()
  }

  const clear = () => {
    const { judgeLoad: _drop, ...rest } = schedule
    void _drop
    onApply(rest as ScheduleData)
    onClose()
  }

  const mappedKeys = new Set(Object.values(map).filter(Boolean))
  const unmapped = judges.filter(j => !mappedKeys.has(j.key) && j.total > 0)
  const loadedDates = Object.keys(load?.days ?? {}).sort()

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal judge-load-modal" onClick={e => e.stopPropagation()}>
        <h2>⚖️ יומן שופטים מנט המשפט</h2>
        <p className="modal-hint">
          המידע הזה פנימי: הוא מוצג כאן בעורך ובתבנית שנשלחת למכין הסידור, ולא בסידור שנשלח לתובעים.
        </p>
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleFile} />
        <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn btn-primary" onClick={handleFetch} disabled={fetching}
            title="שולף מהאתר הציבורי של נט המשפט (בלי הזדהות) את כל השבועות של הסידור הזה">
            {fetching ? '⏳ שולף…' : load ? '🔄 שלוף שוב מנט המשפט' : '🔄 שלוף מנט המשפט'}
          </button>
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={fetching}
            title='קובץ שהורד מהתוסף בכרום ("📥 קובץ לסידור העבודה")'>
            📂 מקובץ
          </button>
          {load && !fetching && <button className="btn btn-ghost" onClick={clear}>🗑 נקה נתוני יומן</button>}
        </div>
        {fetching && <div style={{ fontSize: '0.85rem', color: '#1e40af', margin: '4px 0' }}>{progress || 'מתחיל…'}</div>}
        <details style={{ fontSize: '0.8rem', margin: '4px 0' }}>
          <summary style={{ cursor: 'pointer' }}>בתי משפט לשליפה ({courtList().length})</summary>
          <textarea rows={3} value={courts} onChange={e => setCourts(e.target.value)} style={{ width: '100%', marginTop: 4 }}
            placeholder="שם בית משפט בכל שורה, בדיוק כמו ברשימה בנט המשפט" />
        </details>

        {error && <div className="import-error-bar" style={{ margin: '8px 0' }}>⚠️ {error}</div>}

        {summary && (
          <div className="constraints-info-bar" style={{ margin: '8px 0' }}>
            ✓ נטענו {summary.inRange.length} ימים ({formatShortDate(summary.inRange[0])}–{formatShortDate(summary.inRange[summary.inRange.length - 1])})
            {summary.changed.length > 0 && <> · <strong>השתנו מאז השליפה הקודמת: {summary.changed.map(formatShortDate).join(', ')}</strong></>}
            {summary.outOfRange > 0 && <> · {summary.outOfRange} ימים מחוץ לטווח הסידור לא נטענו</>}
          </div>
        )}

        {load && (
          <>
            <div style={{ fontSize: '0.8rem', color: '#6b7280', margin: '6px 0' }}>
              {loadedDates.length} ימים עם נתונים · שליפה אחרונה {new Date(load.fetchedAt).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              {' · '}לא כולל תיקים חסויים
            </div>

            <h3 style={{ margin: '12px 0 6px', fontSize: '0.95rem' }}>התאמת שופטים</h3>
            <table className="judge-map-table">
              <thead><tr><th>בסידור</th><th>בנט המשפט</th></tr></thead>
              <tbody>
                {config.judges.map(j => (
                  <tr key={j}>
                    <td>{j}</td>
                    <td>
                      <select value={map[j] ?? ''} onChange={e => setMap({ ...map, [j]: e.target.value })}>
                        <option value="">— לא לבדוק —</option>
                        {map[j] && !judges.some(x => x.key === map[j]) && (
                          <option value={map[j]}>{keyJudge(map[j])} · {shortCourt(keyCourt(map[j]))} (לא בנתונים)</option>
                        )}
                        {judges.map(x => (
                          <option key={x.key} value={x.key}>{keyJudge(x.key)} · {shortCourt(keyCourt(x.key))} ({x.total})</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {unmapped.length > 0 && (
              <details style={{ marginTop: 8, fontSize: '0.8rem' }}>
                <summary style={{ cursor: 'pointer' }}>{unmapped.length} שופטים ביומן שלא מותאמים (לא נבדקים)</summary>
                <div style={{ color: '#6b7280', marginTop: 4 }}>
                  {unmapped.map(x => `${keyJudge(x.key)} (${shortCourt(keyCourt(x.key))}) ${x.total}`).join(' · ')}
                </div>
              </details>
            )}

            <label style={{ display: 'block', marginTop: 12, fontSize: '0.85rem' }}>
              להתריע על יום עמוס עם תובע אחד, מ-
              <input type="number" min={1} value={threshold} onChange={e => setThreshold(e.target.value)}
                style={{ width: 60, margin: '0 6px' }} />
              דיונים לשופט
            </label>
          </>
        )}

        <div className="modal-actions">
          {load && <button className="btn btn-primary" onClick={save}>שמור התאמות</button>}
          <button className="btn btn-ghost" onClick={onClose}>סגור</button>
        </div>
      </div>
    </div>
  )
}
