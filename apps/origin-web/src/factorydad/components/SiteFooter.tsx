// A full product-grade site footer: a contact/support band + link columns +
// legal bar. Contact details are realistic placeholders for this prototype — the
// phone uses the 555-0199 range (reserved for fictitious use, so it can never
// ring a real person). Honesty is preserved: a "research prototype" tag and the
// dataset/readiness disclaimer stay in the legal bar.

import { PRODUCT_NAME, PRODUCT_TAGLINE, versionTag } from '../brand'
import type { Bundle } from '../types'

const SUPPORT_PHONE_DISPLAY = '+1 (415) 555-0199'
const SUPPORT_PHONE_TEL = '+14155550199'
const SUPPORT_EMAIL = 'support@originrobotics.ai'
const SALES_EMAIL = 'sales@originrobotics.ai'

export function SiteFooter({ bundle }: { bundle: Bundle }) {
  return (
    <footer className="fd-footer" id="contact">
      {/* contact / support band */}
      <div className="fd-foot-contact fd-shell">
        <div className="fd-foot-contact-lead">
          <div className="fd-kicker">Talk to a deployment engineer</div>
          <h2>Bringing a robot onto a real floor? We’ll help you prove it first.</h2>
          <p>
            Walk through your site, your embodiment, and the readiness bar with someone who has run
            the gate — before anything moves near people.
          </p>
          <div className="fd-foot-cta-row">
            <a className="fd-btn fd-btn-primary" href={`mailto:${SALES_EMAIL}?subject=Origin%20demo`}>
              Book a demo
            </a>
            <a className="fd-btn fd-btn-ghost" href="/capture.html?start=submit">Submit your site</a>
          </div>
        </div>
        <div className="fd-foot-contact-card" aria-label="Customer support">
          <div className="fd-foot-support-row">
            <span className="fd-foot-support-ic" aria-hidden="true">☎</span>
            <div>
              <span className="fd-foot-support-lbl">Customer support</span>
              <a className="fd-foot-support-val" href={`tel:${SUPPORT_PHONE_TEL}`}>{SUPPORT_PHONE_DISPLAY}</a>
              <span className="fd-foot-support-sub">Mon–Fri · 8am–6pm PT</span>
            </div>
          </div>
          <div className="fd-foot-support-row">
            <span className="fd-foot-support-ic" aria-hidden="true">✉</span>
            <div>
              <span className="fd-foot-support-lbl">Support</span>
              <a className="fd-foot-support-val" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
              <span className="fd-foot-support-sub">Response within 1 business day</span>
            </div>
          </div>
          <div className="fd-foot-support-row">
            <span className="fd-foot-support-ic" aria-hidden="true">⚲</span>
            <div>
              <span className="fd-foot-support-lbl">Where we are</span>
              <span className="fd-foot-support-val">San Francisco, CA</span>
              <span className="fd-foot-support-sub">Remote-first team</span>
            </div>
          </div>
        </div>
      </div>

      {/* link columns */}
      <div className="fd-foot-cols fd-shell">
        <div className="fd-foot-brand">
          <a className="fd-brand" href="#overview">
            <img className="fd-logo" src="/origin-logo.png" alt="" aria-hidden="true" />
            <span>{PRODUCT_NAME}<small>{PRODUCT_TAGLINE}</small></span>
          </a>
          <p className="fd-foot-mission">
            The readiness layer for autonomy — physical and digital. A model proposes; a
            deterministic oracle decides finish, escalate, or refuse — so every robot, and every
            software agent, re-earns permission before it acts.
          </p>
          <div className="fd-foot-status" role="status">
            <span className="fd-foot-dot" aria-hidden="true" /> Research prototype · benchmark{' '}
            {versionTag(bundle.version)}
          </div>
        </div>

        <nav className="fd-foot-col" aria-label="Product">
          <h3>Product</h3>
          <a href="#how">How it works</a>
          <a href="#cases">The test</a>
          <a href="#rsi">Improvement</a>
          <a href="#cost">Cost vs readiness</a>
          <a href="/passport">Try Passport</a>
          <a href="/capture.html?start=submit">Submit your site</a>
          <a href="/app.html">Open the console</a>
        </nav>

        <nav className="fd-foot-col" aria-label="Resources">
          <h3>Resources</h3>
          <a href="#models">Model scorecards</a>
          <a href="#rsl">The RSL curve</a>
          <a href="#trust">Trust &amp; scope</a>
          <a href="/capture.html?sample=1">Sample report</a>
          <a href={`mailto:${SALES_EMAIL}?subject=Origin%20benchmark`}>Benchmark access</a>
        </nav>

        <nav className="fd-foot-col" aria-label="Company">
          <h3>Company</h3>
          <a href="#why">Why now</a>
          <a href="#trust">Safety &amp; data</a>
          <a href={`mailto:${SUPPORT_EMAIL}`}>Contact</a>
          <a href={`mailto:${SALES_EMAIL}?subject=Origin%20partnership`}>Partnerships</a>
        </nav>
      </div>

      {/* closing line */}
      <p className="fd-foot-closing fd-shell">
        More capable agents are coming no matter what. Trustworthy ones need a control plane.
      </p>

      {/* legal bar */}
      <div className="fd-foot-legal fd-shell">
        <span>© 2026 {PRODUCT_NAME}. The RSL is an operational readiness gate, not a regulatory certification.</span>
        <span className="fd-foot-legal-links">
          <a href="#trust">Privacy</a>
          <a href="#trust">Terms</a>
          <a href="#trust">Security</a>
          <a href={`mailto:${SUPPORT_EMAIL}`}>Contact</a>
        </span>
      </div>
      <p className="fd-foot-fineprint fd-shell">{bundle.dataset_boundary.note} DROID and MVTec are inspiration only — not downloaded; MVTec is non-commercial.</p>
    </footer>
  )
}
