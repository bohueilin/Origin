// Operator integration probe. Mutates only a random synthetic rate counter;
// never submits a lead, stores form data, or sends a notification.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'

const fileIndex = process.argv.indexOf('--project-file')
const config = fileIndex >= 0 ? JSON.parse(fs.readFileSync(process.argv[fileIndex + 1], 'utf8')) : null
const host = config?.oss_host || process.env.INSFORGE_BASE_URL
const apiKey = config?.api_key || process.env.INSFORGE_API_KEY
assert(host && apiKey, 'Provide server environment credentials or --project-file; never put credentials in arguments')
const base = new URL(host.startsWith('http') ? host : `https://${host}`)
assert.equal(base.protocol, 'https:')
const clientKey = randomBytes(32).toString('hex')
const call = async (token = apiKey, payload = { client_key: clientKey }) => {
  const response = await fetch(new URL('/api/database/rpc/admit_origin_lead', base), {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
  })
  return { status: response.status, data: await response.json() }
}
const results = await Promise.all(Array.from({ length: 10 }, () => call()))
assert(results.every(r => r.status === 200), 'Admission RPC did not return successful responses')
assert.equal(results.filter(r => r.data.allowed === true).length, 3)
assert.equal(results.filter(r => r.data.allowed === false).length, 7)
assert(results.filter(r => !r.data.allowed).every(r => Number.isInteger(r.data.retry_after) && r.data.retry_after >= 1 && r.data.retry_after <= 600))
assert((await call('')).status >= 400, 'Unauthenticated RPC must be rejected')
assert((await call(undefined, { client_key: 'bad' })).status >= 400, 'Malformed counter keys must be rejected')
console.log('Shared lead admission: 10 concurrent probes, 3 allowed / 7 denied; bounded retry, unauthenticated and malformed-key rejection passed. No leads or notifications created.')
