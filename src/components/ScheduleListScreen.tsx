import { useState } from 'react'
import { useScheduleList, useConfig } from '../store/useAppStore'
import { rangeLabel } from '../utils/dateUtils'
import type { ScheduleData } from '../types'

function debugLog(msg: string, val?: unknown) {
  console.log('[ScheduleList]', msg, val ?? '')
}

interface Props {
  onOpen: (id: string) => void
  onSettings: () => void
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toCompact(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

export default function ScheduleListScreen({ onOpen, onSettings }: Props) {
  const { list, reload } = useScheduleList()
  const { config } = useConfig()
  const [showNew, setShowNew] = useState(false)
  const [startDate, setStartDate] = useState(todayStr)
  const [endDate, setEndDate] = useState(todayStr)
  const [createError, setCreateError] = useState<string | null>(null)

  const handleCreate = async () => {
    setCreateError(null)
    debugLog('handleCreate called', { startDate, endDate })

    if (!startDate || !endDate) {
      setCreateError('נא לבחור תאריך התחלה וסיום')
      return
    }
    if (startDate > endDate) {
      setCreateError('תאריך הסיום חייב להיות אחרי תאריך ההתחלה')
      return
    }

    try {
      debugLog('api available?', typeof window.api)
      const prefix = toCompact(startDate) + '-' + toCompact(endDate)
      const existing = list.filter(s => s.id.startsWith(prefix + '-v'))
      const version = Math.max(0, ...existing.map(s => s.version)) + 1
      const id = prefix + '-v' + version
      debugLog('creating schedule', { id, startDate, endDate })

      const data: ScheduleData = {
        id,
        startDate,
        endDate,
        version,
        assignments: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      debugLog('calling write...')
      const ok = await window.api.schedule.write(id, data)
      debugLog('write result', ok)

      await reload()
      setShowNew(false)
      onOpen(id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      debugLog('ERROR', msg)
      setCreateError('שגיאה: ' + msg)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(`למחוק את הסידור "${id}"?`)) return
    await window.api.schedule.delete(id)
    await reload()
  }

  const isValid = startDate && endDate && startDate <= endDate

  return (
    <div className="screen list-screen">
      <div className="screen-header">
        <h1>סידורי עבודה{config ? ` — ${config.branch}` : ''}</h1>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={onSettings}>⚙ הגדרות</button>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ סידור חדש</button>
        </div>
      </div>

      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>סידור חדש</h2>

            <label>
              <span>תאריך התחלה</span>
              <input
                type="date"
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value)
                  if (e.target.value > endDate) setEndDate(e.target.value)
                }}
              />
            </label>

            <label>
              <span>תאריך סיום</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </label>

            {startDate && endDate && startDate <= endDate && (
              <div className="date-range-preview">
                {rangeLabel(startDate, endDate)}
              </div>
            )}

            {startDate && endDate && startDate > endDate && (
              <div className="date-range-error">תאריך הסיום חייב להיות אחרי תאריך ההתחלה</div>
            )}

            {createError && (
              <div className="date-range-error">{createError}</div>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>ביטול</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!isValid}>צור סידור</button>
            </div>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <p>אין סידורים עדיין. לחץ <strong>+ סידור חדש</strong> כדי להתחיל.</p>
        </div>
      ) : (
        <div className="schedule-list">
          {list.map(s => (
            <div key={s.id} className="schedule-card" onClick={() => onOpen(s.id)}>
              <div className="schedule-card-main">
                <span className="schedule-month">{rangeLabel(s.startDate, s.endDate)}</span>
                <span className="schedule-version">גרסה {s.version}</span>
              </div>
              <div className="schedule-card-actions" onClick={e => e.stopPropagation()}>
                <button className="btn btn-secondary btn-sm" onClick={() => onOpen(s.id)}>פתח</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.id)}>מחק</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
