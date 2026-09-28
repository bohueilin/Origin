// One continuous live /verify take; only the blank lead may be trimmed.
import { openRecording, requireVerdict } from './recLib.mjs'
const r = await openRecording('shot01', '/verify')
const { page, context, probe, mark, clickAt, settle, finish } = r
try {
  const example = await probe('example', page.getByRole('button', { name: 'Origin Attestation', exact: true }))
  const verify = await probe('verify', page.getByRole('button', { name: 'Verify', exact: true }))
  const tamper = await probe('tamper', page.locator('label.vfy-toggle'))
  await clickAt(example)
  await page.waitForFunction(() => document.querySelector('#vfy-artifact')?.value.includes('payload_digest'))
  if (/license_level|rsl_level/.test(await page.locator('#vfy-artifact').inputValue())) throw new Error('Demo contains a readiness field')
  mark('load'); await page.waitForTimeout(3500)
  const read = async expected => {
    await clickAt(verify)
    const verdict = await probe('verdict', page.locator('.vfy-verdict'))
    await verdict.locator('b').filter({ hasText: new RegExp(`^${expected}$`) }).waitFor()
    await settle(verdict)
    return verdict.innerText()
  }
  const valid = await read('VALID'); requireVerdict(valid, 'VALID', 0)
  mark('verify'); await page.waitForTimeout(3500)
  await context.setOffline(true); mark('offline'); await page.waitForTimeout(4500)
  await clickAt(tamper)
  const tampered = await read('VOID'); requireVerdict(tampered, 'VOID', 1)
  mark('tamper-verify'); await page.waitForTimeout(4500)
  await clickAt(tamper)
  const restored = await read('VALID'); requireVerdict(restored, 'VALID', 0)
  mark('restore'); await page.waitForTimeout(4500)
  await finish({ valid_code: 0, tamper_code: 1, restored_code: 0 }, { valid, tampered, restored }, { network_off_from: 'offline' })
} finally { await r.browser.close() }
