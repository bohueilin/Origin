import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only clean URLs so the dev server matches production (Cloudflare Pages serves
// `app.html` at `/app` and `auth.html` at `/auth`). Without this, the OAuth callback to
// `${origin}/app` 404s locally and the `insforge_code` is never exchanged — i.e. "Continue
// with Google" appears to do nothing in local dev.
function devCleanUrls(): Plugin {
  const map: Record<string, string> = { '/app': '/app.html', '/auth': '/auth.html', '/passport': '/passport.html', '/foundry': '/foundry.html' }
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
    plugins: [react(), devCleanUrls()],
    build: {
      // Entries: marketing home (index.html), console app (app.html), auth (auth.html).
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          app: resolve(__dirname, 'app.html'),
          auth: resolve(__dirname, 'auth.html'),
          passport: resolve(__dirname, 'passport.html'),
          foundry: resolve(__dirname, 'foundry.html'),
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
