import { expect, test } from '@playwright/test'

test('site-to-gym sample package renders review, export, and claim boundaries', async ({ page }) => {
  await page.goto('/app.html')
  await page.getByRole('button', { name: 'Run customer-owned readiness demo' }).click()
  await expect(page.getByText('Video-to-Site-to-Gym MVP', { exact: true })).toBeVisible()
  await expect(page.getByText('Human review gate', { exact: true })).toBeVisible()
  await expect(page.getByText('Portable evidence bundle', { exact: true })).toBeVisible()
  await expect(page.getByText('Customer-owned readiness demo', { exact: true })).toBeVisible()
  await expect(page.getByText('SAFE_CONSERVATIVE', { exact: true })).toBeVisible()
  await expect(page.getByText('Customer calibration loop', { exact: true })).toBeVisible()
  await expect(page.getByText('Calibration needed: reduce false refusals without weakening refuse', { exact: true })).toBeVisible()
  await expect(page.getByText('84 calibration rows')).toBeVisible()
  await expect(page.getByText('Training authorization', { exact: true })).toBeVisible()
  await expect(page.getByText('blocked', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('not trained · rule candidate only', { exact: true })).toBeVisible()
  await expect(page.getByText('Policy improvement gate', { exact: true })).toBeVisible()
  await expect(page.getByText('Learned candidate evaluated: LEARNED_POLICY_READY_FOR_LIMITED_PILOT', { exact: true })).toBeVisible()
  await expect(page.getByText('Training authorized - synthetic demo only', { exact: true })).toBeVisible()
  await expect(page.getByText('Synthetic-demo learned-policy evidence only', { exact: false })).toBeVisible()
  await expect(page.getByText('Broader robustness gate', { exact: true })).toBeVisible()
  await expect(page.getByText('Broader robustness gate evaluated: CUSTOMER_SITE_PASS_BUT_COUNTERFACTUAL_FAIL', { exact: true })).toBeVisible()
  await expect(page.getByText('ROBUSTNESS_GATE_FAIL', { exact: true })).toBeVisible()
  await expect(page.getByText('COUNTERFACTUAL_ROBUSTNESS', { exact: true })).toBeVisible()
  await expect(page.getByText('not CUSTOMER_OWNED readiness', { exact: false })).toBeVisible()
  await expect(page.getByText('Customer-owned lane', { exact: true })).toBeVisible()
  await expect(page.getByText('customer-floor.json', { exact: true })).toBeVisible()
  await expect(page.getByText('Before', { exact: true })).toBeVisible()
  await expect(page.getByText('After', { exact: true })).toBeVisible()
  await expect(page.getByText('3D-aware context, not 3D reconstruction', { exact: true })).toBeVisible()
  await expect(page.getByText('not production-grade SLAM', { exact: false })).toBeVisible()
  await expect(page.getByText('not robot safety certification', { exact: false })).toBeVisible()
  await expect(page.getByText('certified safe')).toHaveCount(0)

  await page.getByPlaceholder('Reviewer notes, corrections, or approval context').fill('Reviewed during founder demo.')
  await page.getByRole('button', { name: 'Approve map' }).click()
  await expect(page.getByText('Map approved', { exact: true })).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download bundle' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^bundle_.*\.json$/)
})

test('mixed media upload shows keyframes, parser provenance/fallback, task cards, and trace', async ({ page }) => {
  await page.goto('/app.html')
  await page.locator('input[type="file"]').setInputFiles([
    {
      name: 'customer-walkthrough.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('not-a-real-video-but-valid-upload-intent'),
    },
    {
      name: 'site-floor-layout.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not-a-real-png-but-valid-upload-intent'),
    },
  ])

  await expect(page.getByText('Video keyframe strip', { exact: true })).toBeVisible()
  await expect(page.getByText('Structured 2D map', { exact: true })).toBeVisible()
  await expect(page.getByText('Replayable trace', { exact: true })).toBeVisible()
  await expect(page.getByText(/Generated fallback|Parsed from floor plan/).first()).toBeVisible()
  await expect(page.locator('.pipeline-chip')).toHaveCount(10)
  await expect(page.locator('.keyframe')).toHaveCount(4)
  await expect(page.locator('.task-card')).toHaveCount(17)
  await expect(page.locator('.provenance-item').first()).toBeVisible()
})
