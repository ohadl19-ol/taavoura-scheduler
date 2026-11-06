import { useMemo, useState } from 'react'
import type { AppConfig, CellValue, ScheduleData } from '../types'
import { HEBREW_DAYS } from '../types'
import {
  parseScheduleTable, gridFromHtml, gridFromText, applyChanges, formatShortDate,
  type Grid, type ImportResult,
} from '../utils/scheduleImport'

interface Props {
  schedule: ScheduleData
  config: AppConfig
  onApply: (next: ScheduleData) => void
  onAddOptions: (labels: string[]) => void
  onClose: () => void
}

const showCell = (v: CellValue | null) =>
  v ? v.label + (v.subNote ? ` (${v.subNote})` : '') : 'ריק'

const dayName = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return HEBREW_DAYS[new Date(y, m - 1, d).getDay()]
}

export default function ImportScheduleModal({ schedule, config, onApply, onAddOptions, onClose }: Props) {
  const [result, setResult]     = useState<ImportResult | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [source, setSource]     = useState('')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [optionsAdded, setOptionsAdded] = useState(false)

  const run = (grids: Grid[], label: string) => {
    setError(null)
    let lastError = 'לא נמצאה טבלה.'
    for (const g of grids) {
      const out = parseScheduleTable(g, schedule, config)
      if (out.ok) {
        setResult(out.result); setSource(label); setExcluded(new Set())
        return
      }
      lastError = out.error
    }
    setResult(null)
    setError(lastError)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    const text = e.clipboardData.getData('text/plain')
    const grids: Grid[] = []
    const fromHtml = html ? gridFromHtml(html) : null
    if (fromHtml) grids.push(fromHtml)
    if (text) grids.push(gridFromText(text))
    run(grids, 'טבלה מודבקת')
  }

  const handleFile = async () => {
    const f = await window.api.importTable.pick()
    if (!f) return
    const grids = f.sheets ?? (f.text ? [gridFromText(f.text)] : [])
    run(grids, f.name)
  }

  const byDate = useMemo(() => {
    const m = new Map<string, ImportResult['changes']>()
    result?.changes.forEach(c => m.set(c.date, [...(m.get(c.date) ?? []), c]))
    return [...m.entries()]
  }, [result])

  const toggle = (key: string) => setExcluded(prev => {
    const n = new Set(prev)
    if (n.has(key)) n.delete(key); else n.add(key)
    return n
  })
  const toggleDate = (keys: string[], on: boolean) => setExcluded(prev => {
    const n = new Set(prev)
    keys.forEach(k => (on ? n.delete(k) : n.add(k)))
    return n
  })

  const selected = result ? result.changes.filter(c => !excluded.has(c.key)) : []

  const apply = () => {
    if (!result) return
    onApply({ ...schedule, assignments: applyChanges(schedule.assignments, selected) })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal import-modal" onClick={e => e.stopPropagation()}>
        <h2>📋 ייבוא סידור</h2>

        {!result && (
          <>
            <p className="modal-hint">
              העתק את הטבלה מ-Excel / Word / Google Sheets והדבק בתיבה (⌘V), או בחר קובץ Excel.
              הטבלה צריכה לכלול עמודת תאריך ושורת כותרת עם שמות התובעים.
            </p>
            <div
              className="paste-zone"
              tabIndex={0}
              contentEditable
              suppressContentEditableWarning
              onPaste={handlePaste}
              onKeyDown={e => { if (!(e.metaKey || e.ctrlKey)) e.preventDefault() }}
            >
              לחץ כאן והדבק את הטבלה
            </div>
            <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
              <button className="btn btn-secondary" onClick={handleFile}>📂 בחר קובץ Excel / CSV</button>
              <button className="btn btn-ghost" onClick={onClose}>ביטול</button>
            </div>
          </>
        )}

        {error && <div className="import-error-bar" style={{ margin: 0 }}>⚠️ {error}</div>}

        {result && (
          <>
            <div className="import-summary">
              <div>
                <strong>{source}</strong> · {result.datesRead.length} ימים
                ({formatShortDate(result.datesRead[0])}–{formatShortDate(result.datesRead[result.datesRead.length - 1])})
                · {result.matchedProsecutors.length} תובעים
              </div>
              <div>
                <strong>{result.changes.length}</strong> שינויים · {result.unchangedCount} תאים זהים
              </div>
            </div>

            {result.missingProsecutors.length > 0 && (
              <div className="import-warn">
                אין בטבלה עמודה עבור: <strong>{result.missingProsecutors.join(', ')}</strong> — התאים שלהם לא ישתנו.
              </div>
            )}
            {result.unknownColumns.length > 0 && (
              <div className="import-warn">
                עמודות שלא זוהו כתובע ולא ייובאו: <strong>{result.unknownColumns.join(', ')}</strong>
                {' '}(אם זה תובע — בדוק שהשם זהה לשם בהגדרות)
              </div>
            )}
            {result.outOfRangeDates.length > 0 && (
              <div className="import-warn">
                {result.outOfRangeDates.length} תאריכים מחוץ לטווח הסידור לא ייובאו
                ({formatShortDate(result.outOfRangeDates[0])}–{formatShortDate(result.outOfRangeDates[result.outOfRangeDates.length - 1])})
              </div>
            )}
            {result.newLabels.length > 0 && (
              <div className="import-warn">
                ערכים שאינם ברשימות (ייובאו כטקסט חופשי): <strong>{result.newLabels.join(', ')}</strong>
                {!optionsAdded ? (
                  <button className="btn btn-ghost btn-xs" onClick={() => { onAddOptions(result.newLabels); setOptionsAdded(true) }}>
                    + הוסף לאפשרויות הכלליות
                  </button>
                ) : <span style={{ color: '#16a34a', marginRight: 6 }}>✓ נוספו</span>}
              </div>
            )}

            {result.changes.length === 0 ? (
              <div className="import-nochange">✓ הסידור באפליקציה כבר זהה לטבלה — אין מה לעדכן.</div>
            ) : (
              <div className="import-changes">
                {byDate.map(([date, list]) => {
                  const keys = list.map(c => c.key)
                  const allOn = keys.every(k => !excluded.has(k))
                  return (
                    <div key={date} className="import-day">
                      <label className="import-day-title">
                        <input type="checkbox" checked={allOn} onChange={e => toggleDate(keys, e.target.checked)} />
                        {dayName(date)} {formatShortDate(date)}
                        <span className="import-day-count">{list.length}</span>
                      </label>
                      {list.map(c => (
                        <label key={c.key} className={`import-row ${excluded.has(c.key) ? 'off' : ''}`}>
                          <input type="checkbox" checked={!excluded.has(c.key)} onChange={() => toggle(c.key)} />
                          <span className="import-pro">{c.prosecutor}</span>
                          <span className="import-before">{showCell(c.before)}</span>
                          <span className="import-arrow">←</span>
                          <span className="import-after">{showCell(c.after)}</span>
                        </label>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => { setResult(null); setError(null) }}>→ טבלה אחרת</button>
              <button className="btn btn-ghost" onClick={onClose}>ביטול</button>
              <button className="btn btn-primary" onClick={apply} disabled={selected.length === 0}>
                ✓ עדכן {selected.length} תאים
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
