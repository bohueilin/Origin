// Thin client for the Foundry routes. Uses a relative base by default (the Vite dev
// server proxies /api to the Hono backend; in prod set VITE_FOUNDRY_API_BASE to the
// deployed backend origin). No secrets here — the Cerebras key lives server-side only.

import type { ParseFloorResponse, QuorumRunResponse, SpeedRaceResponse, QuorumMode } from './types'
import type { DescriptiveSiteMap } from '../workflowDraft'

const BASE = (import.meta.env.VITE_FOUNDRY_API_BASE as string | undefined)?.replace(/\/+$/, '') ?? ''

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await res.json()) as T
}

export const parseFloor = (input: { imageDataUri?: string; hint?: string }) =>
  postJson<ParseFloorResponse>('/api/foundry/parse-floor', input)

export const quorumRun = (input: { siteMap: DescriptiveSiteMap; embodiment?: string; mode: QuorumMode }) =>
  postJson<QuorumRunResponse>('/api/foundry/quorum-run', input)

export const speedRace = (input: { prompt?: string } = {}) =>
  postJson<SpeedRaceResponse>('/api/foundry/speed-race', input)

/** Cerebras caps images at ~10MB/request; reject oversize uploads client-side too. */
export const MAX_IMAGE_BYTES = 7_000_000

/** Read a File (the uploaded floor image) into a base64 data URI — Cerebras requires data URIs, not hosted URLs. */
export function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_IMAGE_BYTES) {
      reject(new Error(`Image is ${(file.size / 1e6).toFixed(1)}MB — please use one under ${MAX_IMAGE_BYTES / 1e6}MB.`))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
