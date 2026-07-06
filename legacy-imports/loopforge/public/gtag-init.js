// Google Analytics 4 (gtag.js) bootstrap. Kept in an external, same-origin file so the
// strict Content-Security-Policy needs no script-src 'unsafe-inline'. The measurement ID
// is public by design. GA domains are allowlisted in public/_headers (script/connect/img-src).
window.dataLayer = window.dataLayer || []
function gtag() {
  dataLayer.push(arguments)
}

// Consent Mode v2 — deny storage by default for EEA / UK / Switzerland until the visitor
// opts in via the consent banner. Outside those regions GA behaves normally. The cookieless
// "denied" state still allows privacy-safe modeled pings; no cookies or ad data are used.
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  region: [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
    'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
    'IS', 'LI', 'NO', 'GB', 'CH',
  ],
  wait_for_update: 500,
})

// Restore a previously-granted choice before the first hit so returning EU visitors who
// already accepted are measured immediately.
try {
  if (window.localStorage.getItem('lf-consent-analytics') === 'granted') {
    gtag('consent', 'update', { analytics_storage: 'granted' })
  }
} catch (e) {
  /* localStorage unavailable — stay denied */
}

gtag('js', new Date())
gtag('config', 'G-E3G7Z5GG8K')
