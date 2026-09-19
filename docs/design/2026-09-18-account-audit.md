# Origin account surfaces — design and access audit

Date: 2026-09-18. Scope: the authorized source redesign of `/auth` and `/admin` in the isolated site worktree. No live account, customer record, API configuration, role, or deployment was inspected or changed.

## Design decision

Use the same paper, sage and forest palette as the approved cinematic website. An original illustrative review photograph gives the access page a human context; it is decorative, not evidence of a customer, pilot, or deployed system. The authenticated workspace prioritizes readable operational content over decorative imagery.

The access page should explain the closed pilot before asking for information. Existing account holders can switch directly to sign-in. Public visitors can follow the existing Agent Evidence Review link without entering details that cannot create an account.

The admin route is a permanent page. Its previous dialog backdrop, Escape dismissal and close button made a page behave like a temporary modal. Replace that shell with a page heading, account rail, explicit home link and visible sign-out. Nested approval/step-up dialogs retain their own dialog behavior.

## Ownership and boundaries

| Surface | Source | Decision |
| --- | --- | --- |
| Access states | `apps/origin-web/src/auth/AuthPage.tsx` and `authPage.css` | Generous split layout, closed-pilot notice, review CTA, existing sign-in and verification states. |
| Admin loading / anonymous / denied | `apps/origin-web/src/auth/AdminPortal.tsx` | Branded access gate with explicit state and the existing sign-in destination. |
| Account workspace | `apps/origin-web/src/auth/AccountSettings.tsx` and `accountSettings.css` | Permanent page, role-loading/error clarity, existing account sections, visible queue update failures. |
| Auth/session services | `AuthProvider.tsx`, `insforge.ts`, `roleStore.ts` | Unchanged. The server remains the authority. |
| Privileged operations | `adminStore.ts`, credential/wallet stores and broker | Unchanged. Every existing role, scope, approval, expiry, revocation, and human-signing boundary remains in place. |

## Contracts retained

- `SIGNUPS_OPEN = false`; source configuration continues to request `disable_signup = true`. This source audit makes no assertion about live configuration.
- Ordinary visitors begin in the closed-pilot view; denied accounts begin in sign-in mode with usable Google sign-in.
- The default sign-in destination remains `/admin`; `/auth?next=/passport` keeps its Passport return behavior.
- OAuth callbacks remain query-free allowlisted URLs. The consumed-once `origin.auth.next` baton, denied-account marker, session restore hint, cookie fallback, and shared owner predicate stay unchanged.
- Anonymous admin visitors see no account records or workspace controls.
- The server-derived role decides staff navigation. A role that is loading or failed is explicitly unresolved, not a confident “User” badge. Role assignment stays limited to confirmed super admins in the UI and remains server checked.
- Posture reads retain separate loading, error and empty states. Failed reads do not become reassuring zeroes.
- Queue status failures retain the previous displayed status and give the operator an actionable error. No success is reported until the existing update API returns success.
- Dangerous operations retain existing confirmation and step-up requirements; nested dialogs retain their focus/keyboard handling.

## Local verification

`tests/e2e/account-workspace.spec.ts` exercises the real rendered pages with synthetic fixtures at the network boundary. It intercepts authentication and database calls and blocks all other APIs/external origins. Its fixtures are not customer data and cannot affect live roles or queues.

Coverage: closed-pilot usability; authenticated page semantics and Escape behavior; unresolved, failed/retried and regular-user role states; failed review-request and support-ticket updates; viewport fit; WCAG 2 A/AA serious/critical accessibility checks. Existing auth denial, session restore, signup-closed and owner-gate tests remain the regression contracts.

The root task ran the new workspace tests with the existing admin-portal and auth-denial suites: **54/54 desktop and mobile checks passed**. The missing permanent-page behavior, unresolved-role presentation, queue-failure feedback and paused-signup input collection were observed failing before their corresponding changes. Scoped production ESLint and whitespace checks passed. Screenshot capture in the overview test uses only mocked owner/posture fixtures. These checks do not validate live authentication, role configuration or customer data.

## Broader console inventory

The root task owns the coordinated treatment of `app.html` (local simulated evidence), `CaptureConsole` / `App.css`, Passport, Foundry/SOC/Clip and simulation/operations. Keep synthetic, illustrative, authorized-fixture, generated-counterfactual and customer evidence labels distinct. Preview provider-backed demonstrations with network interception; local visual QA must not start an external run.
