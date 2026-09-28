// Selected policy → signed download → legacy drift → real clipboard paste.
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { openRecording, policyFacts } from './recLib.mjs'
const r = await openRecording('shot04', '/reference-check')
const { page, context, out, probe, mark, clickAt, settle, finish } = r
try {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://originphysicalai.com' })
  const run = await probe('run', page.getByRole('button', { name: 'Run the reference check', exact: true }))
  await settle(run); mark('intro'); await page.waitForTimeout(3500)
  await clickAt(run)
  const verdict = await probe('policy verdict', page.locator('.rc-verdict'))
  await settle(verdict)
  const verdictText = await verdict.innerText()
  const counts = policyFacts(verdictText)
  mark('run'); await page.waitForTimeout(4500)
  const download = await probe('download', page.getByRole('button', { name: 'Download signed policy-evaluation evidence', exact: true }))
  const pending = page.waitForEvent('download')
  await clickAt(download)
  const downloaded = await pending, file = `${out}/${downloaded.suggestedFilename()}`
  await downloaded.saveAs(file)
  const evidence = await fs.readFile(file, 'utf8'), digest = createHash('sha256').update(evidence).digest('hex')
  mark('download'); await page.waitForTimeout(3500)
  await clickAt(await probe('drift', page.getByRole('button', { name: /^Change a tool/ })))
  const drift = await probe('drift result', page.locator('.rc-output [role="alert"]'))
  await settle(drift)
  const driftText = await drift.innerText()
  if (!/VOID/.test(driftText) || !/code 4/.test(driftText)) throw new Error(`Unexpected legacy drift: ${driftText}`)
  const tool = await drift.locator('code').innerText()
  const code = Number(driftText.match(/code (\d+)/)[1])
  mark('drift'); await page.waitForTimeout(5500)
  // The already downloaded bytes remain unchanged; drifting the legacy credential
  // does not mutate the separate policy-evaluation envelope.
  if (createHash('sha256').update(await fs.readFile(file)).digest('hex') !== digest) throw new Error('Downloaded evidence changed')
  await clickAt(await probe('verify link', page.getByRole('link', { name: /^Re-verify it on \/verify/ })))
  await page.waitForLoadState('networkidle')
  const input = await probe('artifact', page.locator('#vfy-artifact'))
  await page.evaluate(text => navigator.clipboard.writeText(text), evidence)
  await clickAt(input); await page.keyboard.press('ControlOrMeta+V')
  if (await input.inputValue() !== evidence) throw new Error('Clipboard paste differs from download')
  mark('paste'); await page.waitForTimeout(2500)
  await clickAt(await probe('verify', page.getByRole('button', { name: 'Verify', exact: true })))
  const reverify = await probe('re-verification', page.locator('.vfy-verdict'))
  await reverify.locator('b').filter({ hasText: /^UNTRUSTED$/ }).waitFor()
  await settle(reverify)
  const reverifyText = await reverify.innerText()
  mark('reverify'); await page.waitForTimeout(5500)
  await finish({ ...counts, tool, code },
    { verdict: verdictText, drift: driftText, reverify: reverifyText }, { download: downloaded.suggestedFilename(), download_sha256: digest, clipboard_matches_download: true })
} finally { await r.browser.close() }
