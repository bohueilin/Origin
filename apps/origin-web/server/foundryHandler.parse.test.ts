// handleParseFloor wiring — behavioral spec, written BEFORE the rewire (TDD).
//
// The contract under test:
//   * No image at all      → demo mode: a LABELED sample floor (fallback 'no_image').
//   * Image uploaded, then anything fails (no key / oversize / API error / bad
//     JSON) → the parse is REFUSED: ok:false, siteMap:null, an explicit fallback
//     reason. A sample floor never impersonates a parse of the user's upload.
//   * Model JSON arrives   → parseGate decides. VOID → siteMap:null + the gate's
//     named checks. VALID/ESCALATE → the cleaned map + gate receipt + oracle.

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./cerebrasHandler.ts', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./cerebrasHandler.ts')>()
  return { ...mod, cerebrasChat: vi.fn() }
})

import { cerebrasChat, type ChatResult } from './cerebrasHandler.ts'
import { handleParseFloor } from './foundryHandler.ts'
import type { CerebrasConfig } from './config.ts'

const chat = vi.mocked(cerebrasChat)
const cfg: CerebrasConfig = { apiKey: 'test-key', model: 'gemma-4-31b', baseUrl: 'https://example.test/v1' }
const cfgNoKey: CerebrasConfig = { model: 'gemma-4-31b', baseUrl: 'https://example.test/v1' }
const IMG = 'data:image/png;base64,AAAA'

const timing = { tokS: 1400, ttftMs: 80, completionTokens: 200, totalMs: 300 }
const reply = (content: string): ChatResult => ({ ok: true, content, model: 'gemma-4-31b', source: 'cerebras', timing })

const cleanGrid = {
  width: 8,
  height: 8,
  start: { x: 4, y: 7 },
  item: { x: 1, y: 3 },
  drop: { x: 6, y: 3 },
  obstacles: [{ x: 2, y: 2 }],
  hazards: [{ x: 3, y: 4 }],
  humanOnly: [],
}

beforeEach(() => {
  chat.mockReset()
})

describe('handleParseFloor — demo mode (no image)', () => {
  it('returns a labeled sample floor without calling the model', async () => {
    const res = await handleParseFloor({}, cfg)
    expect(res.ok).toBe(true)
    expect(res.source).toBe('mock')
    expect(res.fallback).toBe('no_image')
    expect(res.siteMap).not.toBeNull()
    expect(['finish', 'refuse', 'escalate']).toContain(res.oracle?.verdict)
    expect(chat).not.toHaveBeenCalled()
  })
})

describe('handleParseFloor — an uploaded image is never answered with a fake parse', () => {
  it('refuses when the key is missing: no siteMap, explicit reason', async () => {
    const res = await handleParseFloor({ imageDataUri: IMG }, cfgNoKey)
    expect(res.ok).toBe(false)
    expect(res.siteMap).toBeNull()
    expect(res.fallback).toBe('no_key')
    expect(res.error).toMatch(/CEREBRAS_API_KEY/)
    expect(chat).not.toHaveBeenCalled()
  })

  it('refuses a non-image "imageDataUri" — the endpoint must not relay arbitrary URLs to the model provider', async () => {
    for (const uri of ['https://internal.example/secret.png', 'data:text/html;base64,AAAA', 'file:///etc/passwd', 'data:image/svg+xml;base64,AAAA']) {
      const res = await handleParseFloor({ imageDataUri: uri }, cfg)
      expect(res.ok).toBe(false)
      expect(res.fallback).toBe('bad_image')
      expect(res.siteMap).toBeNull()
    }
    expect(chat).not.toHaveBeenCalled()
  })

  it('refuses an oversize upload before spending a request', async () => {
    const res = await handleParseFloor({ imageDataUri: `data:image/png;base64,${'A'.repeat(10_000_001)}` }, cfg)
    expect(res.ok).toBe(false)
    expect(res.siteMap).toBeNull()
    expect(res.fallback).toBe('oversize')
    expect(chat).not.toHaveBeenCalled()
  })

  it('refuses on an API error instead of substituting the sample', async () => {
    chat.mockResolvedValue({ ok: false, content: '', model: 'gemma-4-31b', source: 'cerebras', timing: null, code: 'upstream', error: 'boom' })
    const res = await handleParseFloor({ imageDataUri: IMG }, cfg)
    expect(res.ok).toBe(false)
    expect(res.siteMap).toBeNull()
    expect(res.fallback).toBe('api_error')
  })

  it('refuses non-JSON model output — voided, not repaired', async () => {
    chat.mockResolvedValue(reply('the floor looks nice'))
    const res = await handleParseFloor({ imageDataUri: IMG }, cfg)
    expect(res.ok).toBe(false)
    expect(res.siteMap).toBeNull()
    expect(res.fallback).toBe('bad_json')
  })
})

describe('handleParseFloor — the gate judges real model output', () => {
  it('VOID: an out-of-bounds dock yields no map and the failing check by name', async () => {
    chat.mockResolvedValue(reply(JSON.stringify({ ...cleanGrid, start: { x: 99, y: 0 } })))
    const res = await handleParseFloor({ imageDataUri: IMG }, cfg)
    expect(res.ok).toBe(true) // the endpoint did its job: it gated
    expect(res.source).toBe('cerebras')
    expect(res.siteMap).toBeNull()
    expect(res.gate?.verdict).toBe('VOID')
    expect(res.gate?.code).toBe(2)
    expect(res.gate?.checks.some((c) => c.name === 'anchors_in_bounds' && !c.pass)).toBe(true)
    expect(res.oracle).toBeUndefined()
  })

  it('VALID: a clean grid comes back with the map, the gate receipt, and an oracle verdict', async () => {
    chat.mockResolvedValue(reply(JSON.stringify(cleanGrid)))
    const res = await handleParseFloor({ imageDataUri: IMG }, cfg)
    expect(res.ok).toBe(true)
    expect(res.siteMap).not.toBeNull()
    expect(res.gate?.verdict).toBe('VALID')
    expect(res.gate?.receipt.receipt_digest).toMatch(/^[0-9a-f]{64}$/)
    expect(['finish', 'refuse', 'escalate']).toContain(res.oracle?.verdict)
  })

  it('the parse call keeps reasoning OFF with budget for a full grid (live outage regression)', async () => {
    // First live run with a real key: reasoningEffort 'low' turned Gemma's
    // reasoning ON, which consumed the entire 1200-token budget before ONE
    // content byte — finish_reason 'length', empty content, every real parse
    // died as bad_json. A perception readout under a forced JSON schema needs
    // no reasoning; it needs output budget (a 16x16 grid's cell list alone can
    // pass 1500 tokens).
    chat.mockResolvedValue(reply(JSON.stringify(cleanGrid)))
    await handleParseFloor({ imageDataUri: IMG }, cfg)
    const opts = chat.mock.calls[0][2] as { reasoningEffort?: string; maxTokens?: number }
    expect(opts.reasoningEffort).toBe('none')
    expect(opts.maxTokens).toBeGreaterThanOrEqual(2500)
  })

  it('real parses carry the RAW model proposal so the receipt binding re-verifies offline', async () => {
    chat.mockResolvedValue(reply(JSON.stringify(cleanGrid)))
    const valid = await handleParseFloor({ imageDataUri: IMG }, cfg)
    expect(valid.rawProposal).toEqual(cleanGrid) // input_digest is computed over exactly this
    chat.mockResolvedValue(reply(JSON.stringify({ ...cleanGrid, start: { x: 99, y: 0 } })))
    const voided = await handleParseFloor({ imageDataUri: IMG }, cfg)
    expect(voided.rawProposal).toEqual({ ...cleanGrid, start: { x: 99, y: 0 } })
    // demo mode has no model proposal — nothing to bind
    const demo = await handleParseFloor({}, cfg)
    expect(demo.rawProposal).toBeUndefined()
  })

  it('ESCALATE: a contradictory proposal returns the cleaned map flagged for review', async () => {
    const contradictory = { ...cleanGrid, obstacles: [{ x: 2, y: 2 }, cleanGrid.start, cleanGrid.item, cleanGrid.drop] }
    chat.mockResolvedValue(reply(JSON.stringify(contradictory)))
    const res = await handleParseFloor({ imageDataUri: IMG }, cfg)
    expect(res.ok).toBe(true)
    expect(res.siteMap).not.toBeNull()
    expect(res.gate?.verdict).toBe('ESCALATE')
    expect(res.repairs.join(' ')).toMatch(/anchor/i)
  })
})
