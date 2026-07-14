import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, extname } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// ── Clean-domain / contact cutover, driven by config (see docs/domain-and-inbox-cutover.md).
// Default host + contact are the current Cloudflare Pages deployment. Set SITE_URL (or
// PUBLIC_SITE_URL) and/or CONTACT_EMAIL in the build env to rewrite canonical/OG/llms/
// sitemap/robots + the contact email across the whole dist at build time — no source edits.
// Unset ⇒ complete no-op (output byte-identical to today).
const DEFAULT_HOST = 'origin-physical-ai.pages.dev'
const DEFAULT_EMAIL = 'hello@originphysical.ai'

function siteUrlRewrite(): Plugin {
  const siteUrl = (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || '').replace(/\/+$/, '')
  const contactEmail = process.env.CONTACT_EMAIL || ''
  const newHost = siteUrl.replace(/^https?:\/\//, '')
  const active = Boolean(siteUrl) || Boolean(contactEmail)

  const rewrite = (s: string): string => {
    let out = s
    if (siteUrl) {
      out = out.split(`https://${DEFAULT_HOST}`).join(siteUrl)
      out = out.split(`http://${DEFAULT_HOST}`).join(siteUrl)
      out = out.split(DEFAULT_HOST).join(newHost) // any bare-host references
    }
    if (contactEmail) out = out.split(DEFAULT_EMAIL).join(contactEmail)
    return out
  }

  const TEXT_EXT = new Set(['.html', '.txt', '.xml', '.json', '.webmanifest', '.js', '.css'])
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) { walk(p); continue }
      if (!TEXT_EXT.has(extname(name))) continue
      const before = readFileSync(p, 'utf8')
      const after = rewrite(before)
      if (after !== before) writeFileSync(p, after)
    }
  }

  return {
    name: 'origin-site-url-rewrite',
    // rewrites the entry HTMLs (canonical / OG / og:url) during build
    transformIndexHtml(html) { return active ? rewrite(html) : html },
    // rewrites the copied public assets (llms.txt, sitemap.xml, robots.txt, legal/*, 404.html)
    closeBundle() {
      if (!active) return
      walk(resolve(__dirname, 'dist'))
      console.log(`[site-url] rewrote host → ${newHost || DEFAULT_HOST}${contactEmail ? `, contact → ${contactEmail}` : ''}`)
    },
  }
}

// Dev-only clean URLs so the dev server matches production (Cloudflare Pages serves
// `app.html` at `/app` and `auth.html` at `/auth`). Without this, the OAuth callback to
// `${origin}/app` 404s locally and the `insforge_code` is never exchanged — i.e. "Continue
// with Google" appears to do nothing in local dev.
function devCleanUrls(): Plugin {
  const map: Record<string, string> = { '/app': '/app.html', '/capture': '/capture.html', '/auth': '/auth.html', '/passport': '/passport.html', '/foundry': '/foundry.html', '/soc': '/soc.html', '/clip': '/clip.html', '/brief': '/brief.html', '/proof': '/proof.html', '/trust': '/trust.html', '/security': '/security.html', '/verify': '/verify.html', '/reference-check': '/reference-check.html', '/simulation': '/simulation.html' }
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
      // Entries: marketing home (index.html), evidence console (app.html), capture preview (capture.html), auth (auth.html).
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          app: resolve(__dirname, 'app.html'),
          capture: resolve(__dirname, 'capture.html'),
          auth: resolve(__dirname, 'auth.html'),
          passport: resolve(__dirname, 'passport.html'),
          foundry: resolve(__dirname, 'foundry.html'),
          soc: resolve(__dirname, 'soc.html'),
          clip: resolve(__dirname, 'clip.html'),
          brief: resolve(__dirname, 'brief.html'),
          proof: resolve(__dirname, 'proof.html'),
          trust: resolve(__dirname, 'trust.html'),
          security: resolve(__dirname, 'security.html'),
          verify: resolve(__dirname, 'verify.html'),
          referenceCheck: resolve(__dirname, 'reference-check.html'),
          simulation: resolve(__dirname, 'simulation.html'),
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
