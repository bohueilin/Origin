import type { CaptureItem, CaptureManifest } from '../captureManifest'
import type { ParseFloorResponse } from '../foundry/types'
import type { FloorPlanParserResult } from './types'

function isFloorPlanImage(item: CaptureItem, file?: File): boolean {
  const type = (file?.type || item.type || '').toLowerCase()
  return item.role === 'floor_plan' && type.startsWith('image/')
}

function fallback(item: CaptureItem, reason: string): FloorPlanParserResult {
  return {
    itemId: item.id,
    ok: false,
    method: 'deterministic_fallback',
    source: 'unavailable',
    siteMap: null,
    repairs: [reason],
    model: null,
    confidence: 0.42,
    requiresReview: true,
    summary: `Generated fallback: ${reason}`,
    error: reason,
  }
}

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read floor-plan image.'))
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Floor-plan image did not produce a data URI.'))
    }
    reader.readAsDataURL(file)
  })
}

export async function parseFloorPlanWithFoundry(
  item: CaptureItem,
  file: File | undefined,
  manifest: CaptureManifest,
): Promise<FloorPlanParserResult> {
  if (!isFloorPlanImage(item, file)) {
    return fallback(item, 'No parseable floor-plan image was available.')
  }
  if (!file) return fallback(item, 'No local floor-plan file was available for parser upload.')
  if (import.meta.env.VITE_DISABLE_OPTIONAL_BACKEND_FETCHES === '1') {
    return fallback(item, 'Optional backend parser disabled in the local test runtime.')
  }
  if (typeof fetch !== 'function' || typeof FileReader === 'undefined') {
    return fallback(item, 'Browser parser bridge is unavailable in this runtime.')
  }

  try {
    const imageDataUri = await readAsDataUri(file)
    const res = await fetch('/api/foundry/parse-floor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        imageDataUri,
        hint: `${manifest.outcome}\n${manifest.description}`.slice(0, 600),
      }),
    })
    if (!res.ok) return fallback(item, `Foundry parser route returned HTTP ${res.status}.`)
    const data = (await res.json()) as ParseFloorResponse
    if (!data.ok || !data.siteMap) {
      return fallback(item, data.error || 'Foundry parser returned no site map.')
    }
    const isRealParser = data.source !== 'mock'
    return {
      itemId: item.id,
      ok: true,
      method: isRealParser ? 'parser' : 'deterministic_fallback',
      source: data.source,
      siteMap: data.siteMap,
      repairs: data.repairs ?? [],
      model: data.model ?? null,
      confidence: isRealParser ? 0.84 : 0.52,
      requiresReview: true,
      summary: isRealParser
        ? `Parsed from floor plan by ${data.model}.`
        : `Foundry fallback map used: ${(data.repairs ?? ['mock parser fallback'])[0]}`,
    }
  } catch (error) {
    return fallback(item, error instanceof Error ? error.message : 'Foundry parser call failed.')
  }
}

export function deterministicParserFallback(item: CaptureItem): FloorPlanParserResult {
  return fallback(item, 'No backend parser call was attempted.')
}
