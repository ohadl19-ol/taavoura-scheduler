// ES5 validation test for generated HTML export
// Run with: node validate-html-es5.mjs

import { readFileSync } from 'fs'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Step 1: Build the TypeScript
console.log('Building TypeScript...')
try {
  execSync('npm run build', { cwd: __dirname, stdio: 'pipe' })
  console.log('✅ Build succeeded\n')
} catch (e) {
  console.error('❌ Build failed:', e.stderr?.toString() || e.message)
  process.exit(1)
}

// Step 2: We can't easily import Vite-compiled code, so we extract and test the JS
// by scanning the TypeScript source directly for forbidden patterns in the `js` array.
// The `js` array contains lines that become the embedded JS. Each line is a TS string literal.

const src = readFileSync(join(__dirname, 'src/utils/htmlExport.ts'), 'utf-8')

// Extract lines between the js = [ ... ] and .join('\n')
const startMarker = "// IMPORTANT: All JS below must be 100% ES5."
const endMarker = "  ].join('\\n')"

const startIdx = src.indexOf(startMarker)
const endIdx = src.indexOf(endMarker, startIdx)

if (startIdx === -1 || endIdx === -1) {
  console.error('❌ Could not find JS section boundaries in source')
  process.exit(1)
}

const jsSection = src.slice(startIdx, endIdx)

// Also check the css section for any JS-relevant patterns (shouldn't have any)
// But primarily we check the embedded JS strings.

// Extract string literals that become the JS output
// These are the single-quoted strings in the `js` array
// We need to find what text they output (after unescaping single-level \\ -> \)
const jsLines = []
const lineRegex = /^\s*'(.*)',?\s*$/gm
let match
while ((match = lineRegex.exec(jsSection)) !== null) {
  // Unescape: \\ becomes \ (one level of TypeScript string unescaping)
  const line = match[1]
    .replace(/\\\\u/g, '\\u')      // \\u -> \u (unicode escapes in output JS)
    .replace(/\\\\n/g, '\\n')      // \\n -> \n
    .replace(/\\\\t/g, '\\t')
    .replace(/\\\\/g, '\\')        // \\\\ -> \\
    .replace(/\\'/g, "'")           // \' -> '
    .replace(/\\"/g, '"')           // \" -> "
  jsLines.push(line)
}

const jsOutput = jsLines.join('\n')

console.log('--- Extracted embedded JS (first 30 lines) ---')
console.log(jsOutput.split('\n').slice(0, 30).join('\n'))
console.log('...\n')

// Step 3: Check for forbidden ES6+ patterns
let errors = 0

function check(pattern, description, isRegex) {
  const found = isRegex ? pattern.test(jsOutput) : jsOutput.indexOf(pattern) !== -1
  if (found) {
    const matches = isRegex
      ? (jsOutput.match(new RegExp(pattern.source, 'g')) || [])
      : jsOutput.split(pattern).length - 1
    console.error('❌ FORBIDDEN: ' + description + ' found (' + (isRegex ? 'regex match' : matches + ' occurrences') + ')')
    // Show context
    if (!isRegex) {
      const idx = jsOutput.indexOf(pattern)
      const ctx = jsOutput.slice(Math.max(0, idx - 40), idx + pattern.length + 40)
      console.error('   Context: ...' + ctx.replace(/\n/g, '↵') + '...')
    }
    errors++
  } else {
    console.log('✅ OK: No ' + description)
  }
}

console.log('--- ES5 Compliance Checks ---\n')

check(/\bconst\b/, 'const keyword', true)
check(/\blet\b/, 'let keyword', true)
check(/=>/, 'arrow function =>', true)
check(/\.forEach\s*\(/, 'Array.forEach()', true)
check(/\.includes\s*\(/, 'Array/String.includes()', true)
check(/`/, 'template literal backtick', true)
check(/\\u\{[0-9a-fA-F]+\}/, '\\u{XXXX} ES6 unicode escape', true)
check(/\bfor\s*\(.*\bof\b/, 'for...of loop', true)
check(/Object\.keys\s*\(/, 'Object.keys()', true)
check(/Array\.from\s*\(/, 'Array.from()', true)
check(/\.find\s*\(/, '.find()', true)
check(/\.findIndex\s*\(/, '.findIndex()', true)
check(/\.map\s*\(/, '.map()', true)
check(/\.filter\s*\(/, '.filter()', true)
check(/\.reduce\s*\(/, '.reduce()', true)
check(/\.some\s*\(/, '.some()', true)
check(/\.every\s*\(/, '.every()', true)
check(/\.\.\.[a-zA-Z]/, 'spread operator', true)

console.log('\n--- Additional Checks ---\n')

// Check that the button has onclick (not onchange on select)
const htmlSrc = readFileSync(join(__dirname, 'src/utils/htmlExport.ts'), 'utf-8')
if (htmlSrc.includes('onchange="renderSchedule()">') || htmlSrc.includes("onchange='renderSchedule()'")) {
  console.error('❌ FORBIDDEN: onchange="renderSchedule()" still present on select')
  errors++
} else {
  console.log('✅ OK: No onchange on select')
}

if (htmlSrc.includes('onclick="renderSchedule()"') || htmlSrc.includes("onclick='renderSchedule()'")) {
  console.log('✅ OK: onclick="renderSchedule()" found (on button)')
} else {
  console.error('❌ MISSING: No onclick="renderSchedule()" button found')
  errors++
}

if (htmlSrc.includes('min-height:44px') || htmlSrc.includes('min-height: 44px')) {
  console.log('✅ OK: Button has min-height 44px tap target')
} else {
  console.error('❌ MISSING: Button min-height 44px not found')
  errors++
}

if (htmlSrc.includes('WELCOME_HTML')) {
  console.log('✅ OK: WELCOME_HTML pattern avoids inline emoji in JS')
} else {
  console.error('❌ MISSING: WELCOME_HTML variable not found')
  errors++
}

if (htmlSrc.includes("prosecutors.length === 1")) {
  console.log('✅ OK: Auto-render for single prosecutor present')
} else {
  console.error('❌ MISSING: Auto-render for single prosecutor not found')
  errors++
}

if (htmlSrc.includes('#show-btn')) {
  console.log('✅ OK: #show-btn element found')
} else {
  console.error('❌ MISSING: #show-btn not found')
  errors++
}

// Final result
console.log('\n' + '='.repeat(50))
if (errors === 0) {
  console.log('✅ ALL CHECKS PASSED — Safe to build DMG')
} else {
  console.error('❌ ' + errors + ' check(s) FAILED — Fix before building DMG')
  process.exit(1)
}
