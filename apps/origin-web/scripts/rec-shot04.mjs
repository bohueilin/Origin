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
  // The link carries the record in its fragment and fills the field: it must hold the
  // downloaded bytes. Clear the field and require it empty, so the value after the paste can
  // only come from the clipboard; the edit also drops the page's shared-link note.
  const linkMatches = await input.inputValue() === evidence
  if (!linkMatches) throw new Error('The /verify link carries a different record than the download')
  await page.evaluate(text => navigator.clipboard.writeText(text), evidence)
  await clickAt(input); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('Backspace')
  if (await input.inputValue() !== '') throw new Error('Could not clear the linked record before pasting')
  await page.keyboard.press('ControlOrMeta+V')
  const clipboardMatches = await input.inputValue() === evidence
  if (!clipboardMatches) throw new Error('Clipboard paste differs from download')
  await page.locator('.vfy-note', { hasText: 'Loaded from a shared link' }).waitFor({ state: 'detached', timeout: 2000 })
  mark('paste'); await page.waitForTimeout(2500)
  await clickAt(await probe('verify', page.getByRole('button', { name: 'Verify', exact: true })))
  const reverify = await probe('re-verification', page.locator('.vfy-verdict'))
  await reverify.locator('b').filter({ hasText: /^UNTRUSTED$/ }).waitFor()
  await settle(reverify)
  const reverifyText = await reverify.innerText()
  mark('reverify'); await page.waitForTimeout(5500)
  await finish({ ...counts, tool, code },
    { verdict: verdictText, drift: driftText, reverify: reverifyText }, { download: downloaded.suggestedFilename(), download_sha256: digest, link_matches_download: linkMatches, clipboard_matches_download: clipboardMatches })
} finally { await r.browser.close() }
