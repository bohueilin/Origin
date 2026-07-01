import { defineConfig, devices } from '@playwright/test'

// Browser-level page validation: smoke + accessibility (axe) gates against the real app.
// Runs its own vite dev server on a dedicated port so it never clashes with a preview.
const PORT = 5290

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${PORT}`,
    env: { PORT: String(PORT), VITE_DISABLE_OPTIONAL_BACKEND_FETCHES: '1' },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
