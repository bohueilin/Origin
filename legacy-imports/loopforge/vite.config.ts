import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { handleLoopForgeRun } from './src/server/devApi'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'loopforge-local-api',
      configureServer(server) {
        server.middlewares.use('/api/loopforge/run', (request, response) => {
          void handleLoopForgeRun(request, response)
        })
      },
    },
  ],
})
