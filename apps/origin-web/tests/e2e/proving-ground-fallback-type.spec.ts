import { test, expect } from '@playwright/test'

// A floor saved without fleet types (older plans, fleets added before types were
// explicit) gives its robots the workflow default type. The Robot tool must treat
// that as the robot's type: tapping it with the same type removes it, as it does
// for any other robot, instead of reporting "no change" on every tap.

test('the Robot tool removes a robot whose type comes from the workflow default', async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/')
      ? route.continue() : route.abort('blockedbyclient')
  })
  const siteMap = { width: 6, height: 5, start: { x: 0, y: 2 }, item: { x: 2, y: 2 }, drop: { x: 5, y: 2 }, robots: [{ x: 0, y: 0 }], obstacles: [], hazards: [], humanOnly: [] }
  await page.route('**/src/proving-ground/starterFloor.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, body: (await response.text()).replace('siteMap: starterSiteMap(),', `siteMap: ${JSON.stringify(siteMap)},`) })
  })
  await page.goto('/proving-ground')
  const robot = page.getByRole('button', { name: 'A1, Fleet 1 AMR robot 1', exact: true })
  await expect(robot).toBeVisible()
  await robot.click() // Robot tool, placement type AMR: the type this robot already has
  await expect(page.getByRole('button', { name: 'A1, empty', exact: true })).toBeVisible()
  await expect(page.locator('.site-map-panel [aria-live="polite"]').last()).toHaveText('Removed the Fleet 1 AMR robot 1 (AM1) at A1.')
})
