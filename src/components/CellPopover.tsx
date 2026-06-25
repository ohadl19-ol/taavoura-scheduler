import { useEffect, useRef } from 'react'
import type { CellValue, AppConfig } from '../types'
import { SUPERVISOR_OPTIONS, GENERAL_OPTIONS } from '../types'

// Resolve the effective general options for this config
function getGeneralOpts(config: AppConfig): string[] {
  return config.generalOptions ?? GENERAL_OPTIONS
}

interface Props {
  config: AppConfig
  current: CellValue | null
  onSelect: (val: CellValue | null) => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
  isWeekend?: boolean
  fillMode?: boolean  // when true: filling a whole column; "נקה" clears all cells in column
}

export default function CellPopover({ config, current, onSelect, onClose, anchorRef, isWeekend, fillMode }: Props) {
  const popRef = useRef<HTMLDivElement>(null)
  const customRef = useRef<HTMLInputElement>(null)

  // Position relative to anchor
  useEffect(() => {
    if (!anchorRef.current || !popRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const pop = popRef.current
    const vw = window.innerWidth
    const vh = window.innerHeight
    let top = rect.bottom + 6
    let left = rect.left
    if (left + 340 > vw) left = vw - 350
    if (top + 420 > vh) top = rect.top - 430
    pop.style.top = `${top}px`
    pop.style.left = `${left}px`
  }, [anchorRef])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const pick = (val: CellValue | null) => { onSelect(val); onClose() }

  const isActive = (val: CellValue) =>
    current?.category === val.category && current?.label === val.label

  if (isWeekend) {
    return (
      <div className="popover" ref={popRef}>
        <div className="popover-section">
          <div className="popover-chips">
            <button
              className={`chip chip-general ${isActive({ category: 'general', label: 'ת. עצורים' }) ? 'active' : ''}`}
              onClick={() => pick({ category: 'general', label: 'ת. עצורים' })}
            >
              🚨 ת. עצורים
            </button>
            <button
              className="chip chip-clear"
              onClick={() => pick(null)}
            >
              נקה
            </button>
          </div>
        </div>
        <div className="popover-section">
          <input
            ref={customRef}
            className="custom-input"
            placeholder="✏️ אחר…"
            onKeyDown={e => {
              if (e.key === 'Enter' && customRef.current?.value.trim()) {
                pick({ category: 'general', label: customRef.current.value.trim() })
              }
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="popover" ref={popRef}>
      {/* Judges */}
      <div className="popover-section">
        <div className="popover-section-title">⚖️ שופטים</div>
        <div className="popover-chips judge-chips">
          {config.judges.map(j => (
            <button
              key={j}
              className={`chip chip-judge ${isActive({ category: 'judge', label: j, judgeKey: j }) ? 'active' : ''}`}
              onClick={() => pick({ category: 'judge', label: j, judgeKey: j })}
            >
              {j}
            </button>
          ))}
          <button
            className="chip chip-judge"
            onClick={() => {
              const name = prompt('שם שופט:')
              if (name?.trim()) pick({ category: 'judge', label: name.trim(), judgeKey: name.trim() })
            }}
          >
            אחר…
          </button>
        </div>
      </div>

      {/* Supervisor */}
      <div className="popover-section">
        <div className="popover-section-title">🏛 ממונה</div>
        <div className="popover-chips">
          {SUPERVISOR_OPTIONS.map(opt => (
            <button
              key={opt}
              className={`chip chip-supervisor ${isActive({ category: 'supervisor', label: opt }) ? 'active' : ''}`}
              onClick={() => pick({ category: 'supervisor', label: opt })}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* General */}
      <div className="popover-section">
        <div className="popover-section-title">📋 כללי</div>
        <div className="popover-chips">
          {getGeneralOpts(config).map(opt => (
            <button
              key={opt}
              className={`chip chip-general ${isActive({ category: 'general', label: opt }) ? 'active' : ''}`}
              onClick={() => pick({ category: 'general', label: opt })}
            >
              {opt}
            </button>
          ))}
          <button
            className="chip chip-clear"
            onClick={() => pick(null)}
          >
            {fillMode ? 'נקה עמודה' : 'נקה'}
          </button>
        </div>
      </div>

      {fillMode && (
        <div className="popover-fill-hint">ימלא תאים ריקים בלבד. "נקה עמודה" מוחק הכל.</div>
      )}

      {/* Custom text */}
      <div className="popover-section">
        <input
          ref={customRef}
          className="custom-input"
          placeholder="טקסט חופשי…"
          onKeyDown={e => {
            if (e.key === 'Enter' && customRef.current?.value.trim()) {
              pick({ category: 'general', label: customRef.current.value.trim() })
            }
          }}
        />
      </div>
    </div>
  )
}
