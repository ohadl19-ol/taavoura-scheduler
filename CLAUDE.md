# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (must unset ELECTRON_RUN_AS_NODE — already handled in the script)
npm run dev

# Production build only (no packaging)
npm run build

# Build + package universal DMG (Apple Silicon + Intel)
npm run dist:mac:universal

# Generate a test HTML export and validate it
npx tsx test-generate-html.ts > /tmp/test.html
python3 /tmp/check-html.py
```

### DMG rebuild gotcha
Before every `dist:mac:universal` run, eject any mounted DMG from the previous build or `hdiutil create` will fail with "המשאב זמנית אינו זמין":
```bash
hdiutil detach "/Volumes/סידור עבודה - תעבורה 1.0.0-universal" -force 2>/dev/null
rm -rf release
```

## Architecture

Three Vite targets built by `electron-vite` — configured in `electron.vite.config.ts`:

| Target | Source | Output | Role |
|--------|--------|--------|------|
| `main` | `electron/main/index.ts` | `out/main/index.js` | Node.js process, IPC handlers, file I/O |
| `preload` | `electron/preload/index.ts` | `out/preload/index.js` | Bridge: exposes `window.api` via `contextBridge` |
| `renderer` | `src/` | `out/renderer/` | React UI |

### IPC contract
`window.api` (typed in `src/types/index.ts`) has four namespaces: `config`, `schedule`, `export.html`, `export.pdf`. Every renderer→main call goes through this interface. Adding a new IPC channel requires changes in all three: `electron/main/index.ts` (handler), `electron/preload/index.ts` (bridge), and `src/types/index.ts` (type declaration).

### Data storage
All data lives under `app.getPath('userData')/data/` (macOS: `~/Library/Application Support/taavoura-scheduler/data/`). `initPaths()` must be called inside `app.whenReady()`, never at module top-level. Schedule files are named `YYYYMMDD-YYYYMMDD-vN.json`. Old-format files without a `startDate` field are silently skipped by `schedule:list`.

### State management
No external state library. `src/store/useAppStore.ts` implements three custom hooks with module-level singletons:
- `useConfig()` — broadcasts config changes to all components via a listener array
- `useScheduleList()` — loads on mount, exposes `reload()`
- `useSchedule(id)` — debounces writes (300 ms) to avoid hammering the filesystem

### Assignment data model
The schedule grid is `assignments: Record<string, CellValue | null>` where keys are `"dayIndex-prosecutorIndex"` (both 0-based). Day index is position in the array returned by `getDaysForSchedule(startDate, endDate)`, not the calendar day number.

### HTML export — zero JavaScript
`src/utils/htmlExport.ts` generates a fully static, self-contained HTML file with **no JavaScript at all**. Navigation is pure `<a href="#...">` anchor links. All schedule data is pre-rendered as HTML by TypeScript at export time. This is intentional: the file must work in iOS QuickLook, WhatsApp, Gmail attachments, and similar environments that render HTML/CSS but block JavaScript.

Structure of the exported file:
- `id="top"` — sticky navigation buttons + full grid table
- `id="pro-N"` — one section per prosecutor with day-cards and pre-computed stats
- `id="judge-N"` — one section per judge showing which prosecutors appear each day
- Each section has `<a href="#top">הצג הכל ↑</a>`

To validate an exported file: `python3 /tmp/check-html.py` (checks zero JS, anchor links, static sections, no external resources).

### PDF export
`src/utils/pdfExport.ts` generates print-optimized HTML (one page per prosecutor). The main process (`export:pdf` IPC handler) writes it to a temp file, loads it in a hidden `BrowserWindow`, calls `printToPDF()`, then opens the result with `shell.openPath`.

### CellPopover behavior
On weekdays: shows judges (from `config.judges`), supervisor options, general options, free text. On weekends (`isWeekend=true` prop): only shows 🚨 ת. עצורים and free text input. Auto-advances to the next prosecutor column after a selection.

### Date utilities
`getDaysForSchedule(startDate, endDate)` uses local date parsing (not UTC) to avoid timezone-shifted days. `isWeekend` is `dayOfWeek === 5 || dayOfWeek === 6` (Friday or Saturday, Israeli work week). Dates are always ISO strings `"YYYY-MM-DD"`; the schedule ID compact form strips dashes.
