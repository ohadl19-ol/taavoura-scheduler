import { useState, useEffect } from 'react'
import type { AppConfig } from '../types'
import { GENERAL_OPTIONS } from '../types'
import { useConfig } from '../store/useAppStore'

interface Props {
  onDone: () => void
}

export default function SettingsScreen({ onDone }: Props) {
  const { config, loadConfig, saveConfig, exportConfig, importConfig } = useConfig()
  const [unitName, setUnitName] = useState('')
  const [branch, setBranch] = useState('')
  const [prosecutors, setProsecutors] = useState<string[]>([])
  const [judges, setJudges] = useState<string[]>([])
  const [generalOptions, setGeneralOptions] = useState<string[]>([])
  const [constraintsScriptUrl, setConstraintsScriptUrl] = useState('')
  const [driveClientId, setDriveClientId]         = useState('')
  const [driveClientSecret, setDriveClientSecret] = useState('')
  const [driveStatus, setDriveStatus]             = useState<boolean | null>(null)
  const [driveConnecting, setDriveConnecting]     = useState(false)
  const [driveError, setDriveError]               = useState<string | null>(null)
  const [newProsecutor, setNewProsecutor] = useState('')
  const [newJudge, setNewJudge] = useState('')
  const [newOption, setNewOption] = useState('')
  const [saved, setSaved] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [optDragIdx, setOptDragIdx] = useState<number | null>(null)
  const [optDragOver, setOptDragOver] = useState<number | null>(null)

  useEffect(() => { loadConfig() }, [loadConfig])

  useEffect(() => {
    if (config) {
      setUnitName(config.unit_name)
      setBranch(config.branch)
      setProsecutors(config.prosecutors)
      setJudges(config.judges)
      setGeneralOptions(config.generalOptions ?? GENERAL_OPTIONS)
      setConstraintsScriptUrl(config.constraintsScriptUrl ?? '')
      setDriveClientId(config.driveClientId ?? '')
      setDriveClientSecret(config.driveClientSecret ?? '')
    }
    window.api.drive.status().then(setDriveStatus)
  }, [config])

  const currentData = (): AppConfig => ({
    unit_name: unitName,
    branch,
    prosecutors,
    judges,
    generalOptions,
    constraintsScriptUrl:  constraintsScriptUrl.trim()  || undefined,
    driveClientId:         driveClientId.trim()         || undefined,
    driveClientSecret:     driveClientSecret.trim()     || undefined,
  })

  const handleDriveConnect = async () => {
    const id  = driveClientId.trim()
    const sec = driveClientSecret.trim()
    if (!id || !sec) { setDriveError('יש להזין Client ID ו-Client Secret לפני החיבור'); return }
    setDriveError(null)
    setDriveConnecting(true)
    try {
      await saveConfig(currentData())
      await window.api.drive.authorize(id, sec)
      setDriveStatus(true)
    } catch (e) {
      setDriveError(e instanceof Error ? e.message : 'שגיאה בחיבור')
    } finally {
      setDriveConnecting(false)
    }
  }

  const handleDriveLogout = async () => {
    await window.api.drive.logout()
    setDriveStatus(false)
  }

  const handleSave = async () => {
    await saveConfig(currentData())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const addProsecutor = () => {
    const name = newProsecutor.trim()
    if (!name || prosecutors.includes(name)) return
    setProsecutors([...prosecutors, name])
    setNewProsecutor('')
  }

  const removeProsecutor = (i: number) => {
    setProsecutors(prosecutors.filter((_, idx) => idx !== i))
  }

  const addJudge = () => {
    const name = newJudge.trim()
    if (!name || judges.includes(name)) return
    setJudges([...judges, name])
    setNewJudge('')
  }

  const removeJudge = (i: number) => {
    setJudges(judges.filter((_, idx) => idx !== i))
  }

  const addOption = () => {
    const val = newOption.trim()
    if (!val || generalOptions.includes(val)) return
    setGeneralOptions([...generalOptions, val])
    setNewOption('')
  }

  const removeOption = (i: number) => {
    setGeneralOptions(generalOptions.filter((_, idx) => idx !== i))
  }

  const moveOption = (from: number, to: number) => {
    const arr = [...generalOptions]
    const [item] = arr.splice(from, 1)
    arr.splice(to, 0, item)
    setGeneralOptions(arr)
  }

  // Drag to reorder prosecutors
  const onDragStart = (i: number) => setDragIdx(i)
  const onDragEnter = (i: number) => setDragOver(i)
  const onDragEnd = () => {
    if (dragIdx !== null && dragOver !== null && dragIdx !== dragOver) {
      const arr = [...prosecutors]
      const [moved] = arr.splice(dragIdx, 1)
      arr.splice(dragOver, 0, moved)
      setProsecutors(arr)
    }
    setDragIdx(null)
    setDragOver(null)
  }

  const handleImport = async () => {
    const data = await importConfig()
    if (!data) return
    setUnitName(data.unit_name)
    setBranch(data.branch)
    setProsecutors(data.prosecutors)
    setJudges(data.judges)
    setGeneralOptions(data.generalOptions ?? GENERAL_OPTIONS)
  }

  return (
    <div className="screen settings-screen">
      <div className="screen-header">
        <h1>הגדרות שלוחה</h1>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => exportConfig(currentData())}>ייצא הגדרות</button>
          <button className="btn btn-secondary" onClick={handleImport}>ייבא הגדרות</button>
          <button className="btn btn-primary" onClick={handleSave}>
            {saved ? '✓ נשמר!' : 'שמור הגדרות'}
          </button>
          {config && (
            <button className="btn btn-ghost" onClick={onDone}>→ לסידורים</button>
          )}
        </div>
      </div>

      <div className="settings-grid">
        {/* Basic Info */}
        <section className="settings-card">
          <h2>פרטי השלוחה</h2>
          <label>
            <span>שם היחידה</span>
            <input
              value={unitName}
              onChange={e => setUnitName(e.target.value)}
              placeholder="חטיבת התביעות"
            />
          </label>
          <label>
            <span>שלוחה</span>
            <input
              value={branch}
              onChange={e => setBranch(e.target.value)}
              placeholder="נצרת / עפולה / ..."
            />
          </label>
          <label>
            <span>כתובת Google Apps Script (לאילוצים)</span>
            <input
              value={constraintsScriptUrl}
              onChange={e => setConstraintsScriptUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/..."
              dir="ltr"
              style={{ fontSize: '0.8rem' }}
            />
            <span className="hint" style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4, display: 'block' }}>
              מתקבל לאחר פרסום Google Apps Script כ-Web App
            </span>
          </label>
        </section>

        {/* Prosecutors */}
        <section className="settings-card">
          <h2>תובעים ({prosecutors.length})</h2>
          <p className="hint">גרור לשינוי סדר — הסדר קובע את עמודות הטבלה</p>
          <div className="list-manager">
            {prosecutors.map((p, i) => (
              <div
                key={i}
                className={`list-item ${dragOver === i ? 'drag-over' : ''}`}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragEnter={() => onDragEnter(i)}
                onDragEnd={onDragEnd}
                onDragOver={e => e.preventDefault()}
              >
                <span className="drag-handle">⠿</span>
                <span className="item-name">{p}</span>
                <button className="btn-remove" onClick={() => removeProsecutor(i)}>✕</button>
              </div>
            ))}
            <div className="add-row">
              <input
                value={newProsecutor}
                onChange={e => setNewProsecutor(e.target.value)}
                placeholder="שם תובע חדש"
                onKeyDown={e => e.key === 'Enter' && addProsecutor()}
              />
              <button className="btn btn-add" onClick={addProsecutor}>הוסף</button>
            </div>
          </div>
        </section>

        {/* Judges */}
        <section className="settings-card">
          <h2>שופטים ({judges.length})</h2>
          <div className="list-manager">
            {judges.map((j, i) => (
              <div key={i} className="list-item">
                <span className="drag-handle" style={{ visibility: 'hidden' }}>⠿</span>
                <span className="item-name">{j}</span>
                <button className="btn-remove" onClick={() => removeJudge(i)}>✕</button>
              </div>
            ))}
            <div className="add-row">
              <input
                value={newJudge}
                onChange={e => setNewJudge(e.target.value)}
                placeholder="שם שופט חדש"
                onKeyDown={e => e.key === 'Enter' && addJudge()}
              />
              <button className="btn btn-add" onClick={addJudge}>הוסף</button>
            </div>
          </div>
        </section>

        {/* Google Drive */}
        <section className="settings-card">
          <h2>☁️ Google Drive — שיתוף סידור</h2>
          <p className="hint">
            העלאה אוטומטית של הסידור ל-Drive ויצירת קישור שאפשר לשלוח לעובדים.{' '}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              onClick={e => { e.preventDefault(); window.open('https://console.cloud.google.com/apis/credentials') }}
              style={{ color: '#6366f1' }}
            >
              כיצד ליצור אישורים ›
            </a>
          </p>

          <label>
            <span>Client ID</span>
            <input
              value={driveClientId}
              onChange={e => setDriveClientId(e.target.value)}
              placeholder="XXXX.apps.googleusercontent.com"
              dir="ltr"
              style={{ fontSize: '0.8rem' }}
            />
          </label>
          <label>
            <span>Client Secret</span>
            <input
              value={driveClientSecret}
              onChange={e => setDriveClientSecret(e.target.value)}
              placeholder="GOCSPX-..."
              dir="ltr"
              style={{ fontSize: '0.8rem' }}
              type="password"
            />
          </label>

          {driveError && (
            <div style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: 4 }}>⚠️ {driveError}</div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            {driveStatus === true ? (
              <>
                <span style={{ color: '#059669', fontWeight: 600, fontSize: '0.85rem' }}>✓ מחובר ל-Google Drive</span>
                <button className="btn btn-danger btn-sm" onClick={handleDriveLogout}>נתק</button>
              </>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleDriveConnect}
                disabled={driveConnecting}
              >
                {driveConnecting ? 'מחבר…' : '🔗 התחבר ל-Google Drive'}
              </button>
            )}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            לאחר החיבור, כפתור ☁️ Drive יופיע בסידור — לחיצה תעלה את הסידור ותעתיק את הקישור.
          </p>
        </section>

        {/* General options */}
        <section className="settings-card">
          <h2>אפשרויות כלליות</h2>
          <p className="hint">הערכים שמופיעים בתפריט "כללי" בעת עריכת תא. גרור לשינוי סדר.</p>
          <div className="list-manager">
            {generalOptions.map((opt, i) => (
              <div
                key={i}
                className="list-item"
                draggable
                onDragStart={() => setOptDragIdx(i)}
                onDragEnter={() => setOptDragOver(i)}
                onDragEnd={() => {
                  if (optDragIdx !== null && optDragOver !== null && optDragIdx !== optDragOver) {
                    moveOption(optDragIdx, optDragOver)
                  }
                  setOptDragIdx(null); setOptDragOver(null)
                }}
                onDragOver={e => e.preventDefault()}
                style={{ opacity: optDragIdx === i ? 0.5 : 1 }}
              >
                <span className="drag-handle">⠿</span>
                <span className="item-name">{opt}</span>
                <button className="btn-remove" onClick={() => removeOption(i)}>✕</button>
              </div>
            ))}
            <div className="add-row">
              <input
                value={newOption}
                onChange={e => setNewOption(e.target.value)}
                placeholder="אפשרות חדשה"
                onKeyDown={e => e.key === 'Enter' && addOption()}
              />
              <button className="btn btn-add" onClick={addOption}>הוסף</button>
            </div>
          </div>
        </section>
      </div>

      {!config && (
        <div className="first-time-banner">
          <strong>ברוך הבא!</strong> הגדר את פרטי השלוחה ולחץ <em>שמור הגדרות</em> כדי להתחיל.
        </div>
      )}
    </div>
  )
}
