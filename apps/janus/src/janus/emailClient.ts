// Client seam for the journey-summary email. The browser passes the request + results;
// the server composes the email and sends it to the user's own (server-configured) address.

import { api } from './apiBase.ts'

export interface EmailResult {
  ok: boolean
  sent: boolean
  to: string
  preview: string
  error?: string
}

export async function sendJourneySummary(input: {
  scenario: string
  request: string
  results: { head: string; detail: string }[]
}): Promise<EmailResult> {
  try {
    const r = await fetch(api('/api/janus/email/summary'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    return (await r.json()) as EmailResult
  } catch {
    return { ok: false, sent: false, to: 'your email', preview: '', error: 'Network error reaching the email service.' }
  }
}
