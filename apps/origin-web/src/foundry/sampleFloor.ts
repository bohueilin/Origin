import type { DescriptiveSiteMap } from '../workflowDraft'
import type { ParseFloorResponse } from './types'

export function sampleFloorMap(): DescriptiveSiteMap {
  return {
    width: 10, height: 10, start: { x: 5, y: 9 }, item: { x: 2, y: 5 }, drop: { x: 7, y: 5 },
    obstacles: [{ x: 1, y: 2 }, { x: 8, y: 7 }], hazards: [{ x: 4, y: 5 }, { x: 5, y: 5 }], humanOnly: [{ x: 6, y: 2 }], robots: [],
  }
}

/** Browser-safe, deterministic local sample. It performs no network or provider work. */
export function sampleFloorResponse(model = 'gemma-4-31b'): ParseFloorResponse {
  return { ok: true, siteMap: sampleFloorMap(), source: 'mock', timing: null, repairs: ['Sample floor — nothing was parsed. No image left this browser.'], model, fallback: 'no_image' }
}
