import type { ScheduleData, AppConfig } from '../types'
import { getDaysForSchedule, rangeLabel } from './dateUtils'

const HE_DOW_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

interface Cls { type: string; badge: string | null; label: string }

function classify(text: string, judges: string[]): Cls {
  if (!text || !text.trim()) return { type: 'empty', badge: null, label: '' }
  if (text.includes('כונן'))      return { type: 'special',   badge: 'badge-special',   label: 'כונן' }
  if (text.includes('יום עיון'))  return { type: 'ivun',      badge: 'badge-ivun',      label: 'יום עיון' }
  if (text.includes('ת. עצורים')) return { type: 'special',   badge: 'badge-special',   label: 'ת. עצורים' }
  if (text.includes('מזכירות'))   return { type: 'mazkirut',  badge: 'badge-mazkirut',  label: 'מזכירות' }
  if (text.includes('מבחן'))      return { type: 'mazkirut',  badge: 'badge-mazkirut',  label: 'מבחן' }
  if (text.includes('ועדה'))      return { type: 'mazkirut',  badge: 'badge-mazkirut',  label: 'ועדה' }
  for (const j of judges) {
    if (text.includes(j)) return { type: 'raid', badge: 'badge-judge', label: j }
  }
  if (text.includes('משרד'))      return { type: 'mishrad',   badge: 'badge-mishrad',   label: 'משרד' }
  return { type: 'mishrad', badge: 'badge-mishrad', label: text }
}

function passwordScript(password: string): string {
  const encoded = btoa(unescape(encodeURIComponent(password)))
  return `<script>(function(){
var s='${encoded}',k='sidur_auth_'+s.slice(0,8);
if(localStorage.getItem(k)===s)return;
var o=document.createElement('div');
o.style.cssText='position:fixed;inset:0;background:#1a1a2e;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;gap:16px;font-family:Arial,sans-serif';
o.innerHTML='<h2 style="color:#fff;margin:0">🔒 סידור עבודה</h2>'
+'<p style="color:#8892b0;font-size:.9rem;margin:0">הכנס סיסמה לצפייה בסידור</p>'
+'<input id="pi" type="password" placeholder="סיסמה" style="padding:10px 16px;border-radius:8px;border:2px solid #4f46e5;font-size:1rem;text-align:center;width:200px;outline:none" dir="ltr">'
+'<button id="pb" style="background:#6366f1;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:1rem;cursor:pointer;font-weight:700">כניסה ›</button>'
+'<div id="pe" style="color:#ef4444;font-size:.85rem;min-height:1.2em"></div>';
document.body.prepend(o);
function chk(){
  var v=document.getElementById('pi').value;
  if(btoa(unescape(encodeURIComponent(v)))===s){localStorage.setItem(k,s);o.remove();}
  else{document.getElementById('pe').textContent='סיסמה שגויה';document.getElementById('pi').value='';document.getElementById('pi').focus();}
}
document.getElementById('pb').addEventListener('click',chk);
document.getElementById('pi').addEventListener('keydown',function(e){if(e.key==='Enter')chk();});
setTimeout(function(){document.getElementById('pi').focus();},100);
})()</\script>`
}

export function generateHTML(schedule: ScheduleData, config: AppConfig): string {
  const days  = getDaysForSchedule(schedule.startDate, schedule.endDate)
  const range = rangeLabel(schedule.startDate, schedule.endDate)
  const ver   = 'גרסה ' + schedule.version

  function getA(di: number, pi: number): string {
    const v = schedule.assignments[`${di}-${pi}`]
    return v ? v.label : ''
  }

  function dayDateHtml(day: { dayOfWeek: number; dayOfMonth: number }): string {
    return (
      '<div class="dd"><div class="dow">' + HE_DOW_NAMES[day.dayOfWeek] + '</div>'
      + '<div class="dn">' + day.dayOfMonth + '</div></div>'
      + '<div class="ds"></div>'
    )
  }

  // ── Per-prosecutor sections ────────────────────────────────────────────────
  const proSections = config.prosecutors.map((pName, pi) => {
    let workDays = 0, courtDays = 0
    const counts: Record<string, number> = {}
    const cards: string[] = []

    days.forEach((day, di) => {
      const a     = getA(di, pi)
      const cls   = classify(a, config.judges)
      const isEmpty = !a.trim()
      const isWE  = day.isWeekend

      if (!isWE && !isEmpty) workDays++
      if (!isWE && !isEmpty && config.judges.some(j => a.includes(j))) courtDays++
      if (cls.label && !isWE && !isEmpty) counts[cls.label] = (counts[cls.label] ?? 0) + 1

      if (isWE && isEmpty) {
        cards.push(
          '<div class="dc shabbat">' + dayDateHtml(day)
          + '<div class="dc-body"><span class="dim">' + (day.dayOfWeek === 6 ? 'שבת' : 'שישי') + '</span></div></div>'
        )
      } else {
        const badge = cls.badge ? '<span class="badge ' + cls.badge + '">' + esc(cls.label) + '</span>' : ''
        cards.push(
          '<div class="dc type-' + cls.type + '">' + dayDateHtml(day)
          + '<div class="dc-body"><div class="asgn">' + (a ? esc(a) : '—') + '</div>' + badge + '</div></div>'
        )
      }
    })

    const top3 = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3)
    const statsHtml = (
      '<div class="sb">'
      + '<div class="sc"><div class="sn">' + workDays + '</div><div class="sl">ימי עבודה</div></div>'
      + '<div class="sc"><div class="sn g">' + courtDays + '</div><div class="sl">ימי ב״מ</div></div>'
      + top3.map(([l, n]) => '<div class="sc"><div class="sn s">' + n + '</div><div class="sl">' + esc(l) + '</div></div>').join('')
      + '</div>'
    )

    return (
      '<section id="pro-' + pi + '" class="sec">'
      + '<div class="sh"><h2 class="st">👤 ' + esc(pName) + '</h2>'
      + '<a href="#top" class="back">הצג הכל ↑</a></div>'
      + statsHtml
      + '<div class="mv">' + cards.join('') + '</div>'
      + '</section>'
    )
  })

  // ── Per-judge sections ─────────────────────────────────────────────────────
  const judgeSections: string[] = []
  config.judges.forEach((jName, ji) => {
    const cards: string[] = []

    days.forEach((day, di) => {
      const prosHere: string[] = []
      config.prosecutors.forEach((pName, pi) => {
        const a = getA(di, pi)
        if (a && a.includes(jName)) prosHere.push(pName)
      })
      if (!prosHere.length) return

      cards.push(
        '<div class="dc type-raid">' + dayDateHtml(day)
        + '<div class="dc-body">' + prosHere.map(p => '<span class="ptag">' + esc(p) + '</span>').join(' ') + '</div>'
        + '</div>'
      )
    })

    if (!cards.length) return

    judgeSections.push(
      '<section id="judge-' + ji + '" class="sec">'
      + '<div class="sh"><h2 class="st">⚖️ ' + esc(jName) + '</h2>'
      + '<a href="#top" class="back">הצג הכל ↑</a></div>'
      + '<div class="jdays">' + cards.length + ' ימי דיון</div>'
      + '<div class="mv">' + cards.join('') + '</div>'
      + '</section>'
    )
  })

  // ── Full table (id="top") ─────────────────────────────────────────────────
  const thCells = config.prosecutors.map(p => '<th class="th-p">' + esc(p) + '</th>').join('')
  const trRows  = days.map((day, di) => {
    const isWE = day.isWeekend
    const tds  = config.prosecutors.map((_, pi) => {
      const a   = getA(di, pi)
      const cls = classify(a, config.judges)
      return '<td class="' + (isWE ? 'td-we' : 'td-' + cls.type) + '">' + (a ? esc(a) : '') + '</td>'
    }).join('')
    return (
      '<tr class="' + (isWE ? 'tr-we' : '') + '">'
      + '<td class="td-dt"><b>' + day.dayOfMonth + '</b> ' + HE_DOW_NAMES[day.dayOfWeek] + '</td>'
      + tds + '</tr>'
    )
  }).join('')

  // ── Navigation buttons ─────────────────────────────────────────────────────
  const proBtns   = config.prosecutors.map((p, i) => '<a href="#pro-'   + i + '" class="nb np">' + esc(p) + '</a>').join('\n      ')
  const judgeBtns = config.judges.map((j, i)      => '<a href="#judge-' + i + '" class="nb nj">' + esc(j) + '</a>').join('\n      ')

  // ── CSS (zero JavaScript, pure styling) ───────────────────────────────────
  const css = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,Arial,sans-serif;background:#f0f2f5;color:#1a1a2e;padding-bottom:40px}
a{text-decoration:none;color:inherit}

/* ── home screen tip bar ── */
.home-tip{display:flex;align-items:center;justify-content:space-between;background:#1e3a5f;border-bottom:2px solid #f0c040;padding:10px 14px;gap:10px}
.home-tip-text{color:#fff;font-size:.78rem;line-height:1.5;flex:1}
.home-tip-close{background:none;border:none;color:#8892b0;font-size:1rem;cursor:pointer;padding:0 4px;flex-shrink:0}

/* ── top section (nav + full table) ── */
#top{background:#1a1a2e;padding:16px 16px 20px}
.hdr{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.htitle{color:#fff;font-size:1.05rem;font-weight:800}
.hmeta{color:#8892b0;font-size:.75rem;margin-top:2px}
.nav{display:flex;flex-direction:column;gap:10px;margin-bottom:18px}
.ng{display:flex;flex-direction:column;gap:6px}
.nl{color:#8892b0;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.nb{display:inline-block;padding:8px 16px;border-radius:22px;font-size:.85rem;font-weight:700;white-space:nowrap;margin:3px 3px 3px 0;-webkit-tap-highlight-color:transparent}
.np{background:#312e81;color:#c7d2fe}
.nj{background:#064e3b;color:#6ee7b7}
.ft-hdr{color:#fff;font-size:.95rem;font-weight:700;margin-bottom:10px}
.ft-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:10px}
.ft{width:100%;border-collapse:collapse;font-size:.8rem;background:#fff;min-width:320px}
.ft th,.ft td{padding:7px 10px;border-bottom:1px solid #f3f4f6;text-align:right;white-space:nowrap}
.th-d{background:#0f172a;color:#94a3b8;width:90px;font-weight:600;font-size:.75rem}
.th-p{background:#0f172a;color:#c7d2fe;font-weight:600;font-size:.75rem}
.td-dt{font-weight:700;color:#374151;background:#f8fafc}
.tr-we .td-dt{color:#9ca3af}
.td-we{color:#9ca3af;font-style:italic}
.td-mishrad{color:#4338ca}
.td-raid{color:#059669;font-weight:600}
.td-mazkirut{color:#be185d}
.td-ivun{color:#7c3aed}
.td-special{color:#dc2626;font-weight:600}
.td-empty{color:#d1d5db}

/* ── content sections ── */
.sec{padding:16px;max-width:680px;margin:0 auto}
.sh{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px}
.st{font-size:1.05rem;font-weight:800;color:#1a1a2e}
.back{font-size:.78rem;color:#6366f1;font-weight:700;padding:6px 12px;background:#ede9fe;border-radius:20px;-webkit-tap-highlight-color:transparent}
.jdays{font-size:.8rem;color:#6b7280;margin-bottom:10px}

/* ── stats bar ── */
.sb{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.sc{background:#fff;border-radius:10px;padding:10px 12px;flex:1;min-width:60px;box-shadow:0 1px 3px rgba(0,0,0,.07);text-align:center}
.sn{font-size:1.35rem;font-weight:800;color:#2563eb;line-height:1}
.sn.g{color:#10b981}
.sn.s{color:#f59e0b}
.sl{font-size:.63rem;color:#9ca3af;margin-top:3px}

/* ── day cards ── */
.mv{display:flex;flex-direction:column;gap:5px}
.dc{background:#fff;border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px;box-shadow:0 1px 3px rgba(0,0,0,.06);border-right:4px solid #e5e7eb}
.dc.shabbat{background:#f9fafb;border-right-color:#d1d5db;opacity:.5}
.dc.type-mishrad{border-right-color:#6366f1}
.dc.type-raid{border-right-color:#10b981}
.dc.type-mazkirut{border-right-color:#ec4899}
.dc.type-ivun{border-right-color:#8b5cf6}
.dc.type-special{border-right-color:#ef4444}
.dc.type-empty{border-right-color:#e5e7eb}
.dd{min-width:44px;text-align:center;flex-shrink:0}
.dow{font-size:.62rem;color:#9ca3af;font-weight:600}
.dn{font-size:1.2rem;font-weight:800;line-height:1.1}
.ds{width:1px;height:30px;background:#f3f4f6;flex-shrink:0}
.dc-body{flex:1;min-width:0}
.asgn{font-size:.93rem;font-weight:700}
.dim{font-size:.85rem;color:#9ca3af}
.badge{font-size:.62rem;padding:2px 7px;border-radius:20px;font-weight:600;display:inline-block;margin-top:3px;white-space:nowrap}
.badge-mishrad{background:#ede9fe;color:#5b21b6}
.badge-raid{background:#d1fae5;color:#065f46}
.badge-mazkirut{background:#fce7f3;color:#9d174d}
.badge-ivun{background:#ede9fe;color:#6b21a8}
.badge-special{background:#fee2e2;color:#991b1b}
.badge-judge{background:#fef9c3;color:#854d0e}
.ptag{display:inline-block;background:#dbeafe;color:#1e40af;border-radius:12px;padding:3px 9px;font-size:.78rem;font-weight:600;margin:2px}

/* ── divider ── */
.div{height:1px;background:#e5e7eb;margin:0 16px}
  `.trim()

  const sectionsHtml = [
    ...proSections,
    ...judgeSections,
  ].join('\n<div class="div"></div>\n')

  return (
    '<!DOCTYPE html>\n'
    + '<html lang="he" dir="rtl">\n'
    + '<head>\n'
    + '<meta charset="UTF-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
    + '<title>סידור ' + esc(range) + '</title>\n'
    + '<style>\n' + css + '\n</style>\n'
    + (config.schedulePassword ? passwordScript(config.schedulePassword) + '\n' : '')
    + '</head>\n'
    + '<body>\n'

    // ── id="top" = navigation + full table ──
    + '<div id="top">\n'
    + '  <div class="home-tip" id="home-tip">'
    + '<span class="home-tip-text">💡 <strong>שמור על מסך הבית:</strong> iOS — לחץ שתף ← "הוסף למסך הבית" | Android — תפריט ← "הוסף למסך הבית"</span>'
    + '<button onclick="document.getElementById(\'home-tip\').style.display=\'none\'" class="home-tip-close">✕</button>'
    + '</div>\n'
    + '  <div class="hdr">\n'
    + '    <div><div class="htitle">📋 סידור ' + esc(range) + '</div>'
    + '<div class="hmeta">' + ver + ' · ' + esc(config.unit_name) + '</div></div>\n'
    + '  </div>\n'
    + '  <div class="nav">\n'
    + '    <div class="ng"><div class="nl">לפי תובע</div>\n'
    + '      ' + proBtns + '\n'
    + '    </div>\n'
    + (config.judges.length > 0
        ? '    <div class="ng"><div class="nl">לפי שופט</div>\n'
          + '      ' + judgeBtns + '\n'
          + '    </div>\n'
        : '')
    + '  </div>\n'
    + '  <div class="ft-hdr">📊 טבלה מלאה</div>\n'
    + '  <div class="ft-wrap">\n'
    + '    <table class="ft">\n'
    + '      <thead><tr><th class="th-d">תאריך</th>' + thCells + '</tr></thead>\n'
    + '      <tbody>' + trRows + '</tbody>\n'
    + '    </table>\n'
    + '  </div>\n'
    + '</div>\n'

    // ── Per-prosecutor + per-judge sections ──
    + sectionsHtml
    + '\n</body>\n'
    + '</html>'
  )
}
