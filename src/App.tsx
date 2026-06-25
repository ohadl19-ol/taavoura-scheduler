import { useState, useEffect } from 'react'
import './index.css'
import { useConfig } from './store/useAppStore'
import SettingsScreen from './components/SettingsScreen'
import ScheduleListScreen from './components/ScheduleListScreen'
import ScheduleEditor from './components/ScheduleEditor'

type Tab = 'settings' | 'list' | 'editor'

export default function App() {
  const { config, loadConfig } = useConfig()
  const [tab, setTab] = useState<Tab>('list')
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    loadConfig().then(() => {
      // If no config yet, start at settings
    })
  }, [loadConfig])

  // After config loads, decide starting screen
  useEffect(() => {
    if (config === null) setTab('settings')
  }, [config])

  const openEditor = (id: string) => {
    setEditingId(id)
    setTab('editor')
  }

  return (
    <div className="app">
      <nav className="app-nav">
        <button
          className={`nav-tab ${tab === 'list' ? 'active' : ''}`}
          onClick={() => setTab('list')}
        >
          סידורים
        </button>
        <button
          className={`nav-tab ${tab === 'settings' ? 'active' : ''}`}
          onClick={() => setTab('settings')}
        >
          הגדרות
        </button>
        <span className="nav-brand">
          {config ? `${config.unit_name} — ${config.branch}` : 'סידור עבודה תעבורה'}
        </span>
      </nav>

      <div className="app-content">
        {tab === 'settings' && (
          <SettingsScreen onDone={() => setTab('list')} />
        )}
        {tab === 'list' && (
          <ScheduleListScreen
            onOpen={openEditor}
            onSettings={() => setTab('settings')}
          />
        )}
        {tab === 'editor' && editingId && config && (
          <ScheduleEditor
            scheduleId={editingId}
            config={config}
            onBack={() => setTab('list')}
          />
        )}
      </div>

      <footer className="app-footer">
        כל הזכויות שמורות לאוהד לוי | תביעות תעבורה © 2026
      </footer>
    </div>
  )
}
