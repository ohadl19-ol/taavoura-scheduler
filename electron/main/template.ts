import ExcelJS from 'exceljs'

export interface TemplatePayload {
  filename: string
  title: string
  prosecutors: string[]
  rows: { date: string; day: string; weekend: boolean; cells: string[]; judges?: ({ n: number; note: string } | null)[] }[]
  options: string[]
  judgeCols?: { label: string; match: string }[]   // יומן שופטים — רק בתבנית למכין, לא בסידור לתובעים
  busyThreshold?: number
}

export const colLetter = (n: number): string => {
  let s = ''
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return s
}


/** בונה את קובץ התבנית למכין הסידור */
export async function writeTemplate(p: TemplatePayload, filePath: string) {
  // עמודה לכל שופט (מיומן השופטים) — רק בתבנית למכין, לא בסידור לתובעים.
  // הצבע מתעדכן ב-Excel תוך כדי מילוי: אדום = יושב ואין תובע, ירוק = יש תובע.
  const jc = p.judgeCols ?? []
  const lead = 2 + jc.length
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('סידור', { views: [{ rightToLeft: true, state: 'frozen', xSplit: lead, ySplit: 2 }] })
  const lists = wb.addWorksheet('רשימות', { state: 'hidden' })
  p.options.forEach((o, i) => { lists.getCell(i + 1, 1).value = o })

  const lastCol = p.prosecutors.length + lead
  ws.mergeCells(1, 1, 1, lastCol)
  const t = ws.getCell(1, 1)
  t.value = p.title
  t.font = { bold: true, size: 13, color: { argb: 'FF1E3A5F' } }
  t.alignment = { horizontal: 'center' }

  const hdr = ws.getRow(2)
  ;['תאריך', 'יום', ...jc.map(j => `⚖️ ${j.label}`), ...p.prosecutors].forEach((h, i) => { hdr.getCell(i + 1).value = h })
  hdr.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.alignment = { horizontal: 'center' }
  })

  const listRef = `'רשימות'!$A$1:$A$${Math.max(1, p.options.length)}`
  p.rows.forEach((r, i) => {
    const row = ws.getRow(i + 3)
    row.getCell(1).value = r.date
    row.getCell(2).value = r.day
    jc.forEach((_, k) => {
      const v = r.judges?.[k]
      const cell = row.getCell(3 + k)
      if (v) { cell.value = v.n; cell.note = v.note } else cell.value = null
    })
    r.cells.forEach((v, ci) => { row.getCell(ci + lead + 1).value = v || null })
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c)
      cell.alignment = { horizontal: 'center' }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } } }
      if (r.weekend) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
      if (c <= 2) cell.font = { bold: true }
      else if (c <= lead) {
        cell.font = { bold: true, color: { argb: 'FF7C2D12' } }
        cell.numFmt = '0;-0;""'   // 0 = לא יושב — מוסתר
        if (!r.weekend) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } }
      }
      else cell.dataValidation = {
        type: 'list', allowBlank: true, formulae: [listRef],
        showErrorMessage: false,  // מותר גם להקליד טקסט חופשי
      }
    }
  })

  ws.getColumn(1).width = 12
  ws.getColumn(2).width = 8
  jc.forEach((_, k) => { ws.getColumn(3 + k).width = 9 })
  for (let c = lead + 1; c <= lastCol; c++) ws.getColumn(c).width = 14

  const note = ws.getRow(p.rows.length + 4).getCell(1)
  note.value = 'בחרו מהרשימה הנפתחת בכל תא, או הקלידו טקסט חופשי. אין לשנות את שמות התובעים בכותרת ואת עמודת התאריך.'
  note.font = { italic: true, color: { argb: 'FF6B7280' } }
  if (jc.length) {
    const first = 3, last = p.rows.length + 2
    const pros = `$${colLetter(lead + 1)}${first}:$${colLetter(lastCol)}${first}`
    const fill = (argb: string) => ({ fill: { type: 'pattern' as const, pattern: 'solid' as const, bgColor: { argb } } })
    const T = p.busyThreshold ?? 100
    jc.forEach((j, k) => {
      const L = colLetter(3 + k), c = `${L}${first}`, cnt = `COUNTIF(${pros},"*${j.match.replace(/"/g, '""')}*")`
      ws.addConditionalFormatting({
        ref: `${L}${first}:${L}${last}`,
        rules: [
          { type: 'expression', priority: 1, formulae: [`AND(ISNUMBER(${c}),${c}>0,${cnt}=0)`], style: fill('FFFCA5A5') },
          { type: 'expression', priority: 2, formulae: [`AND(ISNUMBER(${c}),${c}=0,${cnt}>0)`], style: fill('FFFDBA74') },
          { type: 'expression', priority: 3, formulae: [`AND(ISNUMBER(${c}),${c}>=${T},${cnt}=1)`], style: fill('FFFDE68A') },
          { type: 'expression', priority: 4, formulae: [`AND(ISNUMBER(${c}),${c}>0,${cnt}>0)`], style: fill('FFBBF7D0') },
        ],
      })
    })
    const lines = [
      '⚖️ עמודות השופטים — מספר הדיונים ביום לפי נט המשפט (לא כולל תיקים חסויים). מעבר עם העכבר על מספר מציג פירוט.',
      `🔴 אדום = השופט יושב ואין תובע בשורה · 🟢 ירוק = יש תובע · 🟠 כתום = שובץ תובע אבל השופט לא יושב · 🟡 צהוב = ${T}+ דיונים עם תובע אחד. "גישור" נחשב לאותה ישיבה.`,
      'לשימוש פנימי בלבד — לא להעביר לתובעים.',
    ]
    lines.forEach((text, i) => {
      const n = ws.getRow(p.rows.length + 5 + i).getCell(1)
      n.value = text
      n.font = { italic: true, color: { argb: 'FF7C2D12' } }
    })
  }

  await wb.xlsx.writeFile(filePath)
}
