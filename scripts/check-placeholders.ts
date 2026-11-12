// Fails if any {{placeholder}} remains in src — run in `npm run release`,
// never in `npm test` (the human fills them before submitting).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

const root = resolve(import.meta.dirname, '..', 'src')
const offenders = walk(root)
  .filter((f) => /\.(ts|tsx|css|html)$/.test(f))
  .filter((f) => /\{\{\s*[A-Z][A-Z0-9_]*\s*\}\}/.test(readFileSync(f, 'utf8')))

if (offenders.length > 0) {
  console.error('Placeholders remain — fill these before releasing:')
  for (const f of offenders) console.error(`  ${f}`)
  process.exit(1)
}
console.log('No placeholders remain.')
