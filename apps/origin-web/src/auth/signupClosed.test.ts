// Sign-ups must be closed at the SERVER, not just in the browser.
//
// The sign-in page tells every visitor "Account creation is paused during the closed
// private pilot." Until now the only thing enforcing that sentence was `SIGNUPS_OPEN`,
// a module constant in AuthPage.tsx. A constant in a bundle disables buttons; it does
// not decide anything. AuthProvider.signUp() calls insforge.auth.signUp() directly, so
// anyone who called that path — from devtools, curl, or a second client — got an
// account, and the page kept saying account creation was paused.
//
// That is precisely the failure this product exists to name: a capability gate read as
// a permission gate. Capability is not permission.
//
// The decision belongs to the auth service. `disable_signup` in insforge.toml is that
// switch. This test pins it, so flipping it back fails the build instead of quietly
// reopening the door.
//
// IMPORTANT, and the reason this comment is long: insforge.toml is SOURCE OF TRUTH,
// NOT LIVE CONFIG. docs/DEPLOY.md records that it ships to InsForge separately from the
// Cloudflare Pages deploy. A green test here means the repo asks for sign-ups to be
// closed. It does NOT mean they are closed on the live project. Applying it is a
// human action against InsForge.

import { describe, expect, it } from 'vitest'

const TOML = import.meta.glob('../../insforge.toml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const config = Object.values(TOML)[0] ?? ''

const AUTH_SOURCES = import.meta.glob('./*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('sign-ups are closed where it counts', () => {
  it('finds insforge.toml', () => {
    expect(config, 'insforge.toml should be readable from this test').not.toBe('')
  })

  it('asks the auth service to refuse account creation', () => {
    // The server-side switch. This is the enforcement point.
    expect(config).toMatch(/^disable_signup\s*=\s*true\s*$/m)
    expect(config).not.toMatch(/^disable_signup\s*=\s*false\s*$/m)
  })

  it('keeps the client guard too, as defence in depth — never as the only guard', () => {
    // Belt and braces: the UI should still refuse, so a visitor is told the truth
    // rather than shown a form that the server will reject.
    const authPage = Object.entries(AUTH_SOURCES).find(([p]) => p.endsWith('AuthPage.tsx'))?.[1] ?? ''
    expect(authPage, 'AuthPage.tsx should be readable').not.toBe('')
    expect(authPage).toMatch(/const\s+SIGNUPS_OPEN\s*=\s*false/)
  })
})
