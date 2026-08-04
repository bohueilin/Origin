// The owner gate must have exactly ONE definition.
//
// Two places decide whether the current account is the owner: AuthProvider.refresh()
// (which signs everyone else back out) and passport/ui/App.tsx (which decides whether
// the run controls are live). They were written independently, each with its own copy
// of the address and its own `.trim().toLowerCase()` comparison. Two copies of a
// security predicate is one copy too many: changing the owner address in the provider
// and not in the app would leave a page that still hands the run controls to an
// account the provider has already refused, and nothing would fail.
//
// This is a source-level gate on purpose. The defect is duplication, not behaviour —
// both copies agree today, so no runtime assertion can see the problem. What can be
// pinned is that the literal is defined once and that the consumers import the shared
// predicate rather than re-deriving it.

import { describe, expect, it } from 'vitest'
import { isOwnerEmail, OWNER_EMAIL } from './AuthProvider'

// Read the sources through Vite's raw glob rather than node:fs: this file lives under
// src/, which tsconfig.app.json type-checks with browser lib and no node types.
const RAW = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const sources = Object.entries(RAW)
  .filter(([path]) => !/\.test\.tsx?$/.test(path))
  // Glob keys come back relative to THIS file ('./AuthProvider.tsx', '../passport/ui/App.tsx');
  // restate them relative to src/ so a failure names the file the way a human would.
  .map(([path, text]) => [path.startsWith('./') ? `auth/${path.slice(2)}` : path.replace(/^\.\.\//, ''), text] as const)

describe('the owner gate', () => {
  it('spells the owner address in exactly one source file', () => {
    const holders = sources.filter(([, text]) => text.includes(OWNER_EMAIL)).map(([path]) => path)
    expect(holders).toEqual(['auth/AuthProvider.tsx'])
  })

  it('is the predicate the passport app gates its run controls on', () => {
    const app = sources.find(([path]) => path === 'passport/ui/App.tsx')?.[1]
    expect(app, 'passport/ui/App.tsx must be readable').toBeTypeOf('string')
    expect(app).toMatch(/import\s*\{[^}]*\bisOwnerEmail\b[^}]*\}\s*from\s*'\.\.\/\.\.\/auth\/AuthProvider'/)
  })

  it('ignores case and surrounding whitespace', () => {
    expect(isOwnerEmail(OWNER_EMAIL)).toBe(true)
    expect(isOwnerEmail(`  ${OWNER_EMAIL.toUpperCase()} `)).toBe(true)
  })

  it('refuses everyone else, including the empty and absent cases', () => {
    expect(isOwnerEmail('someone@else.com')).toBe(false)
    expect(isOwnerEmail('')).toBe(false)
    expect(isOwnerEmail(null)).toBe(false)
    expect(isOwnerEmail(undefined)).toBe(false)
  })
})
