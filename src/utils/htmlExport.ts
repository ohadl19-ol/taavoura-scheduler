import type { ScheduleData, AppConfig } from '../types'
import { getDaysForSchedule, rangeLabel } from './dateUtils'

const HE_DOW_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

// App icon embedded as base64 PNG (180×180) for home screen / favicon
const APP_ICON_B64 = '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'

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
    + '<link rel="apple-touch-icon" href="data:image/png;base64,' + APP_ICON_B64 + '">\n'
    + '<link rel="icon" type="image/png" href="data:image/png;base64,' + APP_ICON_B64 + '">\n'
    + '<meta name="apple-mobile-web-app-capable" content="yes">\n'
    + '<meta name="apple-mobile-web-app-title" content="סידור עבודה">\n'
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
