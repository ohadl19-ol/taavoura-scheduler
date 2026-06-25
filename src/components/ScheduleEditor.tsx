import { useState, useRef, useCallback, useEffect } from 'react'
import type { AppConfig, CellValue, ScheduleData } from '../types'
import { getDaysForSchedule, dayLabel, rangeLabel } from '../utils/dateUtils'
import { useSchedule } from '../store/useAppStore'
import CellPopover from './CellPopover'
import { generateHTML } from '../utils/htmlExport'
import { generatePDF } from '../utils/pdfExport'

interface Props {
  scheduleId: string
  config: AppConfig
  onBack: () => void
}

function getCellColor(val: CellValue | null, isWeekend: boolean): string {
  if (!val) return ''
  if (isWeekend && val.label === 'ת. עצורים') return 'cell-detention cell-detention-weekend'
  if (val.category === 'judge') return 'cell-judge'
  if (val.category === 'supervisor') return 'cell-supervisor'
  if (val.label === 'ת. עצורים') return 'cell-detention'
  if (val.label === 'משרד') return 'cell-office'
  return 'cell-general'
}

export default function ScheduleEditor({ scheduleId, config, onBack }: Props) {
  const { schedule, setSchedule, undo, redo, canUndo, canRedo } = useSchedule(scheduleId)
  const [activeCell, setActiveCell] = useState<{ dayIdx: number; proIdx: number } | null>(null)
  const [fillColumnIdx, setFillColumnIdx] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const cellRef = useRef<HTMLElement | null>(null)
  const fillBtnRefs = useRef<(HTMLButtonElement | null)[]>([])

  const days = schedule ? getDaysForSchedule(schedule.startDate, schedule.endDate) : []
  const workdays = days.filter(d => !d.isWeekend).length

  // Per-prosecutor assignment counts (weekdays only)
  const loadCounts = config.prosecutors.map((_, proIdx) =>
    days.filter((day, dayIdx) => !day.isWeekend && (schedule?.assignments[`${dayIdx}-${proIdx}`] ?? null) !== null).length
  )
  const avgLoad = config.prosecutors.length > 0 ? loadCounts.reduce((a, b) => a + b, 0) / config.prosecutors.length : 0

  // Undo/redo keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  const getCellKey = (dayIdx: number, proIdx: number) => `${dayIdx}-${proIdx}`

  const getCell = (dayIdx: number, proIdx: number): CellValue | null => {
    if (!schedule) return null
    return schedule.assignments[getCellKey(dayIdx, proIdx)] ?? null
  }

  const handleCellClick = (dayIdx: number, proIdx: number, el: HTMLElement) => {
    if (activeCell?.dayIdx === dayIdx && activeCell?.proIdx === proIdx) {
      setActiveCell(null)
      return
    }
    cellRef.current = el
    setFillColumnIdx(null)
    setActiveCell({ dayIdx, proIdx })
  }

  const handleSelect = useCallback((val: CellValue | null) => {
    if (!schedule || !activeCell) return
    const key = getCellKey(activeCell.dayIdx, activeCell.proIdx)
    const newAssignments = { ...schedule.assignments }
    if (val === null) {
      delete newAssignments[key]
    } else {
      newAssignments[key] = val
    }
    setSchedule({ ...schedule, assignments: newAssignments })

    // Auto-advance to next prosecutor
    const nextPro = activeCell.proIdx + 1
    if (nextPro < config.prosecutors.length) {
      const nextKey = `cell-${activeCell.dayIdx}-${nextPro}`
      const el = document.getElementById(nextKey)
      if (el) {
        cellRef.current = el
        setActiveCell({ dayIdx: activeCell.dayIdx, proIdx: nextPro })
      }
    } else {
      setActiveCell(null)
    }
  }, [schedule, activeCell, config.prosecutors.length, setSchedule])

  // Fill entire column: null = clear all, value = fill only empty non-weekend cells
  const handleFillColumnSelect = useCallback((val: CellValue | null) => {
    if (!schedule || fillColumnIdx === null) return
    const newAssignments = { ...schedule.assignments }
    days.forEach((day, dayIdx) => {
      if (day.isWeekend) return
      const key = `${dayIdx}-${fillColumnIdx}`
      if (val === null) {
        delete newAssignments[key]
      } else if (!newAssignments[key]) {
        newAssignments[key] = val
      }
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

  const handleExport = async () => {
    if (!schedule) return
    setExporting(true)
    try {
      const html = generateHTML(schedule, config)
      const filename = `סידור-${config.branch}-${schedule.startDate}-${schedule.endDate}.html`
      await window.api.export.html(filename, html)
    } finally {
      setExporting(false)
    }
  }

  const handleExportPdf = async () => {
    if (!schedule) return
    setExportingPdf(true)
    try {
      const html = generatePDF(schedule, config)
      const filename = `סידור-${config.branch}-${schedule.startDate}-${schedule.endDate}.pdf`
      await window.api.export.pdf(filename, html)
    } finally {
      setExportingPdf(false)
    }
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
          <button className="btn btn-success" onClick={handleExport} disabled={exporting}>
            {exporting ? 'מייצא…' : '⬇ HTML'}
          </button>
          <button className="btn btn-primary" onClick={handleExportPdf} disabled={exportingPdf}>
            {exportingPdf ? 'מייצא…' : '📄 PDF'}
          </button>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="schedule-table">
          <thead>
            <tr>
              <th className="th-day">תאריך</th>
              {config.prosecutors.map((p, proIdx) => {
                const count = loadCounts[proIdx]
                const pct = workdays > 0 ? (count / workdays) * 100 : 0
                const diff = avgLoad > 0 ? (count - avgLoad) / avgLoad : 0
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
            {days.map((day, dayIdx) => (
              <tr key={dayIdx} className={day.isWeekend ? 'weekend-row' : ''}>
                <td className="td-day">
                  <span className="day-label">{dayLabel(day, days[dayIdx - 1]?.month)}</span>
                </td>
                {config.prosecutors.map((_, proIdx) => {
                  const val = getCell(dayIdx, proIdx)
                  const isActive = activeCell?.dayIdx === dayIdx && activeCell?.proIdx === proIdx
                  const cellId = `cell-${dayIdx}-${proIdx}`
                  return (
                    <td
                      key={proIdx}
                      id={cellId}
                      className={`td-cell ${getCellColor(val, day.isWeekend)} ${isActive ? 'cell-active' : ''} ${day.isWeekend ? 'weekend-cell' : ''}`}
                      onClick={e => handleCellClick(dayIdx, proIdx, e.currentTarget as HTMLElement)}
                    >
                      {val && <span className={`cell-text ${day.isWeekend && val.label === 'ת. עצורים' ? 'cell-text-weekend-detention' : ''}`}>{val.label}</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {activeCell && (
        <CellPopover
          config={config}
          current={getCell(activeCell.dayIdx, activeCell.proIdx)}
          onSelect={handleSelect}
          onClose={() => setActiveCell(null)}
          anchorRef={cellRef as React.RefObject<HTMLElement | null>}
          isWeekend={days[activeCell.dayIdx].isWeekend}
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

    </div>
  )
}
