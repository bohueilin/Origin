// Rule-of-Two conformance: the edge function's copy must agree with the canonical module.
//
// WHY A TEXT-EXTRACTION TEST. functions/credential-broker.ts deploys via
// `npx @insforge/cli functions deploy --file <path>` — a SINGLE source file. It cannot
// import src/credentials/ruleOfTwo.ts (outside the file), and this suite cannot import
// the function (its `npm:@insforge/sdk` specifier is Deno-only). So the decision lives
// in a marker-delimited, dependency-free block inside the function, and this test
// extracts that block, executes it, and drives BOTH implementations over every
// exposure combination. Edit either side and this fails until they agree again —
// which is the property that was missing: the two copies agreed by coincidence.

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { evaluateRuleOfTwo } from '../src/credentials/ruleOfTwo.ts'
import { HIGH_RISK } from '../src/credentials/broker.ts'

const FN_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../functions/credential-broker.ts')
const SRC = readFileSync(FN_PATH, 'utf8')

const START = '// ---- RULE-OF-TWO-CONFORMANCE-BLOCK-START ----'
const END = '// ---- RULE-OF-TWO-CONFORMANCE-BLOCK-END ----'

function extractBlock(): string {
  const a = SRC.indexOf(START)
  const b = SRC.indexOf(END)
  expect(a, `marker ${START} must exist in credential-broker.ts`).toBeGreaterThan(-1)
  expect(b, `marker ${END} must exist in credential-broker.ts`).toBeGreaterThan(a)
  return SRC.slice(a + START.length, b)
}

describe('Rule-of-Two conformance (edge function vs canonical module)', () => {
  it('the function carries a marker-delimited, import-free decision block', () => {
    const block = extractBlock()
    // Purity guard on CODE, not prose: comments are stripped first (the block's own
    // comment explains why it cannot import, and that must not trip the check). An
    // import in executable position would break this test and the single-file deploy.
    const code = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/\bimport\b|\brequire\(/)
  })

  it('agrees with evaluateRuleOfTwo on every exposure combination, both approval states', () => {
    // The block is TypeScript (deno type-checks the deployed file), so strip the
    // annotations before executing it. esbuild does exactly the transform the deploy
    // runtime does, so what runs here is what runs in production.
    const js = transformSync(extractBlock(), { loader: 'ts', format: 'cjs' }).code
    const decide = new Function(`${js}; return ruleOfTwoDecision;`)() as (
      p?: boolean, u?: boolean, e?: boolean, approved?: boolean,
    ) => { requiresHuman: boolean; reason: string }

    for (const privateData of [false, true]) {
      for (const untrustedContent of [false, true]) {
        for (const externalComms of [false, true]) {
          for (const approved of [false, true]) {
            const canonical = evaluateRuleOfTwo({ privateData, untrustedContent, externalComms }, approved)
            const fn = decide(privateData, untrustedContent, externalComms, approved)
            const label = JSON.stringify({ privateData, untrustedContent, externalComms, approved })
            expect(fn.requiresHuman, label).toBe(canonical.requiresHuman)
            if (fn.requiresHuman) {
              // Same escalation, same words: the audit trail must not depend on which
              // implementation fired.
              expect(fn.reason, label).toBe(canonical.reason)
            }
          }
        }
      }
    }
  })

  it('the function decision block is what the handler actually calls', () => {
    // The block being conformant is worthless if the handler still hand-rolls the
    // count next to it. The old inline form must be gone; the extracted function
    // must be invoked.
    expect(SRC).toMatch(/ruleOfTwoDecision\(/)
    expect(SRC).not.toMatch(/trifectaCount\s*>=\s*3/)
  })

  it('HIGH_RISK scope lists are identical sets on both sides', () => {
    const m = SRC.match(/const HIGH_RISK = \[([^\]]*)\]/)
    expect(m, 'functions/credential-broker.ts must declare const HIGH_RISK = [...]').toBeTruthy()
    const fnSide = (m as RegExpMatchArray)[1]
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
      .sort()
    expect(fnSide).toEqual([...HIGH_RISK].sort())
  })
})
