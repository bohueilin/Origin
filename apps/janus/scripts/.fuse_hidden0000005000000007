#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// Public demo launcher — the SAME real Passport flow as `npm run demo`, but served from a
// PUBLIC Cloudflare Pages URL instead of localhost. Anyone with the link can run it (notifications,
// Discord, email, wallet, credential broker) while THIS machine runs the backend behind a tunnel.
//
//     npm run deploy:public
//
// What it does, in order:
//   1. Tears down any stale tunnel / API server (port-scoped, safe).
//   2. Starts a FRESH cloudflared quick tunnel to the local API server and captures its URL.
//      That ONE tunnel serves both the deployed frontend's /api calls AND the phone "Approve" link.
//   3. Builds the static frontend with VITE_API_BASE = the tunnel URL (so the deployed site calls
//      this machine's backend) and writes PUBLIC_BASE_URL so the phone link is never stale.
//   4. Deploys the build to a PREVIEW alias of the existing Pages project — production
//      (hud-factorydad-1 → origin-physical-ai.pages.dev) is NEVER touched.
//   5. Starts the API server with the tunnel URL + the deployed origin allowlisted (EXTRA_WEB_ORIGINS).
//
// Ctrl-C tears the tunnel + server down. The deployed URL stops working when this process stops —
// that is the deliberate trade for "real backend, no rewrite" (see README_LOCAL_DEMO.md).
// ───────────────────────────────────────────────────────────────────────────
import { spawn, execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENV_FILE = path.join(ROOT, '.env.local')

// --- deploy target (a PREVIEW alias — never the production branch) -----------
const PROJECT = 'origin-physical-ai'
const PROD_BRANCH = 'hud-factorydad-1' // the live site's branch — must NEVER be our target
const BRANCH = 'passport-demo'
const ORIGIN_SUFFIX = `.${PROJECT}.pages.dev` // suffix-match every preview alias of this project
const ALIAS_URL = `https://${BRANCH}.${PROJECT}.pages.dev`

if (BRANCH === PROD_BRANCH) {
  console.error(`[deploy] refusing: branch ${BRANCH} is the production branch.`)
  process.exit(1)
}

const env = parseEnv(ENV_FILE)
const API_PORT = (env.PORT || '8787').trim()
const children = []
let down = false

function parseEnv(f) {
  const out = {}
  if (!existsSync(f)) return out
  for (const ln of readFileSync(f, 'utf8').split('\n')) {
    const m = ln.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}
function setEnv(key, val) {
  let t = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : ''
  const re = new RegExp(`^${key}=.*$`, 'm')
  t = re.test(t) ? t.replace(re, `${key}=${val}`) : t.replace(/\n*$/, '\n') + `${key}=${val}\n`
  writeFileSync(ENV_FILE, t)
}
function freePort(p) {
  try { execSync(`lsof -ti tcp:${p} | xargs kill -9`, { stdio: 'ignore' }) } catch { /* nothing on the port */ }
}
function say(tag, msg) { process.stdout.write(`\x1b[36m[${tag}]\x1b[0m ${msg}\n`) }
function shutdown() {
  if (down) return
  down = true
  say('public', 'stopping tunnel + server…')
  for (const c of children) { try { c.kill('SIGTERM') } catch { /* already gone */ } }
  setTimeout(() => process.exit(0), 700)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// Run a child to completion; resolve { code, out } with stdout captured (and streamed unless quiet).
function run(cmd, args, opts = {}) {
  const { quiet, ...spawnOpts } = opts
  return new Promise((resolve) => {
    const c = spawn(cmd, args, { cwd: ROOT, ...spawnOpts })
    let out = ''
    if (c.stdout) c.stdout.on('data', (b) => { out += b; if (!quiet) process.stdout.write(b) })
    if (c.stderr) c.stderr.on('data', (b) => { out += b; if (!quiet) process.stderr.write(b) })
    c.on('exit', (code) => resolve({ code: code ?? 1, out }))
  })
}

// Ask Cloudflare for the project's ACTUAL production branch. The static BRANCH!==PROD_BRANCH guard
// can't catch CF-side config drift (e.g. someone sets the project's production branch to our preview
// branch) — this does, so a `deploy:public` can never silently publish over the live marketing site.
async function liveProductionBranch() {
  const r = await run('npx', ['--no-install', 'wrangler', 'pages', 'deployment', 'list', '--project-name', PROJECT],
    { stdio: ['ignore', 'pipe', 'pipe'], quiet: true })
  if (r.code !== 0) return null
  for (const line of r.out.split('\n')) {
    if (!line.includes('Production')) continue
    const cells = line.split('│').map((s) => s.trim()) // [_, id, environment, branch, source, ...]
    if (cells[2] === 'Production' && cells[3]) return cells[3]
  }
  return null
}

function startTunnel() {
  return new Promise((resolve) => {
    say('tunnel', `cloudflared → http://localhost:${API_PORT}`)
    const cf = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${API_PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] })
    children.push(cf)
    let resolved = false
    const scan = (buf) => {
      const m = buf.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
      if (m && !resolved) { resolved = true; resolve(m[0]) }
    }
    cf.stdout.on('data', scan)
    cf.stderr.on('data', scan)
    cf.on('exit', () => { if (!resolved) { resolved = true; resolve('') } })
    setTimeout(() => { if (!resolved) { resolved = true; resolve('') } }, 40000)
  })
}

;(async () => {
  try { execSync('pkill -f "cloudflared tunnel --url" || true', { stdio: 'ignore' }) } catch { /* none running */ }
  freePort(API_PORT)
  await new Promise((r) => setTimeout(r, 800))

  // 1) Tunnel — the public address of THIS machine's backend.
  const base = await startTunnel()
  if (!base) {
    say('tunnel', 'FAILED — a public deploy needs a live backend tunnel. Aborting (try again, or use `npm run demo` for local-only).')
    shutdown()
    return
  }
  say('tunnel', `LIVE  ${base}`)
  setEnv('PUBLIC_BASE_URL', base)
  setEnv('EXTRA_WEB_ORIGINS', ORIGIN_SUFFIX)

  // 2) Build the static frontend pointed at the tunnel.
  say('build', `vite build  (VITE_API_BASE=${base})`)
  const built = await run('npm', ['run', 'build'], { env: { ...process.env, VITE_API_BASE: base } })
  if (built.code !== 0) { say('build', 'FAILED — see output above. Aborting before deploy.'); shutdown(); return }

  // 3) Verify CF's REAL production branch hasn't drifted onto our target, THEN deploy to a preview alias.
  const liveProd = await liveProductionBranch()
  if (liveProd && liveProd === BRANCH) {
    say('deploy', `ABORT: Cloudflare's production branch for ${PROJECT} is "${BRANCH}" — deploying it would clobber the live site. Refusing.`)
    shutdown(); return
  }
  if (liveProd && liveProd !== PROD_BRANCH) {
    say('deploy', `ABORT: Cloudflare's production branch is "${liveProd}", not the expected "${PROD_BRANCH}" (config drift). Refusing until verified.`)
    shutdown(); return
  }
  if (!liveProd) say('deploy', `WARN: could not confirm CF's production branch; proceeding to PREVIEW branch "${BRANCH}" (still guarded by BRANCH!==PROD_BRANCH).`)
  say('deploy', `wrangler pages deploy dist → ${PROJECT} (branch ${BRANCH}, PREVIEW)`)
  const dep = await run('npx', ['--no-install', 'wrangler', 'pages', 'deploy', 'dist',
    '--project-name', PROJECT, '--branch', BRANCH, '--commit-dirty=true'])
  if (dep.code !== 0) { say('deploy', 'FAILED — see output above.'); shutdown(); return }
  const hashUrl = (dep.out.match(/https:\/\/[a-z0-9]+\.origin-physical-ai\.pages\.dev/) || [])[0]

  // 4) Start the API server with the tunnel base + the deployed origin allowlisted.
  const serverEnv = { ...process.env, PORT: API_PORT, PUBLIC_BASE_URL: base, EXTRA_WEB_ORIGINS: ORIGIN_SUFFIX }
  const server = spawn('node', ['server/main.ts'], { cwd: ROOT, env: serverEnv, stdio: 'inherit' })
  children.push(server)
  server.on('exit', shutdown)

  setTimeout(() => {
    say('public', '──────────────────────────────────────────────')
    say('public', `LIVE    ${ALIAS_URL}/passport`)
    if (hashUrl && !hashUrl.startsWith(ALIAS_URL)) say('public', `        ${hashUrl}/passport  (this exact build)`)
    say('public', `Backend ${base}  (this machine, via tunnel)`)
    say('public', `Prod    https://${PROJECT}.pages.dev is UNTOUCHED (branch ${PROD_BRANCH})`)
    say('public', 'Stop    Ctrl-C  (the public URL stops working when this stops)')
    say('public', '──────────────────────────────────────────────')
  }, 2500)
})()
