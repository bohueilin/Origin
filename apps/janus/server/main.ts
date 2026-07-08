// ----------------------------------------------------------------------------
// Standalone, deployable server entrypoint (Hono). Replaces the Vite dev
// middleware. Thin by design: load config, log warnings, serve the app built in
// `server/app.ts` (which owns the route table and is independently testable).
//
//   npm run server        # node server/main.ts  (loads .env.local / process.env)
// ----------------------------------------------------------------------------

import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { ENVIRONMENT_NAME } from './evalVersions.ts'

const config = loadConfig()
for (const w of config.warnings) console.warn('[config]', w)

const app = createApp(config)

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[gym] ${ENVIRONMENT_NAME} server listening on http://localhost:${info.port}`)
})
