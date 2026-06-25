import { HEBREW_DAYS, HEBREW_MONTHS } from '../types'

export interface DayInfo {
  date: string        // "YYYY-MM-DD"
  dayOfMonth: number
  month: number       // 1-12
  year: number
  dayOfWeek: number   // 0=Sun … 6=Sat
  isWeekend: boolean  // Fri or Sat
}

export function getDaysForSchedule(startDate: string, endDate: string): DayInfo[] {
  const days: DayInfo[] = []
  // Parse as local date (avoid UTC offset shifting the day)
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  const cur = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)
  while (cur <= end) {
    const dow = cur.getDay()
    days.push({
      date: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`,
      dayOfMonth: cur.getDate(),
      month: cur.getMonth() + 1,
      year: cur.getFullYear(),
      dayOfWeek: dow,
      isWeekend: dow === 5 || dow === 6,
    })
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

// Shows month name the first time it appears (when month changes between consecutive days)
export function dayLabel(info: DayInfo, prevMonth?: number): string {
  if (prevMonth === undefined || prevMonth !== info.month) {
    return `${info.dayOfMonth} ${HEBREW_MONTHS[info.month - 1]} ${HEBREW_DAYS[info.dayOfWeek]}`
  }
  return `${info.dayOfMonth} ${HEBREW_DAYS[info.dayOfWeek]}`
}

// Human-readable date range label in Hebrew
export function rangeLabel(startDate: string, endDate: string): string {
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  if (sy === ey && sm === em) {
    return `${sd}–${ed} ${HEBREW_MONTHS[sm - 1]} ${sy}`
  }
  if (sy === ey) {
    return `${sd} ${HEBREW_MONTHS[sm - 1]} – ${ed} ${HEBREW_MONTHS[em - 1]} ${sy}`
  }
  return `${sd} ${HEBREW_MONTHS[sm - 1]} ${sy} – ${ed} ${HEBREW_MONTHS[em - 1]} ${ey}`
}
