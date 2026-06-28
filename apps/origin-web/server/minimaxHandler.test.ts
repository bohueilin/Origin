import { describe, expect, it } from 'vitest'
import { extractJson, handleVoiceStructure, normalizeVoiceFields } from './minimaxHandler.ts'

describe('minimax voice structuring (pure)', () => {
  it('extracts JSON from fenced or chatty model output', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(extractJson('Sure! {"a":1} done')).toBe('{"a":1}')
    expect(extractJson('{"a":1}')).toBe('{"a":1}')
  })

  it('clamps enums to valid values and keeps usable content', () => {
    const fields = normalizeVoiceFields({
      outcome: 'move totes safely',
      description: 'dad carries a tote to packing',
      safetyRules: ['never enter operator-only cells', '', 'escalate if a forklift blocks the lane'],
      domain: 'spaceport', // invalid -> default
      embodiment: 'carrier',
    })
    expect(fields).not.toBeNull()
    expect(fields!.domain).toBe('manufacturing') // coerced from invalid
    expect(fields!.embodiment).toBe('carrier')
    expect(fields!.safetyRules).toEqual([
      'never enter operator-only cells',
      'escalate if a forklift blocks the lane',
    ])
  })

  it('splits a newline string of safety rules and rejects empty content', () => {
    const f = normalizeVoiceFields({ outcome: 'x', safetyRules: 'a\n\nb' })
    expect(f!.safetyRules).toEqual(['a', 'b'])
    // No outcome/description/rules at all -> not usable.
    expect(normalizeVoiceFields({ domain: 'hospital', embodiment: 'dog' })).toBeNull()
  })

  it('rejects an empty transcript and reports a missing key (graceful fallback path)', async () => {
    const bad = await handleVoiceStructure({ transcript: ' ' }, {})
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.code).toBe('bad_request')

    const noKey = await handleVoiceStructure({ transcript: 'a robot for my dad’s factory' }, {})
    expect(noKey.ok).toBe(false)
    if (!noKey.ok) expect(noKey.code).toBe('no_key')
  })
})
