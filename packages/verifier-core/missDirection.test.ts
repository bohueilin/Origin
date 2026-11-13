import { describe, it, expect } from 'vitest'
import { missDirection } from './missDirection.mjs'

describe('missDirection — allow < escalate < deny', () => {
  it.each([
    ['allow', 'allow', null],
    ['allow', 'escalate', 'looser'],
    ['allow', 'deny', 'looser'],
    ['escalate', 'allow', 'stricter'],
    ['escalate', 'escalate', null],
    ['escalate', 'deny', 'looser'],
    ['deny', 'allow', 'stricter'],
    ['deny', 'escalate', 'stricter'],
    ['deny', 'deny', null],
  ] as const)('policy %s vs oracle %s → %s', (decision, expected, direction) => {
    expect(missDirection(decision, expected)).toBe(direction)
  })

  it('throws on a decision outside the three', () => {
    // @ts-expect-error — deliberately outside the declared domain
    expect(() => missDirection('approve', 'deny')).toThrow(TypeError)
    // @ts-expect-error — deliberately outside the declared domain
    expect(() => missDirection('deny', undefined)).toThrow(TypeError)
  })
})
