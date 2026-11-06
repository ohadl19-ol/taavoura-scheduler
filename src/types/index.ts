export interface AppConfig {
  unit_name: string
  branch: string
  prosecutors: string[]
  judges: string[]
  generalOptions?: string[]   // if absent, falls back to GENERAL_OPTIONS constant
  constraintsScriptUrl?: string  // Google Apps Script web app URL
  githubToken?: string
  schedulePassword?: string
  // יומן שופטים (נט המשפט): שופט בסידור → "שם מלא|בית משפט" ביומן ('' = לא לבדוק)
  judgeDiaryMap?: Record<string, string>
  busyDayThreshold?: number
  diaryCourts?: string[]      // בתי המשפט לשליפת היומן (כמו ברשימה בנט המשפט)   // מעל כמה דיונים ביום לשופט — להתריע אם יש רק תובע אחד
}

// ── יומן שופטים מנט המשפט — לשימוש פנימי בלבד (לא מופיע בסידור שנשלח לתובעים) ──
export interface JudgeSitting {
  judge: string    // השם המלא כמו בנט המשפט
  court: string
  total: number
  arr: number      // הקראות
  proof: number    // הוכחות
  sen: number      // טיעונים לעונש / גזר דין
  other: number
}

export interface JudgeLoad {
  fetchedAt: string
  courts: string[]
  days: Record<string, JudgeSitting[]>   // "YYYY-MM-DD" → ישיבות (רשימה ריקה = נבדק, אין ישיבות)
}

export type CellCategory = 'judge' | 'supervisor' | 'general'

export interface CellValue {
  category: CellCategory
  label: string        // display text
  judgeKey?: string    // if category==='judge', the judge's name
  subNote?: string     // optional secondary note (e.g. "תיק מוצמד", "שופט X")
}

// key: "dayIndex-prosecutorIndex" (0-based)
export type Assignments = Record<string, CellValue | null>

export type ConstraintStatus = 'pending' | 'approved' | 'rejected'

export interface ConstraintEntry {
  label: string
  status: ConstraintStatus
}

// key: "dayIndex-prosecutorIndex" (0-based) — same key scheme as Assignments
export type Constraints = Record<string, ConstraintEntry>

export interface ScheduleData {
  id: string           // "YYYYMMDD-YYYYMMDD-vN"
  startDate: string    // "YYYY-MM-DD"
  endDate: string      // "YYYY-MM-DD"
  version: number
  assignments: Assignments
  constraints?: Constraints  // imported from Google Sheets CSV
  partialConstraints?: Record<string, string>  // cell key → label (יוצא מוקדם / מגיע מאוחר / עבודה מהבית)
  dayNotes?: Record<string, string>  // dayIndex → note text
  judgeLoad?: JudgeLoad              // פנימי — לא נכלל בייצוא לתובעים
  createdAt: string
  updatedAt: string
}

export interface ScheduleSummary {
  id: string
  startDate: string
  endDate: string
  version: number
}

// Window API (injected by preload)
declare global {
  interface Window {
    api: {
      config: {
        read(): Promise<AppConfig | null>
        write(data: AppConfig): Promise<boolean>
        export(data: AppConfig): Promise<boolean>
        import(): Promise<AppConfig | null>
      }
      schedule: {
        list(): Promise<ScheduleSummary[]>
        read(id: string): Promise<ScheduleData | null>
        write(id: string, data: ScheduleData): Promise<boolean>
        delete(id: string): Promise<boolean>
      }
      export: {
        html(filename: string, html: string): Promise<boolean>
        pdf(filename: string, html: string): Promise<boolean>
        excel(filename: string, headers: string[], rows: string[][]): Promise<boolean>
        template(payload: {
          filename: string
          title: string
          prosecutors: string[]
          rows: { date: string; day: string; weekend: boolean; cells: string[]; sittings?: string }[]
          options: string[]
        }): Promise<boolean>
      }
      importTable: {
        pick(): Promise<{ name: string; sheets?: string[][][]; text?: string } | null>
      }
      storage: {
        info(): Promise<{ dir: string; isDefault: boolean; missingCustom: boolean }>
        open(): Promise<string>
        choose(): Promise<boolean>
      }
      diary: {
        fetch(req: { courts: string[]; sundays: string[] }): Promise<{ ok: true; data: unknown } | { ok: false; error: string }>
        onProgress(cb: (text: string) => void): () => void
      }
      pages: {
        publish(token: string, html: string): Promise<{ url: string, verified: boolean }>
      }
    }
  }
}

export const HEBREW_MONTHS = [
  'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
  'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'
]

export const HEBREW_DAYS = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת']

export const CELL_COLORS: Record<string, string> = {
  judge:      '#fef08a',   // yellow
  supervisor: '#bbf7d0',   // green
  office:     '#e9d5ff',   // purple
  detention:  '#fecaca',   // red
  general:    '#e5e7eb',   // gray
}

export const SUPERVISOR_OPTIONS = [
  'ממונה בית משפט',
  'ממונה משרד',
  'פגישות משרד',
]

export const GENERAL_OPTIONS = [
  'משרד',
  'ת. עצורים',
  'ח"ש',
  'חופש',
  'מגיע מאוחר',
  'יוצא מוקדם',
  'עבודה מהבית',
  'מבחן',
  'יום עיון',
]
