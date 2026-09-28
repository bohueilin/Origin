/** Shared database admission; no per-isolate counters or raw IP persistence. */
interface AdmissionEnv { INSFORGE_BASE_URL?: string; INSFORGE_API_KEY?: string }
export type LeadAdmission = { allowed: true } | { allowed: false; status: 429 | 503; retryAfter: number }
const unavailable: LeadAdmission = { allowed: false, status: 503, retryAfter: 60 }

export async function admitLead(request: Request, env: AdmissionEnv): Promise<LeadAdmission> {
  // Pages supplies this edge header. Do not trust caller-selected X-Forwarded-For.
  const ip = request.headers.get('cf-connecting-ip')
  if (!ip || ip.length > 64 || !/^[\da-f:.]+$/i.test(ip) || !env.INSFORGE_BASE_URL || !env.INSFORGE_API_KEY) return unavailable
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.INSFORGE_API_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const hash = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`origin-lead-v1:${ip}`))
    const clientKey = [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('')
    const response = await fetch(`${env.INSFORGE_BASE_URL.replace(/\/+$/, '')}/api/database/rpc/admit_origin_lead`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.INSFORGE_API_KEY}` },
      body: JSON.stringify({ client_key: clientKey }), signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return unavailable
    const result = await response.json() as { allowed?: unknown; retry_after?: unknown }
    if (result.allowed === true && result.retry_after === 0) return { allowed: true }
    if (result.allowed === false && Number.isInteger(result.retry_after) && Number(result.retry_after) >= 1 && Number(result.retry_after) <= 600) {
      return { allowed: false, status: 429, retryAfter: Number(result.retry_after) }
    }
    return unavailable
  } catch { return unavailable }
}
