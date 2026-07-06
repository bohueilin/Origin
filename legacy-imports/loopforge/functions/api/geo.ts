// Cloudflare Pages Function — GET /api/geo
// Returns the visitor's country (from Cloudflare's edge) and whether a cookie-consent
// banner is required for them (EEA + UK + Switzerland). No personal data is stored or
// logged; the country is derived at the edge and returned no-store.

const CONSENT_REGIONS = new Set([
  // EU 27
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // EEA (non-EU)
  'IS', 'LI', 'NO',
  // UK + Switzerland
  'GB', 'CH',
])

export async function onRequestGet(context: { request: Request }): Promise<Response> {
  const country = context.request.headers.get('CF-IPCountry') ?? 'XX'
  const consentRequired = CONSENT_REGIONS.has(country)
  return new Response(JSON.stringify({ country, consentRequired }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
