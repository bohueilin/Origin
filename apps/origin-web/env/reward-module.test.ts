import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeLicenseFromVerdicts } from '../src/license.ts'
import { verifyEpisode } from '@origin/evidence/env-evidence'
import { scoreReward, scoreDeterministic, classifyHack, clampShaper } from './reward-module.ts'
import { goldSuite, exploitSuite } from './exploit-suite.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const load = (p: string) => JSON.parse(readFileSync(resolve(HERE, '../docs/examples', p), 'utf8'))
const scoreFn = (task, actions) => scoreReward(task, actions, { policy: 'test' })
const licenseFn = (v) => computeLicenseFromVerdicts(v).level.id

describe('reward module (P5) — deterministic core + reward-hack mitigations', () => {
  it('the clamp shaper maps NaN/Infinity → 0 and clamps to [0,1]', () => {
    expect(clampShaper(NaN)).toBe(0)
    expect(clampShaper(Infinity)).toBe(0)
    expect(clampShaper(-1)).toBe(0)
    expect(clampShaper(1.5)).toBe(1)
    expect(clampShaper(0.7)).toBe(0.7)
  })

  it('every EXPLOIT is driven to patched_reward 0 and flagged is_hack (right cluster)', () => {
    for (const c of exploitSuite()) {
      const r = scoreReward(c.task, c.actions, { policy: 'test' })
      expect(r.patched_reward, c.id).toBe(0)
      expect(r.reward, c.id).toBe(0)
      expect(r.is_hack, c.id).toBe(true)
      expect(r.exploit_cluster, c.id).toBe(c.cluster)
    }
  })

  it('every GOLD case earns reward > 0 and is not a hack', () => {
    for (const c of goldSuite()) {
      const r = scoreReward(c.task, c.actions, { policy: 'test' })
      expect(r.reward, c.id).toBeGreaterThan(0)
      expect(r.is_hack, c.id).toBe(false)
      expect(r.exploit_cluster, c.id).toBe('none')
    }
  })

  it('a hostile post-gate judge cannot rescue a hard-gated 0', () => {
    const c = exploitSuite()[0]
    // judges returning out-of-range / NaN / Infinity are all clamped, then multiply a 0.
    for (const evil of [() => 1000, () => 1.5, () => NaN, () => Infinity, () => -5]) {
      expect(scoreReward(c.task, c.actions, { policy: 'test', judge: evil }).reward).toBe(0)
    }
  })

  it('a judge can only SHAPE DOWN a passing reward, never above the gated value', () => {
    const c = goldSuite()[0]
    const base = scoreReward(c.task, c.actions).reward
    const shaped = scoreReward(c.task, c.actions, { judge: () => 0.5 }).reward
    expect(shaped).toBeCloseTo(base * 0.5, 5)
    // even an over-unity judge is clamped to 1 → cannot exceed the gated reward
    expect(scoreReward(c.task, c.actions, { judge: () => 99 }).reward).toBe(base)
  })

  it('without a judge, scoreReward.reward equals the deterministic core reward', () => {
    for (const c of [...goldSuite(), ...exploitSuite()]) {
      expect(scoreReward(c.task, c.actions).reward).toBe(scoreDeterministic(c.task, c.actions).reward)
    }
  })

  it('classifyHack: raw claim reward > patched only when a terminal was not earned', () => {
    const gold = scoreDeterministic(goldSuite()[0].task, goldSuite()[0].actions)
    expect(classifyHack(gold).is_hack).toBe(false)
    expect(classifyHack(gold).raw_reward).toBe(classifyHack(gold).patched_reward)
  })
})

describe('P5 receipts carry is_hack and reproduce under env:verify', () => {
  it('the committed GOLD trio verifies (exit 0) and its receipt is is_hack=false', () => {
    const bundle = load('warehouse.env-bundle.lock.json')
    const episode = load('warehouse-smoke.episode.json')
    const receipt = load('warehouse-smoke.score-receipt.json')
    expect(receipt.is_hack).toBe(false)
    expect(verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn }).code).toBe(0)
  })

  it('the committed REWARD-HACKER trio verifies (exit 0) and its receipt is is_hack=true', () => {
    const bundle = load('warehouse.env-bundle.lock.json')
    const episode = load('warehouse-hack.episode.json')
    const receipt = load('warehouse-hack.score-receipt.json')
    expect(receipt.is_hack).toBe(true)
    expect(receipt.reward).toBe(0)
    expect(receipt.exploit_cluster).toBe('hardcode_outputs')
    // a reward-hacking episode is STILL reproducible — reproducibility is not endorsement.
    expect(verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn }).code).toBe(0)
  })
})
