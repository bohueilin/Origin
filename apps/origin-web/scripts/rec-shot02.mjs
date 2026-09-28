// Film the in-page analyzer on /over-grant; published benchmark counts are separate.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openRecording, fleetFacts, rootFacts, scoreFacts } from './recLib.mjs'
const r = await openRecording('shot02', '/over-grant')
const { page, probe, mark, clickAt, settle, finish, release } = r
try {
  const analyze = await probe('analyze', page.getByRole('button', { name: 'Analyze the fleet', exact: true }))
  const widen = await probe('widen', page.getByRole('button', { name: 'Widen one delegation edge', exact: true }))
  const score = await probe('score', page.getByRole('button', { name: 'Score against planted ground truth', exact: true }))
  // Root count is a configuration fact from the exact released source, not the
  // separate 2,000-root published benchmark. Screen-derived results follow below.
  const sourcePath = 'apps/origin-web/src/security/SecurityPage.tsx'
  const source = execFileSync('git', ['show', `${release.commit}:${sourcePath}`], { cwd: fileURLToPath(new URL('../../..', import.meta.url)), encoding: 'utf8' })
  const roots = Number(source.match(/const OG_ROOTS = (\d+)/)?.[1])
  if (!Number.isInteger(roots) || roots <= 0) throw new Error('Released root configuration not found')
  await settle(analyze); mark('intro'); await page.waitForTimeout(3500)
  await clickAt(analyze)
  const surface = await probe('surface', page.locator('.sec-rsl'))
  await settle(surface)
  const fleet = await page.locator('#fleet-analysis').innerText()
  const fleetResult = fleetFacts(fleet, await surface.innerText())
  mark('analyze'); await page.waitForTimeout(4500)
  await clickAt(widen)
  const root = await probe('root', page.getByText(/^blast radius at the ROOT/))
  await settle(root)
  const rootText = await root.innerText(), rootResult = rootFacts(rootText)
  mark('widen'); await page.waitForTimeout(4500)
  await clickAt(score)
  const caught = await probe('caught', page.getByText(/^caught \d+\/\d+/))
  await settle(caught)
  const scoreText = await page.locator('#fleet-analysis').innerText()
  const scoreResult = scoreFacts(await caught.innerText(), scoreText)
  mark('score'); await page.waitForTimeout(5500)
  await finish({ ...fleetResult, roots, ...rootResult, ...scoreResult }, { fleet, root: rootText, score: scoreText },
    { configuration_sources: { roots: `${release.commit}:${sourcePath}#OG_ROOTS` } })
} finally { await r.browser.close() }
