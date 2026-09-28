import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkMediaCopy } from './lib/media-copy.mjs'

const sample = { cards: [{ out: 'og/verify.jpg', h1: 'Recompute the artifact in your browser.' }], cover: '<p>Synthetic reference-check demo</p>', captions: [{ file: 'shot01.json', data: { captions: [{ text: 'Artifact integrity is not signer identity.' }] } }] }

test('a banned phrase in a nested caption fails with its file and field', () => {
  const input = structuredClone(sample)
  input.captions[0].data.captions[0].text = 'This guarantees security.'
  const findings = checkMediaCopy(input)
  assert.equal(findings.length, 1)
  assert.match(findings[0].surface, /shot01.json.*captions.*text/)
  assert.match(findings[0].match, /guarantees security/)
})
test('a banned card headline fails even when it is absent from served HTML', () => {
  const input = structuredClone(sample)
  input.cards[0].h1 = 'It is unhackable.'
  const findings = checkMediaCopy(input)
  assert.equal(findings.length, 1)
  assert.match(findings[0].surface, /og\/verify.jpg.*h1/)
  assert.equal(findings[0].match, 'unhackable')
})
test('rendered cover text is scanned through markup and entities', () => {
  const input = { ...sample, cover: '<p>It is provably&nbsp;<b>safe</b>.</p>' }
  const findings = checkMediaCopy(input)
  assert.equal(findings.length, 1)
  assert.match(findings[0].surface, /og-cover.html/)
})
test('scoped media copy stays allowed and code comments stay out of cover prose', () => {
  assert.deepEqual(checkMediaCopy({ ...sample, cover: '<!-- unhackable --><p>Reproducible under this verifier.</p>' }), [])
})
