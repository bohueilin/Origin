// Client seam for the Discord group message. The browser only passes the time/place;
// the server composes the actual content and holds the webhook URL.

import { api } from './apiBase.ts'

export interface DiscordSendResult {
  ok: boolean
  simulated: boolean
  channel: string
  preview: string
  error?: string
}

export async function sendDiscordMessage(input: { time?: string; place?: string }): Promise<DiscordSendResult> {
  try {
    const r = await fetch(api('/api/passport/discord/send'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    return (await r.json()) as DiscordSendResult
  } catch {
    return { ok: false, simulated: false, channel: 'Game Night', preview: '', error: 'Network error reaching Discord.' }
  }
}
