import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// These tests inspect the migration SET, not a live DB — but they assert the
// properties that actually make `npx @insforge/cli db migrations up --all` apply
// on a clean project (correct ordering) and upgrade a pre-existing/partial table
// (ADD COLUMN IF NOT EXISTS), plus the RLS posture. They would FAIL on the
// ordering bug that shipped before the baseline migration was added.

const migrationsDir = fileURLToPath(new URL('../../migrations/', import.meta.url))
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort() // lexicographic == chronological for timestamped names
const read = (f: string) => readFileSync(`${migrationsDir}${f}`, 'utf8')
const sources = files.map((f) => ({ f, sql: read(f) }))

const mentionsTable = (sql: string) => /\beval_episodes\b/.test(sql)
const createsTable = (sql: string) => /CREATE TABLE IF NOT EXISTS public\.eval_episodes/.test(sql)

// The flat audit-row columns the server writes (server/env/gym.ts).
const REQUIRED_COLUMNS = [
  'trace_id',
  'run_id',
  'episode_index',
  'run_sequence',
  'trace_authority',
  'scenario_snapshot',
  'requested_policy_mode',
  'actual_policy_source',
  'confidence',
  'passed',
  'reward',
  'category',
  'catastrophic',
  'license_summary',
  'audit_row_digest',
]

describe('eval_episodes migration set', () => {
  it('has at least the baseline + idempotency + RLS migrations', () => {
    expect(files.length).toBeGreaterThanOrEqual(3)
  })

  it('creates the table before any migration that references it (clean-DB ordering)', () => {
    const firstCreateIdx = sources.findIndex((s) => createsTable(s.sql))
    expect(firstCreateIdx, 'a migration must CREATE eval_episodes').toBeGreaterThanOrEqual(0)
    // Nothing may reference the table before it is created.
    const offending = sources
      .slice(0, firstCreateIdx)
      .filter((s) => mentionsTable(s.sql))
      .map((s) => s.f)
    expect(offending, 'these migrations reference eval_episodes before it is created').toEqual([])
  })

  it('the table-creating migration is the FIRST to mention eval_episodes', () => {
    const firstMentionIdx = sources.findIndex((s) => mentionsTable(s.sql))
    const firstCreateIdx = sources.findIndex((s) => createsTable(s.sql))
    expect(firstMentionIdx).toBe(firstCreateIdx)
  })

  it('the baseline upgrades a pre-existing/partial table via ADD COLUMN IF NOT EXISTS', () => {
    const baseline = sources.find((s) => createsTable(s.sql))!
    for (const col of REQUIRED_COLUMNS) {
      expect(
        new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\b`).test(baseline.sql),
        `baseline must ADD COLUMN IF NOT EXISTS ${col}`,
      ).toBe(true)
    }
  })

  it('enables RLS and revokes direct client access, with no permissive policy', () => {
    const all = sources.map((s) => s.sql).join('\n')
    expect(all).toMatch(/ALTER TABLE public\.eval_episodes ENABLE ROW LEVEL SECURITY/)
    expect(all).toMatch(/REVOKE ALL ON TABLE public\.eval_episodes FROM anon, authenticated/)
    expect(all).not.toMatch(/CREATE POLICY/i)
    expect(all).not.toMatch(/USING\s*\(\s*true\s*\)/i)
  })

  it('does not reference verifier/license/digest source modules', () => {
    const all = sources.map((s) => s.sql).join('\n')
    expect(all).not.toMatch(/computeAuditDigest|verifier\.ts|license\.ts|digest\.ts/)
  })
})
