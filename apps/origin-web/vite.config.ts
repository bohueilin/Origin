import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Public identity defaults to the canonical product website in source. Optional
// build overrides affect only website pages and discovery files; copied evidence,
// archived research, JavaScript and backend compatibility configuration stay intact.
// See ../../docs/domain-and-inbox-cutover.md.
const DEFAULT_HOST = 'originphysicalai.com'
const DEFAULT_EMAIL = 'bohueilin@gmail.com'

function siteUrlRewrite(): Plugin {
  const siteUrl = (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || '').replace(/\/+$/, '')
  const contactEmail = process.env.CONTACT_EMAIL || ''
  const newHost = siteUrl.replace(/^https?:\/\//, '')
  const active = Boolean(siteUrl) || Boolean(contactEmail)
  let outDir = resolve(__dirname, 'dist')

  const rewrite = (s: string): string => {
    let out = s
    if (siteUrl) {
      // One pass avoids rewriting the replacement (e.g. a preview subdomain).
      // Host boundaries keep independent subdomains and addresses untouched.
      out = out.replace(
        /(?<![\w.@-])(?:https?:\/\/)?originphysicalai\.com(?=[:/?#\s"'<>]|$)/g,
        (match) => match.startsWith('http') ? siteUrl : newHost,
      )
    }
    if (contactEmail) out = out.split(DEFAULT_EMAIL).join(contactEmail)
    return out
  }

  const rewriteFile = (path: string) => {
    if (!statSync(path).isFile()) return
    const before = readFileSync(path, 'utf8')
    const after = rewrite(before)
    if (after !== before) writeFileSync(path, after)
  }

  return {
    name: 'origin-site-url-rewrite',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir) },
    transformIndexHtml(html) { return active ? rewrite(html) : html },
    closeBundle() {
      if (!active) return
      // Explicit public identity boundary: never rewrite JSON, signed proof,
      // benchmark/research snapshots or compiled application code.
      for (const name of readdirSync(outDir)) {
        const path = join(outDir, name)
        if (name.endsWith('.html') || ['llms.txt', 'sitemap.xml', 'robots.txt'].includes(name)) {
          rewriteFile(path)
        } else if (name === 'legal' && statSync(path).isDirectory()) {
          for (const legalName of readdirSync(path)) {
            if (legalName.endsWith('.html')) rewriteFile(join(path, legalName))
          }
        }
      }
      console.log(`[site-url] rewrote website identity → ${newHost || DEFAULT_HOST}${contactEmail ? `, contact → ${contactEmail}` : ''}`)
    },
  }
}

// Dev-only clean URLs so the dev server matches production (Cloudflare Pages serves
// `app.html` at `/app` and `auth.html` at `/auth`). Without this, the OAuth callback to
// `${origin}/app` 404s locally and the `insforge_code` is never exchanged — i.e. "Continue
// with Google" appears to do nothing in local dev.
function devCleanUrls(): Plugin {
  const map: Record<string, string> = { '/app': '/app.html', '/capture': '/capture.html', '/auth': '/auth.html', '/admin': '/admin.html', '/passport': '/passport.html', '/foundry': '/foundry.html', '/soc': '/soc.html', '/clip': '/clip.html', '/brief': '/brief.html', '/proof': '/proof.html', '/trust': '/trust.html', '/security': '/security.html', '/over-grant': '/over-grant.html', '/verify': '/verify.html', '/reference-check': '/reference-check.html', '/reference-check-vs-runtime': '/reference-check-vs-runtime.html', '/simulation': '/simulation.html', '/operations': '/operations.html', '/labs': '/labs.html', '/proving-ground': '/proving-ground.html' }
  return {
    name: 'dev-clean-urls',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, _res: ServerResponse, next: () => void) => {
        const url = req.url ?? ''
        const qi = url.indexOf('?')
        const path = qi === -1 ? url : url.slice(0, qi)
        if (map[path]) req.url = map[path] + (qi === -1 ? '' : url.slice(qi))
        next()
      })
    },
  }
}

// https://vite.dev/config/
//
// The backend is the standalone Hono server (`server/main.ts`, `npm run server`).
// Vite owns the frontend only and proxies `/api` + `/v1` to that server. No
// secrets are read here — they are loaded by `server/config.ts` in the Node
// process and never reach the client bundle.
export default defineConfig(() => {
  // Non-secret override for the backend origin the dev server proxies to.
  const backendOrigin =
    process.env.VITE_BACKEND_ORIGIN || process.env.BACKEND_ORIGIN || 'http://localhost:8787'

  return {
    plugins: [react(), devCleanUrls(), siteUrlRewrite()],
    build: {
      // Entries: marketing home (index.html), evidence console (app.html), capture preview (capture.html), auth (auth.html), admin portal (admin.html).
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          app: resolve(__dirname, 'app.html'),
          capture: resolve(__dirname, 'capture.html'),
          auth: resolve(__dirname, 'auth.html'),
          admin: resolve(__dirname, 'admin.html'),
          passport: resolve(__dirname, 'passport.html'),
          foundry: resolve(__dirname, 'foundry.html'),
          soc: resolve(__dirname, 'soc.html'),
          clip: resolve(__dirname, 'clip.html'),
          brief: resolve(__dirname, 'brief.html'),
          proof: resolve(__dirname, 'proof.html'),
          trust: resolve(__dirname, 'trust.html'),
          security: resolve(__dirname, 'security.html'),
          overGrant: resolve(__dirname, 'over-grant.html'),
          verify: resolve(__dirname, 'verify.html'),
          referenceCheck: resolve(__dirname, 'reference-check.html'),
          referenceCheckVsRuntime: resolve(__dirname, 'reference-check-vs-runtime.html'),
          simulation: resolve(__dirname, 'simulation.html'),
          operations: resolve(__dirname, 'operations.html'),
          labs: resolve(__dirname, 'labs.html'),
          provingGround: resolve(__dirname, 'proving-ground.html'),
        },
      },
    },
    server: {
      // Honor a PORT env var (used by preview/CI tooling); fall back to default.
      ...(process.env.PORT ? { port: Number(process.env.PORT) } : {}),
      // Allow public tunnels (ngrok / cloudflared / localtunnel) to reach the dev
      // server so the Vapi operator webhook can call /api/vapi/tools.
      allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.io', '.loca.lt'],
      // Proxy backend traffic to the standalone Hono server.
      proxy: {
        '/api': { target: backendOrigin, changeOrigin: true },
        '/v1': { target: backendOrigin, changeOrigin: true },
      },
    },
  }
})
