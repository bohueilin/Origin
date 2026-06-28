#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// One-command demo launcher — the phone-approval purchase flow that must "just work".
//
//     npm run demo
//
// What it does, in order:
//   1. Tears down any stale tunnel / API server / web server (port-scoped, safe).
//   2. Starts a FRESH cloudflared quick tunnel to the API server.
//   3. Captures the live https://<random>.trycloudflare.com hostname.
//   4. Writes it to PUBLIC_BASE_URL (.env.local) AND injects it into the API server's
//      env — so the phone "Approve" link is NEVER stale (the #1 cause of the broken flow).
//   5. Starts the API server (node server/main.ts) with that value.
//   6. Starts vite (frontend on :5275) — with PORT scrubbed so it can't grab the API port.
//
// Ctrl-C tears everything down. If the tunnel can't start, it degrades to simulation and
// the IN-APP Approve still completes the purchase — the demo never hard-depends on the tunnel.
// ───────────────────────────────────────────────────────────────────────────
import { spawn, execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENV_FILE = path.join(ROOT, '.env.local')
const env = parseEnv(ENV_FILE)
const API_PORT = (env.PORT || '8787').trim()
const WEB_PORT = '5275'
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
  say('demo', 'stopping tunnel + server + web…')
  for (const c of children) { try { c.kill('SIGTERM') } catch { /* already gone */ } }
  setTimeout(() => process.exit(0), 700)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

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
  freePort(WEB_PORT)
  await new Promise((r) => setTimeout(r, 800))

  const base = await startTunnel()
  if (base) { setEnv('PUBLIC_BASE_URL', base); say('tunnel', `LIVE  ${base}`) }
  else say('tunnel', 'no tunnel — phone push runs in simulation; in-app Approve still completes the purchase')

  const serverEnv = { ...process.env, PORT: API_PORT }
  if (base) serverEnv.PUBLIC_BASE_URL = base
  const server = spawn('node', ['server/main.ts'], { cwd: ROOT, env: serverEnv, stdio: 'inherit' })
  children.push(server)
  server.on('exit', shutdown)

  // vite honors PORT (vite.config); pin it to the frontend port explicitly so it can't drift to
  // 5173/5174 or collide with the API's 8787. --strictPort keeps the URL predictable for the demo.
  const webEnv = { ...process.env, PORT: WEB_PORT }
  const web = spawn('npx', ['vite', '--port', WEB_PORT, '--strictPort'], { cwd: ROOT, env: webEnv, stdio: 'inherit' })
  children.push(web)
  web.on('exit', shutdown)

  setTimeout(() => {
    say('demo', '──────────────────────────────────────────────')
    say('demo', `Open    http://localhost:${WEB_PORT}/passport`)
    say('demo', `Phone   ${base ? base + ' (Approve link is live)' : 'simulation — set NTFY_TOPIC + re-run'}`)
    say('demo', 'Stop    Ctrl-C')
    say('demo', '──────────────────────────────────────────────')
  }, 2800)
})()
