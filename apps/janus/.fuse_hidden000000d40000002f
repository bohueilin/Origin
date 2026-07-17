import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
    plugins: [react()],
    // Multi-entry: the existing console (index.html) + the Passport demo (passport.html,
    // a self-contained client-side app at /passport.html — no backend needed).
    build: {
      rollupOptions: {
        input: { main: 'index.html', passport: 'passport.html' },
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
