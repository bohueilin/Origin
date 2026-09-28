import test from 'node:test'
import assert from 'node:assert/strict'
import * as contract from './recLib.mjs'

test('recordings reject a preview, missing release fields, or failing gates', () => {
  const release = { source: 'release', commit: 'abc1234', built_at: '2026-09-28T06:00:00Z', run_url: 'https://github.com/bohueilin/Origin/actions/runs/1', all_green: true }
  assert.doesNotThrow(() => contract.requireRelease(release))
  for (const field of ['source', 'commit', 'built_at', 'run_url', 'all_green']) {
    const incomplete = { ...release }; delete incomplete[field]
    assert.throws(() => contract.requireRelease(incomplete), /release/)
  }
  assert.throws(() => contract.requireRelease({ ...release, source: 'preview' }), /release/)
  assert.throws(() => contract.requireRelease({ ...release, commit: '--help' }), /release/)
  assert.throws(() => contract.requireRelease(release, 'def5678'), /release/)
})

test('verdict checks distinguish VALID from INVALID and require the exact code', () => {
  assert.deepEqual(contract.requireVerdict('VALID\nOrigin Attestation · code 0', 'VALID', 0), { verdict: 'VALID', code: 0 })
  assert.throws(() => contract.requireVerdict('INVALID · code 0', 'VALID', 0))
  assert.throws(() => contract.requireVerdict('VOID · code 4', 'VOID', 1))
})

test('fleet facts are read from the observed run, including comma-separated identities', () => {
  assert.deepEqual(contract.fleetFacts('2,074 SYNTHETIC agent identities · 1674 delegation edges · 8400 tool-call events · seed 20260818', '63.2% over-grant surface'), { identities: 2074, seed: 20260818, surface: '63.2' })
  assert.throws(() => contract.fleetFacts('No fleet', '63.2%'))
})

test('root widening must produce an observed increase', () => {
  assert.deepEqual(contract.rootFacts('blast radius at the ROOT 11.1% → 22.2%'), { before: '11.1', after: '22.2' })
  assert.throws(() => contract.rootFacts('blast radius at the ROOT 22.2% → 11.1%'))
})

test('policy counts tolerate the verdict display line break and require a full match', () => {
  assert.deepEqual(contract.policyFacts('12 of 12\nsynthetic decisions match the oracle\nunbounded baseline 33%'), { matched: 12, n: 12 })
  assert.throws(() => contract.policyFacts('11 of 12\nsynthetic decisions match the oracle'))
})

test('planted-corpus facts stay separate and require full recovery without false positives', () => {
  assert.deepEqual(contract.scoreFacts('caught 90/90', 'every planted violation recovered, zero false positives'), { caught: 90, planted: 90, fp: 0 })
  assert.throws(() => contract.scoreFacts('caught 89/90', 'zero false positives'))
  assert.throws(() => contract.scoreFacts('caught 90/90', '1 false positives'))
})
