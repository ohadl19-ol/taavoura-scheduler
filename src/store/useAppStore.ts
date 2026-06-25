import { useState, useEffect, useCallback, useRef } from 'react'
import type { AppConfig, Assignments, ScheduleData, ScheduleSummary } from '../types'

export type Screen = 'settings' | 'list' | 'editor'

let globalConfig: AppConfig | null = null
let configListeners: Array<(c: AppConfig | null) => void> = []

function notifyConfig(c: AppConfig | null) {
  globalConfig = c
  configListeners.forEach(fn => fn(c))
}

export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(globalConfig)

  useEffect(() => {
    configListeners.push(setConfig)
    return () => { configListeners = configListeners.filter(fn => fn !== setConfig) }
  }, [])

  const loadConfig = useCallback(async () => {
    const c = await window.api.config.read()
    notifyConfig(c)
  }, [])

  const saveConfig = useCallback(async (data: AppConfig) => {
    await window.api.config.write(data)
    notifyConfig(data)
  }, [])

  const exportConfig = useCallback(async (data: AppConfig) => {
    return window.api.config.export(data)
  }, [])

  const importConfig = useCallback(async () => {
    const data = await window.api.config.import()
    if (data) notifyConfig(data)
    return data
  }, [])

  return { config, loadConfig, saveConfig, exportConfig, importConfig }
}

export function useScheduleList() {
  const [list, setList] = useState<ScheduleSummary[]>([])

  const load = useCallback(async () => {
    const items = await window.api.schedule.list()
    setList(items)
  }, [])

  useEffect(() => { load() }, [load])

  return { list, reload: load }
}

const HISTORY_LIMIT = 50

export function useSchedule(id: string | null) {
  const [schedule, setScheduleState] = useState<ScheduleData | null>(null)
  // Use refs for history so mutations don't trigger re-renders
  const historyRef = useRef<Assignments[]>([])
  const historyIdxRef = useRef(-1)
  const [historyVersion, setHistoryVersion] = useState(0) // bumped to expose canUndo/canRedo
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!id) {
      setScheduleState(null)
      historyRef.current = []
      historyIdxRef.current = -1
      return
    }
    window.api.schedule.read(id).then(data => {
      setScheduleState(data)
      if (data) {
        historyRef.current = [{ ...data.assignments }]
        historyIdxRef.current = 0
      }
      setHistoryVersion(v => v + 1)
    })
  }, [id])

  const persist = useCallback((data: ScheduleData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      window.api.schedule.write(data.id, { ...data, updatedAt: new Date().toISOString() })
    }, 300)
  }, [])

  const save = useCallback((data: ScheduleData) => {
    setScheduleState(data)
    // Truncate any redo-forward history and push new snapshot
    const truncated = historyRef.current.slice(0, historyIdxRef.current + 1)
    truncated.push({ ...data.assignments })
    if (truncated.length > HISTORY_LIMIT) truncated.shift()
    historyRef.current = truncated
    historyIdxRef.current = truncated.length - 1
    setHistoryVersion(v => v + 1)
    persist(data)
  }, [persist])

  const undo = useCallback(() => {
    setScheduleState(prev => {
      if (!prev || historyIdxRef.current <= 0) return prev
      historyIdxRef.current -= 1
      const newData = { ...prev, assignments: { ...historyRef.current[historyIdxRef.current] } }
      persist(newData)
      setHistoryVersion(v => v + 1)
      return newData
    })
  }, [persist])

  const redo = useCallback(() => {
    setScheduleState(prev => {
      if (!prev || historyIdxRef.current >= historyRef.current.length - 1) return prev
      historyIdxRef.current += 1
      const newData = { ...prev, assignments: { ...historyRef.current[historyIdxRef.current] } }
      persist(newData)
      setHistoryVersion(v => v + 1)
      return newData
    })
  }, [persist])

  // historyVersion is read here to ensure the component re-evaluates these after undo/redo
  const canUndo = historyVersion >= 0 && historyIdxRef.current > 0
  const canRedo = historyVersion >= 0 && historyIdxRef.current < historyRef.current.length - 1

  return { schedule, setSchedule: save, undo, redo, canUndo, canRedo }
}
