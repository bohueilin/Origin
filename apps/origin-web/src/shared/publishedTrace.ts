// The published TR-A002 trace, fetched from this site as a static file: /verify shows these exact
// bytes and verifies them in the tab. Nothing is sent but the GET itself. The shape check
// duplicates the one in /proof's tamper panel (src/proof/chain.ts), which keeps its own copy so
// that /proof stays within its accepted size (E01); change both together. Any failure throws, so a
// caller never shows a verdict for a file it could not load.
import type { EpisodeTrace } from '@origin/evidence/env-evidence'

/** The raw text and the parsed trace, checked against the file's own event_count. */
export async function loadPublishedTrace(): Promise<{ text: string; trace: EpisodeTrace }> {
  const response = await fetch('/proof/tr-a002.json')
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const text = await response.text()
  const trace: EpisodeTrace | null = JSON.parse(text)
  const count = trace?.event_count
  if (!trace || !Array.isArray(trace.events) || trace.events.length !== count
    || !/^[a-f0-9]{64}$/.test(trace.final_digest) || trace.events.some((event, i) => !event || event.seq !== i + 1))
    throw new Error('unexpected shape')
  return { text, trace }
}
