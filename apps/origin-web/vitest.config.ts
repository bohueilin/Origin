import { defineConfig } from 'vitest/config'

// Standalone test config — intentionally independent from vite.config.ts so the
// unit tests run in a plain Node environment without starting the app or the
// standalone gym server.
//
// This app is the single vitest runner for the whole evidence stack: the
// warehouse env family + its oracle-integration tests live in env/ (they import
// ../src/warehouse.ts — app-coupled until packages/oracle exists), while the
// pure @origin/evidence + @origin/verifier-core package suites live in
// ../../packages/* and are included here via relative globs.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'server/**/*.test.ts',
      'env/**/*.test.ts',
      '../../packages/evidence/**/*.test.ts',
      '../../packages/verifier-core/**/*.test.ts',
    ],
  },
})
