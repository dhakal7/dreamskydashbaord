import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '../..')

test('Production Cleanliness: imported-data.json contains 0 records', () => {
  const jsonPath = path.join(frontendRoot, 'src/mock/imported-data.json')
  if (!fs.existsSync(jsonPath)) return
  const content = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  assert.equal(content.students?.length ?? 0, 0, 'students array must be empty')
  assert.equal(content.leads?.length ?? 0, 0, 'leads array must be empty')
  assert.equal(content.counselors?.length ?? 0, 0, 'counselors array must be empty')
  assert.equal(content.followUps?.length ?? 0, 0, 'followUps array must be empty')
})

test('Production Cleanliness: No source file imports imported-data.json', () => {
  const srcDir = path.join(frontendRoot, 'src')
  function scan(dir) {
    const files = fs.readdirSync(dir)
    for (const f of files) {
      const full = path.join(dir, f)
      if (fs.statSync(full).isDirectory()) {
        scan(full)
      } else if (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js')) {
        const text = fs.readFileSync(full, 'utf8')
        assert.ok(!text.includes('imported-data.json'), `${f} must not import or reference imported-data.json`)
      }
    }
  }
  scan(srcDir)
})

test('Production Cleanliness: REAL_EXCEL_FEES is absent from source code', () => {
  const feePanelPath = path.join(frontendRoot, 'src/features/reception/components/fee-management-panel.tsx')
  const content = fs.readFileSync(feePanelPath, 'utf8')
  assert.ok(!content.includes('REAL_EXCEL_FEES'), 'fee-management-panel.tsx must not contain REAL_EXCEL_FEES')
  assert.ok(!content.includes('seedStudents'), 'fee-management-panel.tsx must not import seedStudents')
})

test('Production Cleanliness: Production bundle assets contain zero client PII', () => {
  const distAssetsDir = path.join(frontendRoot, 'dist/assets')
  assert.ok(fs.existsSync(distAssetsDir), 'dist/assets must exist')
  const files = fs.readdirSync(distAssetsDir)
  const forbiddenTerms = [
    'Dhiraj Rai', 'Prajwol Bishwokarma', 'Binit Tamang', 'Samjhana Lama',
    'Lakpa Gyalgal', '9815937637', '9813069109', '9860222465', '9861794985',
    'N861886', 'N607217', 'N362753', 'N457831', 'N343021', 'REAL_EXCEL_FEES',
  ]
  for (const f of files) {
    if (f.endsWith('.js') || f.endsWith('.css') || f.endsWith('.json')) {
      const text = fs.readFileSync(path.join(distAssetsDir, f), 'utf8')
      for (const term of forbiddenTerms) {
        assert.ok(!text.includes(term), `dist/assets/${f} must not contain sensitive term: ${term}`)
      }
    }
  }
})
