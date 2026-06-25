// Generates a real test HTML and prints it to stdout for validation
import { generateHTML } from './src/utils/htmlExport'
import type { ScheduleData, AppConfig } from './src/types'

const config: AppConfig = {
  branch: 'תל אביב',
  unit_name: 'תביעות תעבורה ת"א',
  prosecutors: ['כהן מיכל', 'לוי דן'],
  judges: ['שופט אבי מזרחי', 'שופטת רחל כץ'],
}

const schedule: ScheduleData = {
  id: '20260601-20260615-v1',
  startDate: '2026-06-01',
  endDate: '2026-06-07',
  version: 1,
  assignments: {
    '0-0': { label: 'שופט אבי מזרחי', category: 'judge' },
    '0-1': { label: 'משרד', category: 'general' },
    '1-0': { label: 'משרד', category: 'general' },
    '1-1': { label: 'שופטת רחל כץ', category: 'judge' },
    '2-0': { label: 'ת. עצורים', category: 'general' },
    '2-1': { label: 'משרד', category: 'general' },
    '5-0': { label: 'כונן', category: 'general' },
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const html = generateHTML(schedule, config)
process.stdout.write(html)
