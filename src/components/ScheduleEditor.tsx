import { useState, useRef, useCallback, useEffect } from 'react'
import type { AppConfig, CellValue, ScheduleData, Constraints, ConstraintEntry } from '../types'
import { getDaysForSchedule, dayLabel, rangeLabel } from '../utils/dateUtils'
import { useSchedule, useConfig } from '../store/useAppStore'
import ImportScheduleModal from './ImportScheduleModal'
import JudgeLoadModal from './JudgeLoadModal'
import { analyzeLoad, breakdown, keyJudge, keyCourt, shortCourt, trackedJudges, findSitting, dayLocation, DEFAULT_BUSY_THRESHOLD } from '../utils/judgeLoad'
import CellPopover from './CellPopover'
import { generateHTML } from '../utils/htmlExport'
import { generatePDF } from '../utils/pdfExport'
import { HEBREW_DAYS, HEBREW_MONTHS, GENERAL_OPTIONS, SUPERVISOR_OPTIONS } from '../types'

interface Props {
  scheduleId: string
  config: AppConfig
  onBack: () => void
}

function getCellColor(val: CellValue | null, isWeekend: boolean): string {
  if (!val) return ''
  if (isWeekend && val.label === 'ת. עצורים') return 'cell-detention cell-detention-weekend'
  if (val.category === 'judge')      return 'cell-judge'
  if (val.category === 'supervisor') return 'cell-supervisor'
  if (val.label === 'ת. עצורים')    return 'cell-detention'
  if (val.label === 'משרד')          return 'cell-office'
  return 'cell-general'
}

// ── CSV import ────────────────────────────────────────────────────────────────

function parseConstraintsCSV(
  csv: string,
  prosecutors: string[],
  days: ReturnType<typeof getDaysForSchedule>,
): Constraints {
  const lines = csv.trim().split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return {}

  // Header: first cell = date col, rest = employee names
  const headers = splitCSVLine(lines[0])
  const constraints: Constraints = {}

  for (let li = 1; li < lines.length; li++) {
    const cells = splitCSVLine(lines[li])
    const rawDate = cells[0]?.trim()
    if (!rawDate) continue

    // Normalize date to YYYY-MM-DD
    const date = normalizeDate(rawDate)
    if (!date) continue

    // Find day index
    const dayIdx = days.findIndex(d => d.date === date)
    if (dayIdx === -1) continue

    for (let ci = 1; ci < headers.length; ci++) {
      const empName = headers[ci]?.trim()
      const label   = cells[ci]?.trim()
      if (!empName || !label) continue

      // Match prosecutor by name
      const proIdx = prosecutors.findIndex(p => p.trim() === empName)
      if (proIdx === -1) continue

      constraints[`${dayIdx}-${proIdx}`] = { label, status: 'pending' }
    }
  }
  return constraints
}

function splitCSVLine(line: string): string[] {
  const out: string[] = []
  let cur = '', inQuote = false
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote }
    else if (ch === ',' && !inQuote) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

function normalizeDate(raw: string): string | null {
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  // DD/MM/YYYY
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  return null
}

// ── Partial constraints — show as tag, don't block the cell ───────────────────

const PARTIAL_CONSTRAINT_TAGS: Record<string, { abbr: string; color: string }> = {
  'יוצא מוקדם':  { abbr: 'י.מ',  color: 'partial-early-out' },
  'מגיע מאוחר':  { abbr: 'מ.א',  color: 'partial-late-in'   },
  'עבודה מהבית': { abbr: 'בית',   color: 'partial-home'      },
}

const PARTIAL_LABELS = Object.keys(PARTIAL_CONSTRAINT_TAGS)

// ── Link generator ────────────────────────────────────────────────────────────

function buildFormUrl(schedule: ScheduleData, config: AppConfig): string {
  const base   = 'https://ohadl19-ol.github.io/taavoura-constraints/'
  const params = new URLSearchParams({
    start:  schedule.startDate,
    end:    schedule.endDate,
    names:  config.prosecutors.join(','),
    title:  `סידור ${rangeLabel(schedule.startDate, schedule.endDate)}`,
    script: config.constraintsScriptUrl ?? '',
  })
  return `${base}?${params.toString()}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScheduleEditor({ scheduleId, config, onBack }: Props) {
  const { schedule, setSchedule, undo, redo, canUndo, canRedo } = useSchedule(scheduleId)
  const [activeCell, setActiveCell]       = useState<{ dayIdx: number; proIdx: number } | null>(null)
  const [fillColumnIdx, setFillColumnIdx] = useState<number | null>(null)
  const [exporting, setExporting]         = useState(false)
  const [exportingPdf, setExportingPdf]   = useState(false)
  const [exportingExcel, setExportingExcel] = useState(false)

  const [pagesPublishing, setPagesPublishing] = useState(false)
  const [pagesLink, setPagesLink]             = useState<string | null>(null)
  const [pagesVerified, setPagesVerified]     = useState<boolean | null>(null)
  const [showLinkModal, setShowLinkModal]   = useState(false)
  const [showImport, setShowImport]         = useState(false)
  const [showJudgeLoad, setShowJudgeLoad]   = useState(false)
  const { saveConfig } = useConfig()
  const [importError, setImportError]       = useState<string | null>(null)
  const [editingDayNote, setEditingDayNote] = useState<number | null>(null)
  const [dayNoteInput, setDayNoteInput]     = useState('')
  const cellRef     = useRef<HTMLElement | null>(null)
  const fillBtnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const days     = schedule ? getDaysForSchedule(schedule.startDate, schedule.endDate) : []
  const workdays = days.filter(d => !d.isWeekend).length

  const loadCounts = config.prosecutors.map((_, proIdx) =>
    days.filter((day, dayIdx) => !day.isWeekend && (schedule?.assignments[`${dayIdx}-${proIdx}`] ?? null) !== null).length
  )
  const avgLoad = config.prosecutors.length > 0
    ? loadCounts.reduce((a, b) => a + b, 0) / config.prosecutors.length : 0

  // יומן שופטים (פנימי — לא נכנס לייצוא לתובעים)
  const loadInfo = schedule ? analyzeLoad(schedule, config, days) : null
  const loadIssues = loadInfo ? loadInfo.uncovered.length + loadInfo.idleCells.size + loadInfo.busy.length : 0
  const shortDay = (dayIdx: number) => {
    const d = days[dayIdx]
    return `${HEBREW_DAYS[d.dayOfWeek]} ${d.dayOfMonth}.${d.month}`
  }

  // Pending constraints count badge
  const pendingCount = schedule?.constraints
    ? Object.values(schedule.constraints).filter(c => c.status === 'pending').length
    : 0

  // Undo/redo keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  const getCellKey = (dayIdx: number, proIdx: number) => `${dayIdx}-${proIdx}`

  const getCell = (dayIdx: number, proIdx: number): CellValue | null => {
    if (!schedule) return null
    return schedule.assignments[getCellKey(dayIdx, proIdx)] ?? null
  }

  const getConstraint = (dayIdx: number, proIdx: number): ConstraintEntry | undefined =>
    schedule?.constraints?.[getCellKey(dayIdx, proIdx)]

  // ── Constraint counts per day ─────────────────────────────────────────────
  const dayConstraintSummary = (dayIdx: number): Record<string, number> => {
    if (!schedule?.constraints) return {}
    const counts: Record<string, number> = {}
    config.prosecutors.forEach((_, proIdx) => {
      const c = schedule.constraints![`${dayIdx}-${proIdx}`]
      if (c && c.status === 'pending') {
        counts[c.label] = (counts[c.label] ?? 0) + 1
      }
    })
    return counts
  }

  // ── Cell click ─────────────────────────────────────────────────────────────
  const handleCellClick = (dayIdx: number, proIdx: number, el: HTMLElement) => {
    if (activeCell?.dayIdx === dayIdx && activeCell?.proIdx === proIdx) {
      setActiveCell(null)
      return
    }
    cellRef.current = el
    setFillColumnIdx(null)
    setActiveCell({ dayIdx, proIdx })
  }

  // ── Select assignment ──────────────────────────────────────────────────────
  const handleSelect = useCallback((val: CellValue | null) => {
    if (!schedule || !activeCell) return
    const key = getCellKey(activeCell.dayIdx, activeCell.proIdx)
    const newAssignments = { ...schedule.assignments }
    if (val === null) { delete newAssignments[key] } else { newAssignments[key] = val }
    setSchedule({ ...schedule, assignments: newAssignments })
    const nextPro = activeCell.proIdx + 1
    if (nextPro < config.prosecutors.length) {
      const el = document.getElementById(`cell-${activeCell.dayIdx}-${nextPro}`)
      if (el) { cellRef.current = el; setActiveCell({ dayIdx: activeCell.dayIdx, proIdx: nextPro }) }
    } else {
      setActiveCell(null)
    }
  }, [schedule, activeCell, config.prosecutors.length, setSchedule])

  // ── Sub-note ───────────────────────────────────────────────────────────────
  const handleSubNote = useCallback((note: string) => {
    if (!schedule || !activeCell) return
    const key = getCellKey(activeCell.dayIdx, activeCell.proIdx)
    const val = schedule.assignments[key]
    if (!val) return
    const updated = note ? { ...val, subNote: note } : { ...val, subNote: undefined }
    setSchedule({ ...schedule, assignments: { ...schedule.assignments, [key]: updated } })
  }, [schedule, activeCell, setSchedule])

  // ── מקום השופט ביום (שירלי נצרת / טבריה) ────────────────────────────────────
  const togglePlace = (dayIdx: number, key: string, places: string[], current: string) => {
    if (!schedule) return
    const date = days[dayIdx].date
    const next = places[(places.indexOf(current) + 1) % places.length]
    const loc = { ...(schedule.judgeLocation ?? {}) }
    loc[date] = { ...(loc[date] ?? {}), [key]: next }
    setSchedule({ ...schedule, judgeLocation: loc })
  }

  // ── Day notes ──────────────────────────────────────────────────────────────
  const handleDayNoteClick = (dayIdx: number) => {
    if (!schedule) return
    setDayNoteInput(schedule.dayNotes?.[dayIdx] ?? '')
    setEditingDayNote(dayIdx)
    setActiveCell(null)
  }

  const handleDayNoteSave = () => {
    if (!schedule || editingDayNote === null) return
    const newNotes = { ...(schedule.dayNotes ?? {}) }
    if (dayNoteInput.trim()) {
      newNotes[editingDayNote] = dayNoteInput.trim()
    } else {
      delete newNotes[editingDayNote]
    }
    setSchedule({ ...schedule, dayNotes: newNotes })
    setEditingDayNote(null)
  }

  // ── Approve constraint ─────────────────────────────────────────────────────
  const handleApprove = useCallback(() => {
    if (!schedule || !activeCell) return
    const key        = getCellKey(activeCell.dayIdx, activeCell.proIdx)
    const constraint = schedule.constraints?.[key]
    if (!constraint) return
    const newConstraints = { ...schedule.constraints, [key]: { ...constraint, status: 'approved' as const } }
    if (PARTIAL_LABELS.includes(constraint.label)) {
      // Partial constraint — store as tag, leave cell assignable
      const newPartial = { ...(schedule.partialConstraints ?? {}), [key]: constraint.label }
      setSchedule({ ...schedule, constraints: newConstraints, partialConstraints: newPartial })
    } else {
      // Full constraint (חופש / מחלה / אחר) — fill the cell
      const newAssignments = { ...schedule.assignments, [key]: { category: 'general' as const, label: constraint.label } }
      setSchedule({ ...schedule, assignments: newAssignments, constraints: newConstraints })
    }
    setActiveCell(null)
  }, [schedule, activeCell, setSchedule])

  // ── Reject constraint ──────────────────────────────────────────────────────
  const handleReject = useCallback(() => {
    if (!schedule || !activeCell) return
    const key            = getCellKey(activeCell.dayIdx, activeCell.proIdx)
    const newConstraints = { ...schedule.constraints }
    delete newConstraints[key]
    const newPartial     = { ...(schedule.partialConstraints ?? {}) }
    delete newPartial[key]
    setSchedule({ ...schedule, constraints: newConstraints, partialConstraints: newPartial })
    setActiveCell(null)
  }, [schedule, activeCell, setSchedule])

  // ── Fill column ────────────────────────────────────────────────────────────
  const handleFillColumnSelect = useCallback((val: CellValue | null) => {
    if (!schedule || fillColumnIdx === null) return
    const newAssignments = { ...schedule.assignments }
    days.forEach((day, dayIdx) => {
      if (day.isWeekend) return
      const key = `${dayIdx}-${fillColumnIdx}`
      if (val === null) { delete newAssignments[key] }
      else if (!newAssignments[key]) { newAssignments[key] = val }
    })
    setSchedule({ ...schedule, assignments: newAssignments })
    setFillColumnIdx(null)
  }, [schedule, fillColumnIdx, days, setSchedule])

  const handleFillColClick = (proIdx: number, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    setActiveCell(null)
    cellRef.current = e.currentTarget
    setFillColumnIdx(prev => prev === proIdx ? null : proIdx)
  }

  // ── Import CSV ─────────────────────────────────────────────────────────────
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null)
    const file = e.target.files?.[0]
    if (!file || !schedule) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const csv         = ev.target?.result as string
        const imported    = parseConstraintsCSV(csv, config.prosecutors, days)
        const count       = Object.keys(imported).length
        // Merge: keep existing approved/rejected, add new pending
        const merged: Constraints = { ...schedule.constraints }
        Object.entries(imported).forEach(([k, v]) => {
          if (!merged[k] || merged[k].status === 'pending') merged[k] = v
        })
        setSchedule({ ...schedule, constraints: merged })
        if (count === 0) setImportError('לא נמצאו אילוצים בקובץ — בדוק שהעמודות תואמות לשמות התובעים')
      } catch {
        setImportError('שגיאה בקריאת הקובץ — ודא שמדובר בקובץ CSV תקני')
      }
    }
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!schedule) return
    setExporting(true)
    try {
      const html     = generateHTML(schedule, config)
      const filename = `סידור-${config.branch}-${schedule.startDate}-${schedule.endDate}.html`
      await window.api.export.html(filename, html)
    } finally { setExporting(false) }
  }

  const handleExportPdf = async () => {
    if (!schedule) return
    setExportingPdf(true)
    try {
      const html     = generatePDF(schedule, config)
      const filename = `סידור-${config.branch}-${schedule.startDate}-${schedule.endDate}.pdf`
      await window.api.export.pdf(filename, html)
    } finally { setExportingPdf(false) }
  }

  const handlePagesPublish = async () => {
    if (!schedule || !config.githubToken) return
    setPagesPublishing(true)
    setPagesLink(null)
    setPagesVerified(null)
    try {
      const html = generateHTML(schedule, config)
      const { url, verified } = await window.api.pages.publish(config.githubToken, html)
      setPagesLink(url)
      setPagesVerified(verified)
    } catch (e) {
      alert('שגיאה בפרסום: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setPagesPublishing(false)
    }
  }

  const handleExportExcel = async () => {
    if (!schedule) return
    setExportingExcel(true)
    try {
      const headers = ['תאריך', 'יום', ...config.prosecutors]
      const rows = days.map((day, di) => {
        const month = HEBREW_MONTHS[day.month - 1]
        const dateStr = `${day.dayOfMonth} ${month}`
        const dayName = HEBREW_DAYS[day.dayOfWeek]
        const cells = config.prosecutors.map((_, pi) => {
          const val = schedule.assignments[`${di}-${pi}`]
          const note = val?.subNote ? ` (${val.subNote})` : ''
          return val ? val.label + note : ''
        })
        return [dateStr, dayName, ...cells]
      })
      const filename = `סידור-${config.branch}-${schedule.startDate}.xlsx`
      await window.api.export.excel(filename, headers, rows)
    } finally {
      setExportingExcel(false)
    }
  }

  // ── Template for the person who builds the schedule ───────────────────────
  const handleExportTemplate = async () => {
    if (!schedule) return
    const options = [...new Set([
      ...config.judges,
      'ת. עצורים',
      ...(config.generalOptions ?? GENERAL_OPTIONS),
      ...SUPERVISOR_OPTIONS,
    ])]
    const tracked = loadInfo ? trackedJudges(config, loadInfo.map, schedule.judgeLoad?.courts) : []
    // שופט שיושב בכמה מקומות (שירלי) — עמודה לכל מקום; המספר בעמודה של המקום שסומן לאותו יום
    const cols = tracked.flatMap(t => (t.places ? t.places.map(place => ({ t, place })) : [{ t, place: null as string | null }]))
    const rows = days.map((day, di) => ({
      date: `${String(day.dayOfMonth).padStart(2, '0')}.${String(day.month).padStart(2, '0')}.${String(day.year).slice(2)}`,
      day: HEBREW_DAYS[day.dayOfWeek],
      weekend: day.isWeekend,
      judges: cols.length
        ? cols.map(({ t, place }) => {
            const list = schedule.judgeLoad?.days[day.date]
            if (!list || day.isWeekend) return null
            const s = findSitting(list, t.key)
            if (s && place && dayLocation(schedule, t.key, day.date, t.places!, s) !== place) {
              return { n: 0, note: `${t.label} לא כאן ביום הזה` }
            }
            return s
              ? { n: s.total, note: `${keyJudge(t.key)}${place ? ` — ${place}` : ` · ${shortCourt(s.court)}`}\n${breakdown(s)}` }
              : { n: 0, note: `${keyJudge(t.key)} לא יושב/ת ביום הזה` }
          })
        : undefined,
      cells: config.prosecutors.map((_, pi) => {
        const v = schedule.assignments[`${di}-${pi}`]
        return v ? v.label + (v.subNote ? ` (${v.subNote})` : '') : ''
      }),
    }))
    await window.api.export.template({
      filename: `תבנית-סידור-${config.branch.trim()}-${schedule.startDate}.xlsx`,
      title: `סידור עבודה ${config.branch.trim()} — ${rangeLabel(schedule.startDate, schedule.endDate)}`,
      prosecutors: config.prosecutors,
      rows,
      options,
      judgeCols: cols.length ? cols.map(({ t, place }) => ({ label: place ?? t.label, match: place ?? t.label })) : undefined,
      busyThreshold: config.busyDayThreshold ?? DEFAULT_BUSY_THRESHOLD,
    })
  }

  const handleAddOptions = (labels: string[]) => {
    const current = config.generalOptions ?? GENERAL_OPTIONS
    saveConfig({ ...config, generalOptions: [...current, ...labels.filter(l => !current.includes(l))] })
  }

  if (!schedule) {
    return <div className="screen"><div className="loading">טוען…</div></div>
  }

  const title = `${rangeLabel(schedule.startDate, schedule.endDate)} — גרסה ${schedule.version}`

  return (
    <div className="screen editor-screen">
      <div className="screen-header">
        <div className="header-left">
          <button className="btn btn-ghost" onClick={onBack}>← חזור</button>
          <h1>{title}</h1>
          <span className="badge">{config.branch}</span>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost btn-undo" onClick={undo} disabled={!canUndo} title="בטל (Ctrl+Z)">↺</button>
          <button className="btn btn-ghost btn-undo" onClick={redo} disabled={!canRedo} title="חזור (Ctrl+Y)">↻</button>

          <button className="btn btn-secondary" onClick={() => setShowImport(true)} title="עדכון הסידור מטבלת Excel / הדבקה">
            📋 ייבוא סידור
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowJudgeLoad(true)}
            title="מספר הדיונים לכל שופט מנט המשפט — מוצג רק כאן ובתבנית למכין, לא בסידור לתובעים"
          >
            ⚖️ יומן שופטים{loadIssues > 0 ? ` (${loadIssues})` : ''}
          </button>
          <button className="btn btn-secondary" onClick={handleExportTemplate} title="קובץ Excel עם רשימות נפתחות — לשליחה למי שמכין את הסידור">
            📤 תבנית למכין הסידור
          </button>

          {/* Import constraints */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleImportCSV}
          />
          <button
            className="btn btn-secondary btn-constraints-import"
            onClick={() => fileInputRef.current?.click()}
            title="ייבא אילוצים מ-CSV של Google Sheets"
          >
            {pendingCount > 0
              ? `📥 אילוצים (${pendingCount})`
              : '📥 ייבא אילוצים'}
          </button>

          {/* Generate form link */}
          <button
            className="btn btn-secondary"
            onClick={() => setShowLinkModal(true)}
            title="הפק קישור לטופס אילוצים לעובדים"
          >
            🔗 קישור לעובדים
          </button>

          {config.githubToken && (
            <button className="btn btn-drive" onClick={handlePagesPublish} disabled={pagesPublishing}>
              {pagesPublishing ? 'מפרסם…' : '🌐 פרסם'}
            </button>
          )}

          <button className="btn btn-success" onClick={handleExport} disabled={exporting}>
            {exporting ? 'מייצא…' : '⬇ HTML'}
          </button>
          <button className="btn btn-excel" onClick={handleExportExcel} disabled={exportingExcel}>
            {exportingExcel ? 'מייצא…' : '📊 Excel'}
          </button>
          <button className="btn btn-primary" onClick={handleExportPdf} disabled={exportingPdf}>
            {exportingPdf ? 'מייצא…' : '📄 PDF'}
          </button>
        </div>
      </div>

      {pagesLink && (
        <div className="drive-success-bar" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            {pagesVerified === true  && <span style={{ color: '#16a34a', fontWeight: 700 }}>✅ הסידור עלה בהצלחה לגיטהאב</span>}
            {pagesVerified === false && <span style={{ color: '#dc2626', fontWeight: 700 }}>⚠️ הועלה אך האימות נכשל — נסה שוב</span>}
            {pagesVerified === null  && <span style={{ color: '#d97706', fontWeight: 700 }}>⏳ מאמת…</span>}
            <button onClick={() => { setPagesLink(null); setPagesVerified(null) }} style={{ marginRight: 'auto' }}>✕</button>
          </div>
          <div>
            הקישור הועתק ללוח:{' '}
            <a href="#" onClick={e => { e.preventDefault(); window.open(pagesLink) }} style={{ color: '#1d4ed8', fontWeight: 600 }}>
              {pagesLink}
            </a>
          </div>
          {pagesVerified && (
            <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
              ייתכן שייקח 2-3 דקות עד שהשינוי יופיע בלינק — רענן את הדף אם רואים גרסה ישנה
            </div>
          )}
        </div>
      )}


      {importError && (
        <div className="import-error-bar">
          ⚠️ {importError}
          <button onClick={() => setImportError(null)}>✕</button>
        </div>
      )}

      {loadInfo && loadIssues > 0 && (
        <details className="judge-load-bar">
          <summary>
            ⚖️ יומן שופטים:
            {loadInfo.uncovered.length > 0 && <> <strong>{loadInfo.uncovered.length}</strong> ישיבות בלי תובע</>}
            {loadInfo.idleCells.size > 0 && <> · <strong>{loadInfo.idleCells.size}</strong> שיבוצים לשופט שלא יושב</>}
            {loadInfo.busy.length > 0 && <> · <strong>{loadInfo.busy.length}</strong> ימים עמוסים עם תובע אחד</>}
            <span className="judge-load-bar-hint"> (לחץ לפירוט)</span>
          </summary>
          <ul>
            {loadInfo.uncovered.map(({ dayIdx, ds }) => (
              <li key={`u${dayIdx}${ds.key}`}>🔴 {shortDay(dayIdx)} — {ds.label} יושב/ת ({ds.sitting.total} דיונים) ואין תובע</li>
            ))}
            {[...loadInfo.idleCells.entries()].map(([key, why]) => {
              const [d, p] = key.split('-').map(Number)
              return <li key={`i${key}`}>🟠 {shortDay(d)} — {config.prosecutors[p]}: {why}</li>
            })}
            {loadInfo.busy.map(({ dayIdx, ds }) => (
              <li key={`b${dayIdx}${ds.key}`}>🟡 {shortDay(dayIdx)} — {ds.label}: {ds.sitting.total} דיונים ({breakdown(ds.sitting)}) עם {config.prosecutors[ds.prosecutors[0]]} בלבד</li>
            ))}
          </ul>
        </details>
      )}

      {pendingCount > 0 && (
        <div className="constraints-info-bar">
          ⚠️ יש <strong>{pendingCount}</strong> אילוצים ממתינים לאישור — לחץ על תא מסומן כדי לאשר או לדחות
        </div>
      )}

      <div className="partial-legend">
        <span className="legend-title">מקרא:</span>
        {Object.entries(PARTIAL_CONSTRAINT_TAGS).map(([label, { abbr, color }]) => (
          <span key={label} className={`legend-item partial-tag ${color}`}>
            {abbr} = {label}
          </span>
        ))}
      </div>

      <div className="table-wrapper">
        <table className="schedule-table">
          <thead>
            <tr>
              <th className="th-day">תאריך</th>
              {config.prosecutors.map((p, proIdx) => {
                const count    = loadCounts[proIdx]
                const pct      = workdays > 0 ? (count / workdays) * 100 : 0
                const diff     = avgLoad > 0 ? (count - avgLoad) / avgLoad : 0
                const barColor = diff > 0.15 ? '#f97316' : diff < -0.15 ? '#60a5fa' : '#22c55e'
                return (
                  <th key={p} className="th-prosecutor">
                    <div className="pro-header">
                      <span className="pro-name">{p}</span>
                      <button
                        ref={el => { fillBtnRefs.current[proIdx] = el }}
                        className={`fill-col-btn ${fillColumnIdx === proIdx ? 'active' : ''}`}
                        onClick={e => handleFillColClick(proIdx, e)}
                        title="מלא עמודה"
                      >↓</button>
                    </div>
                    <div className="pro-stats">
                      <span className="pro-count">{count}/{workdays}</span>
                      {loadInfo && (
                        <span className="pro-hearings" title="דיונים לפי יומן השופטים (כששני תובעים על אותו שופט — מתחלק). רק לך — לא בסידור לתובעים">
                          ⚖️ {loadInfo.proHearings[proIdx]}
                        </span>
                      )}
                      <div className="pro-bar">
                        <div className="pro-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
                      </div>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {days.map((day, dayIdx) => {
              const summary = dayConstraintSummary(dayIdx)
              const hasDaySummary = Object.keys(summary).length > 0
              return (
                <tr key={dayIdx} className={day.isWeekend ? 'weekend-row' : ''}>
                  <td
                    className="td-day"
                    onClick={() => !day.isWeekend && handleDayNoteClick(dayIdx)}
                    style={{ cursor: day.isWeekend ? 'default' : 'pointer' }}
                    title={day.isWeekend ? undefined : 'לחץ להוספת הערה ליום'}
                  >
                    <span className="day-label">{dayLabel(day, days[dayIdx - 1]?.month)}</span>
                    {editingDayNote === dayIdx ? (
                      <div className="day-note-edit" onClick={e => e.stopPropagation()}>
                        <input
                          autoFocus
                          className="day-note-input"
                          value={dayNoteInput}
                          onChange={e => setDayNoteInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleDayNoteSave()
                            if (e.key === 'Escape') setEditingDayNote(null)
                          }}
                          onBlur={handleDayNoteSave}
                          placeholder="הערה ליום…"
                        />
                      </div>
                    ) : (
                      <>
                        {loadInfo?.loadedDays.has(dayIdx) && (
                          <div className="day-sittings">
                            {(loadInfo.perDay.get(dayIdx) ?? []).length === 0
                              ? <span className="sit-none">אין ישיבות</span>
                              : (loadInfo.perDay.get(dayIdx) ?? []).map(ds => (
                                <span
                                  key={ds.key}
                                  className={`sit ${ds.prosecutors.length === 0 ? 'sit-uncovered' : ''} ${ds.places ? 'sit-place' : ''}`}
                                  title={`${keyJudge(ds.key)} · ${shortCourt(keyCourt(ds.key))}\n${breakdown(ds.sitting)}${ds.prosecutors.length === 0 ? '\nאין תובע!' : ''}${ds.places ? '\n\nלחץ להחלפת המקום (' + ds.places.join(' / ') + ') — כך זה יופיע בקובץ למכין' : ''}`}
                                  onClick={ds.places ? e => { e.stopPropagation(); togglePlace(dayIdx, ds.key, ds.places!, ds.label) } : undefined}
                                >
                                  {ds.places && '⇄ '}{ds.label} {ds.sitting.total}
                                </span>
                              ))}
                          </div>
                        )}
                        {schedule?.dayNotes?.[dayIdx] && (
                          <div className="day-note-badge">{schedule.dayNotes[dayIdx]}</div>
                        )}
                        {hasDaySummary && (
                          <div className="day-constraint-summary">
                            {Object.entries(summary).map(([label, count]) => (
                              <span key={label} className="day-constraint-badge">
                                {count > 1 ? `${count}× ` : ''}{label}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  {config.prosecutors.map((_, proIdx) => {
                    const key            = getCellKey(dayIdx, proIdx)
                    const val            = getCell(dayIdx, proIdx)
                    const constraint     = getConstraint(dayIdx, proIdx)
                    const partialLabel   = schedule?.partialConstraints?.[key]
                    const partialTag     = partialLabel ? PARTIAL_CONSTRAINT_TAGS[partialLabel] : null
                    const isActive       = activeCell?.dayIdx === dayIdx && activeCell?.proIdx === proIdx
                    const cellId         = `cell-${dayIdx}-${proIdx}`
                    const hasPending     = constraint?.status === 'pending'
                    const idleWhy        = loadInfo?.idleCells.get(key)
                    return (
                      <td
                        key={proIdx}
                        id={cellId}
                        className={[
                          'td-cell',
                          getCellColor(val, day.isWeekend),
                          isActive ? 'cell-active' : '',
                          day.isWeekend ? 'weekend-cell' : '',
                          hasPending ? 'cell-has-constraint' : '',
                          idleWhy ? 'cell-judge-idle' : '',
                        ].join(' ')}
                        title={idleWhy}
                        onClick={e => handleCellClick(dayIdx, proIdx, e.currentTarget as HTMLElement)}
                      >
                        {partialTag && (
                          <span className={`partial-tag partial-tag-cell ${partialTag.color}`} title={partialLabel}>
                            {partialTag.abbr}
                          </span>
                        )}
                        {val && (
                          <>
                            <span className={`cell-text ${day.isWeekend && val.label === 'ת. עצורים' ? 'cell-text-weekend-detention' : ''}`}>
                              {val.label}
                            </span>
                            {val.subNote && (
                              <span className="cell-subnote">{val.subNote}</span>
                            )}
                          </>
                        )}
                        {constraint && (
                          <span className={`cell-constraint-tag constraint-${constraint.status}`}>
                            {constraint.status === 'pending' ? `⚠ ${constraint.label}` : `✓ ${constraint.label}`}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {activeCell && (
        <CellPopover
          config={config}
          current={getCell(activeCell.dayIdx, activeCell.proIdx)}
          onSelect={handleSelect}
          onSubNote={handleSubNote}
          onClose={() => setActiveCell(null)}
          anchorRef={cellRef as React.RefObject<HTMLElement | null>}
          isWeekend={days[activeCell.dayIdx].isWeekend}
          constraint={getConstraint(activeCell.dayIdx, activeCell.proIdx)}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}

      {fillColumnIdx !== null && (
        <CellPopover
          config={config}
          current={null}
          onSelect={handleFillColumnSelect}
          onClose={() => setFillColumnIdx(null)}
          anchorRef={{ current: fillBtnRefs.current[fillColumnIdx] } as React.RefObject<HTMLElement | null>}
          isWeekend={false}
          fillMode
        />
      )}

      {showImport && (
        <ImportScheduleModal
          schedule={schedule}
          config={config}
          onApply={setSchedule}
          onAddOptions={handleAddOptions}
          onClose={() => setShowImport(false)}
        />
      )}

      {showJudgeLoad && (
        <JudgeLoadModal
          schedule={schedule}
          config={config}
          onApply={setSchedule}
          onSaveConfig={saveConfig}
          onClose={() => setShowJudgeLoad(false)}
        />
      )}

      {/* Link modal */}
      {showLinkModal && (
        <div className="modal-overlay" onClick={() => setShowLinkModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>קישור לטופס אילוצים לעובדים</h2>
            {!config.constraintsScriptUrl ? (
              <p className="modal-hint">
                ⚠️ כדי לפעול, יש להגדיר את כתובת ה-Google Apps Script בהגדרות השלוחה.
              </p>
            ) : (
              <>
                <p className="modal-hint">שלח/י קישור זה לוואטסאפ הקבוצתי. העובדים יוכלו לסמן אילוצים ישירות מהטלפון.</p>
                <div className="link-box">
                  <code>{buildFormUrl(schedule, config)}</code>
                </div>
                <div className="modal-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => navigator.clipboard.writeText(buildFormUrl(schedule, config))}
                  >
                    העתק קישור
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      const url   = buildFormUrl(schedule, config)
                      const text  = encodeURIComponent(`סידור ${rangeLabel(schedule.startDate, schedule.endDate)} — אנא מלאו אילוצים עד ${schedule.endDate}:\n${url}`)
                      window.open(`https://wa.me/?text=${text}`)
                    }}
                  >
                    📲 שתף בוואטסאפ
                  </button>
                </div>
              </>
            )}
            <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setShowLinkModal(false)}>סגור</button>
          </div>
        </div>
      )}
    </div>
  )
}
