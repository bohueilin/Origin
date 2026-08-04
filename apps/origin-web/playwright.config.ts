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
  // reducedMotion: the stylesheet honours `prefers-reduced-motion: reduce` by turning
  // off `scroll-behavior: smooth` and animations. Without it, Playwright's auto-scroll
  // on the 390px project fights the smooth-scroll animation and an element never
  // reports "stable" (the /reference-check drift button timed out this way). Running
  // in a mode the product genuinely supports removes the flake without relaxing any
  // assertion.
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  // Desktop and mobile are both release gates: the investor journey has to hold at
  // 1280x800 and at 390x844, so every spec runs twice.
  projects: [
    // reducedMotion is scoped to the projects, NOT global: enhance.ts gates the
    // scroll-reveal observers and the demo Play button on !reduceMotion, so a global
    // 'reduce' would delete those branches from ALL coverage. Desktop keeps the
    // default (no-preference) so they stay exercised; mobile uses 'reduce' because
    // scroll-behavior:smooth fights Playwright's auto-scroll at 390px.
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], reducedMotion: 'no-preference' } },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        reducedMotion: 'reduce',
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${PORT}`,
    env: { PORT: String(PORT), VITE_DISABLE_OPTIONAL_BACKEND_FETCHES: '1' },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
