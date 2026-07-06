import { defineConfig } from 'vitest/config'

// Standalone test config — intentionally independent from vite.config.ts so the
// unit tests run in a plain Node environment without starting the app or the
// standalone gym server.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'rlkit/**/*.test.ts'],
  },
})
