import type { ScheduleData, AppConfig, CellValue } from '../types'
import { HEBREW_DAYS, HEBREW_MONTHS } from '../types'
import { getDaysForSchedule, rangeLabel } from './dateUtils'

const COPYRIGHT = 'כל הזכויות שמורות לאוהד לוי | תביעות תעבורה © 2026'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function rowClass(val: CellValue | null, isWeekend: boolean): string {
  if (isWeekend) return 'rw'
  if (!val || val.label === 'חופש') return 'r0'
  if (val.category === 'judge') return 'rj'
  if (val.category === 'supervisor') return 'rs'
  if (val.label === 'ת. עצורים') return 'rd'
  if (val.label === 'משרד') return 'ro'
  return 'rg'
}

export function generatePDF(schedule: ScheduleData, config: AppConfig): string {
  const days = getDaysForSchedule(schedule.startDate, schedule.endDate)
  const range = esc(rangeLabel(schedule.startDate, schedule.endDate))
  const ver = `גרסה ${schedule.version}`

  const getCell = (di: number, pi: number): CellValue | null =>
    schedule.assignments[`${di}-${pi}`] ?? null

  const pages = config.prosecutors.map((name, pi) => {
    let workDays = 0
    let courtDays = 0
    days.forEach((day, di) => {
      if (day.isWeekend) return
      const v = getCell(di, pi)
      if (!v || v.label === 'חופש') return
      workDays++
      if (v.category === 'judge') courtDays++
    })

    const rows = days.map((day, di) => {
      const v = getCell(di, pi)
      const cls = rowClass(v, day.isWeekend)
      const dateStr = `${day.dayOfMonth} ${HEBREW_MONTHS[day.month - 1]}`
      const dayName = HEBREW_DAYS[day.dayOfWeek]
      const assign = v ? esc(v.label) : ''
      return `<tr class="${cls}"><td>${esc(dateStr)}</td><td>${esc(dayName)}</td><td>${assign}</td></tr>`
    }).join('\n')

    return `<div class="page">
<div class="ph">
  <div class="ph-title">${esc(config.branch)}</div>
  <div class="ph-sub">${esc(config.unit_name)}&nbsp;&nbsp;·&nbsp;&nbsp;${range}&nbsp;&nbsp;·&nbsp;&nbsp;${esc(ver)}</div>
</div>
<div class="pn">${esc(name)}</div>
<div class="ps">ימי עבודה:&nbsp;<b>${workDays}</b>&nbsp;&nbsp;&nbsp;ימי בית משפט:&nbsp;<b>${courtDays}</b></div>
<table>
<thead><tr><th>תאריך</th><th>יום</th><th>שיבוץ</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<div class="pf">${esc(COPYRIGHT)}</div>
</div>`
  }).join('\n')

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<style>
@page{size:A4;margin:12mm 18mm}
*{box-sizing:border-box;margin:0;padding:0}
body{
  font-family:Arial,Helvetica,sans-serif;
  direction:rtl;
  color:#111;
  font-size:10.5pt;
  -webkit-print-color-adjust:exact;
  print-color-adjust:exact;
}
.page{page-break-after:always;display:flex;flex-direction:column;min-height:267mm}
.page:last-child{page-break-after:auto}
.ph{border-bottom:2.5px solid #1e3a5f;padding-bottom:3mm;margin-bottom:4mm}
.ph-title{font-size:15pt;font-weight:700;color:#1e3a5f}
.ph-sub{font-size:8.5pt;color:#555;margin-top:1mm}
.pn{
  background:#1e3a5f;color:#fff;font-size:12pt;font-weight:700;
  padding:2.5mm 4mm;margin-bottom:3mm;border-radius:2px
}
.ps{font-size:8.5pt;color:#444;margin-bottom:3mm}
.ps b{color:#1e3a5f}
table{width:100%;border-collapse:collapse}
thead tr{background:#374151}
th{
  color:#fff;padding:2.5mm 3mm;font-size:9.5pt;
  text-align:right;font-weight:600
}
td{
  padding:1.8mm 3mm;font-size:9.5pt;
  border-bottom:1px solid #e5e7eb;text-align:right
}
.rj{background:#fef9c3}
.rs{background:#dcfce7}
.rd{background:#fee2e2}
.ro{background:#f3e8ff}
.rg{background:#f9fafb}
.r0 td{color:#aaa}
.rw{opacity:0.32}
.pf{
  margin-top:auto;padding-top:3mm;
  border-top:1px solid #ddd;
  text-align:center;font-size:7.5pt;color:#888
}
</style>
</head>
<body>${pages}</body>
</html>`
}
