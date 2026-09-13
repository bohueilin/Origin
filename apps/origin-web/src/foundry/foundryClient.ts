// Thin client for the Foundry routes. Uses a relative base by default (the Vite dev
// server proxies /api to the Hono backend; in prod set VITE_FOUNDRY_API_BASE to the
// deployed backend origin). No secrets here — the Cerebras key lives server-side only.

import type { ParseFloorResponse, QuorumRunResponse, SpeedRaceResponse, QuorumMode } from './types'
import type { DescriptiveSiteMap } from '../workflowDraft'
import { sampleFloorResponse } from './sampleFloor'

export type FoundryCapabilities = { sampleFloor: true; browserExternalParse: boolean; browserQuorum: boolean; browserSpeed: boolean; mode: 'pages-public' | 'local-backend-demo' }

export function capabilitiesForApiBase(base: string, localBackendDemo = false): FoundryCapabilities {
  let loopback = false
  try { const u = new URL(base); loopback = u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]') } catch { /* relative/public base */ }
  const enabled = localBackendDemo && loopback
  return { sampleFloor: true, browserExternalParse: enabled, browserQuorum: enabled, browserSpeed: enabled, mode: enabled ? 'local-backend-demo' : 'pages-public' }
}

const BASE = (import.meta.env.VITE_FOUNDRY_API_BASE as string | undefined)?.replace(/\/+$/, '') ?? ''
const LOCAL_BACKEND_DEMO = import.meta.env.DEV && import.meta.env.VITE_FOUNDRY_LOCAL_BACKEND_DEMO === 'true'
export const foundryCapabilities = capabilitiesForApiBase(BASE, LOCAL_BACKEND_DEMO)
export { sampleFloorResponse }

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Foundry backend unreachable — start it with `npm run server` (port 8787), then retry.')
  }
  if (!res.ok) {
    throw new Error(`Foundry backend returned ${res.status}. Is the Hono server running (npm run server)?`)
  }
  try {
    return (await res.json()) as T
  } catch {
    throw new Error('Foundry backend sent a non-JSON response — check the server logs.')
  }
}

export const parseFloor = (input: { imageDataUri?: string; hint?: string; uploadConsent?: boolean }) => {
  if (!input.imageDataUri) return Promise.resolve(sampleFloorResponse())
  if (!foundryCapabilities.browserExternalParse) return Promise.reject(new Error('External parsing is local/backend demo only.'))
  return postJson<ParseFloorResponse>('/api/foundry/parse-floor', input)
}

export const quorumRun = (input: { siteMap: DescriptiveSiteMap; embodiment?: string; mode: QuorumMode }) =>
  foundryCapabilities.browserQuorum ? postJson<QuorumRunResponse>('/api/foundry/quorum-run', input) : Promise.reject(new Error('Quorum is local/backend demo only.'))

export const speedRace = (input: { prompt?: string } = {}) =>
  foundryCapabilities.browserSpeed ? postJson<SpeedRaceResponse>('/api/foundry/speed-race', input) : Promise.reject(new Error('Speed race is local/backend demo only.'))

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
