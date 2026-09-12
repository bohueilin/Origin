import { describe, expect, it } from 'vitest'
import { capabilitiesForApiBase, sampleFloorResponse } from './foundryClient.ts'

describe('Foundry browser authority', () => {
  it('keeps public relative and HTTPS topology non-authoritative', () => {
    const expected = { sampleFloor: true, browserExternalParse: false, browserQuorum: false, browserSpeed: false, mode: 'pages-public' }
    expect(capabilitiesForApiBase('')).toEqual(expected)
    expect(capabilitiesForApiBase('https://backend.example')).toEqual(expected)
    expect(capabilitiesForApiBase('http://localhost:8787')).toEqual(expected)
  })
  it('allows only explicit loopback local-demo transport', () => {
    expect(capabilitiesForApiBase('http://localhost:8787', true).mode).toBe('local-backend-demo')
    expect(capabilitiesForApiBase('https://localhost:8787', true).browserExternalParse).toBe(false)
  })
  it('returns a deterministic labeled sample without a fetch path', () => {
    const sample = sampleFloorResponse()
    expect(sample.source).toBe('mock')
    expect(sample.fallback).toBe('no_image')
    expect(sample.repairs.join(' ')).toMatch(/nothing was parsed/i)
  })
})
