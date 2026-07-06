import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The only keys LoopForge ever reads. Everything else (other projects' provider keys,
// the full process environment) is filtered out so it cannot leak through this map.
const ALLOWED_KEYS = new Set([
  'CEREBRAS_API_KEY',
  'CEREBRAS_MODEL',
  'FIREWORKS_API_KEY',
  'BASELINE_PROVIDER',
  'BASELINE_API_KEY',
  'BASELINE_BASE_URL',
  'BASELINE_MODEL',
])

type EnvMap = Record<string, string>

function parseEnvLine(line: string) {
  const trimmed = line.trim()

  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
    return null
  }

  const equals = trimmed.indexOf('=')
  const key = trimmed.slice(0, equals).trim()
  let value = trimmed.slice(equals + 1).trim()

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }

  return { key, value }
}

function readEnvFile(path: string): EnvMap {
  if (!existsSync(path)) {
    return {}
  }

  const content = readFileSync(path, 'utf8')
  const parsed: EnvMap = {}

  for (const line of content.split(/\r?\n/)) {
    const entry = parseEnvLine(line)
    if (entry) {
      parsed[entry.key] = entry.value
    }
  }

  return parsed
}

export function loadLocalEnv(): EnvMap {
  // Project-local env first, then an optional external file via LOOPFORGE_SOURCE_ENV.
  // No path is hardcoded — recorded mode needs no keys; live mode reads from the
  // project's own .env.local / process env, or an explicit LOOPFORGE_SOURCE_ENV override.
  const paths = [
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '.env'),
    process.env.LOOPFORGE_SOURCE_ENV,
  ].filter((path): path is string => Boolean(path))

  const loaded: EnvMap = {}

  for (const path of paths) {
    Object.assign(loaded, readEnvFile(path))
  }

  // Process env wins over files, then everything is filtered to the allowlist so no
  // unrelated secret (from a shared env file or the wider process environment) survives.
  const merged: EnvMap = { ...loaded }
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      merged[key] = value
    }
  }

  return Object.fromEntries(
    Object.entries(merged).filter(([key]) => ALLOWED_KEYS.has(key)),
  )
}

export function requireEnv(env: EnvMap, key: string) {
  const value = env[key]

  if (!value) {
    return { ok: false as const, missing: key }
  }

  return { ok: true as const, value }
}
