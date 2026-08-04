/**
 * Origin homepage — progressive enhancement only.
 *
 * The homepage is fully readable and usable as static HTML with this module
 * absent. Everything here is additive: header elevation, scroll reveal, the
 * Observe→Plan→Act→Verify highlight, the lead-form modal, and analytics.
 * All motion is gated on `prefers-reduced-motion`.
 */

export {} // ensure this file is treated as a module (required for `declare global`)

type Gtag = (...args: unknown[]) => void
declare global {
  interface Window { gtag?: Gtag; dataLayer?: unknown[] }
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function track(event: string, params: Record<string, unknown> = {}): void {
  try {
    if (typeof window.gtag === 'function') window.gtag('event', event, params)
    else (window.dataLayer = window.dataLayer || []).push({ event, ...params })
  } catch { /* analytics must never break the page */ }
}

/* ---------- footer year ---------- */
document.querySelectorAll<HTMLElement>('[data-year]').forEach((el) => {
  el.textContent = String(new Date().getFullYear())
})

/* ---------- sticky header elevation ---------- */
const header = document.querySelector<HTMLElement>('.site-header')
if (header) {
  const onScroll = () => header.toggleAttribute('data-elevated', window.scrollY > 8)
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
}

/* ---------- mobile nav (hamburger) ---------- */
const burger = document.querySelector<HTMLButtonElement>('[data-nav-toggle]')
const siteNav = document.getElementById('site-nav')
if (burger && siteNav) {
  const setNav = (open: boolean) => {
    siteNav.classList.toggle('is-open', open)
    burger.setAttribute('aria-expanded', String(open))
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu')
  }
  burger.addEventListener('click', () => setNav(!siteNav.classList.contains('is-open')))
  siteNav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setNav(false)))
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && siteNav.classList.contains('is-open')) { setNav(false); burger.focus() }
  })
  document.addEventListener('click', (e) => {
    if (!siteNav.classList.contains('is-open')) return
    const t = e.target as Node
    if (!siteNav.contains(t) && !burger.contains(t)) setNav(false)
  })
}

/* ---------- scroll reveal (motion-safe) ---------- */
if (!reduceMotion && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('reveal-ready')
  const targets = document.querySelectorAll<HTMLElement>(
    '.card, .loop__step, .timeline__item, .compare__col, .teamcard, .io__col, .io__diagram, .checklist > li, .whynow__item, .routecard, .wedge__primary, .wedge__future',
  )
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e, i) => {
        if (!e.isIntersecting) return
        const el = e.target as HTMLElement
        // gentle stagger within a batch
        el.style.transitionDelay = `${Math.min(i * 40, 200)}ms`
        el.classList.add('is-in')
        io.unobserve(el)
      })
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  )
  targets.forEach((t) => {
    t.setAttribute('data-reveal', '')
    io.observe(t)
  })
}

/* ---------- Observe → Plan → Act → Verify highlight ---------- */
if (!reduceMotion && 'IntersectionObserver' in window) {
  const steps = Array.from(document.querySelectorAll<HTMLElement>('.loop__step'))
  if (steps.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) (e.target as HTMLElement).classList.add('is-active')
        })
      },
      { rootMargin: '-20% 0px -40% 0px', threshold: 0.5 },
    )
    steps.forEach((s) => io.observe(s))
  }
}

/* ---------- analytics: delegated CTA + section tracking ---------- */
document.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement)?.closest<HTMLElement>('[data-analytics]')
  if (!el) return
  const name = el.getAttribute('data-analytics')
  if (!name) return
  const params: Record<string, unknown> = {}
  const audience = el.getAttribute('data-audience')
  if (audience) params.audience = audience
  const intent = el.getAttribute('data-intent')
  if (intent) params.intent = intent
  track(name, params)
})

/* ---------- Product walkthrough stepper ----------
   Enhancement only. With JS off or reduced-motion on, CSS shows all four panels
   stacked (the workflow is fully communicated) and the tabs/controls stay hidden. */
const walk = document.querySelector<HTMLElement>('[data-walk]')
if (walk && !reduceMotion) {
  const blocks = Array.from(walk.querySelectorAll<HTMLElement>('.walk__mode-block'))
  const modeBtns = Array.from(walk.querySelectorAll<HTMLButtonElement>('[data-walk-mode-btn]'))
  const fill = walk.querySelector<HTMLElement>('.walk__progress-fill')
  const replay = walk.querySelector<HTMLButtonElement>('[data-walk-replay]')
  const curOf = new WeakMap<HTMLElement, number>()

  if (blocks.length) {
    walk.classList.add('is-enhanced')
    let activeBlock = blocks[0]
    let timer = 0
    let interacted = false
    const markInteracted = () => { if (!interacted) { interacted = true; track('product_demo_interaction') } }
    const tabsOf = (b: HTMLElement) => Array.from(b.querySelectorAll<HTMLButtonElement>('.walk__tab'))
    const panelsOf = (b: HTMLElement) => Array.from(b.querySelectorAll<HTMLElement>('.walk__panel'))

    const show = (block: HTMLElement, i: number) => {
      const tabs = tabsOf(block); const panels = panelsOf(block)
      const idx = Math.max(0, Math.min(i, panels.length - 1))
      curOf.set(block, idx)
      tabs.forEach((t, k) => { const a = k === idx; t.classList.toggle('is-active', a); t.setAttribute('aria-pressed', String(a)) })
      panels.forEach((p, k) => p.classList.toggle('is-active', k === idx))
      if (fill) fill.style.width = `${((idx + 1) / panels.length) * 100}%`
    }
    const stop = () => { if (timer) { window.clearInterval(timer); timer = 0 } }
    const play = (block: HTMLElement) => {
      stop(); show(block, 0)
      timer = window.setInterval(() => {
        const panels = panelsOf(block); const cur = curOf.get(block) ?? 0
        if (cur >= panels.length - 1) { stop(); return }
        show(block, cur + 1)
      }, 1700)
    }

    // wire tabs (keyboard-accessible) in every mode block
    blocks.forEach((block) => {
      const tabs = tabsOf(block)
      tabs.forEach((t, i) => {
        t.addEventListener('click', () => { stop(); markInteracted(); show(block, i) })
        t.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); stop(); markInteracted(); const n = (i + 1) % tabs.length; tabs[n].focus(); show(block, n) }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); stop(); markInteracted(); const n = (i - 1 + tabs.length) % tabs.length; tabs[n].focus(); show(block, n) }
        })
      })
      show(block, 0)
    })

    // mode switch (Normal / Exception)
    modeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-walk-mode-btn')
        const block = blocks.find((b) => b.getAttribute('data-walk-mode') === mode)
        if (!block) return
        stop(); markInteracted()
        modeBtns.forEach((b) => { const a = b === btn; b.classList.toggle('is-active', a); b.setAttribute('aria-pressed', String(a)) })
        blocks.forEach((b) => b.classList.toggle('is-active', b === block))
        activeBlock = block
        show(block, 0)
        track('product_demo_interaction', { mode: mode || '' })
      })
    })

    replay?.addEventListener('click', () => { markInteracted(); play(activeBlock) })

    // auto-play the active mode once, when scrolled into view; pause on interaction
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { play(activeBlock); io.disconnect() } })
    }, { threshold: 0.4 })
    io.observe(walk)
  }
}

/* scroll depth: 25 / 50 / 75 / 100 */
{
  const marks = [25, 50, 75, 100]
  const seen = new Set<number>()
  const onScroll = () => {
    const doc = document.documentElement
    const scrollable = doc.scrollHeight - window.innerHeight
    if (scrollable <= 0) return
    const pct = Math.round((window.scrollY / scrollable) * 100)
    for (const m of marks) {
      if (pct >= m && !seen.has(m)) {
        seen.add(m)
        track('scroll_depth', { percent: m })
      }
    }
    if (seen.size === marks.length) window.removeEventListener('scroll', onScroll)
  }
  window.addEventListener('scroll', onScroll, { passive: true })
}

/* ---------- Lead form modal ---------- */
const dialog = document.getElementById('lead-modal') as HTMLDialogElement | null
const form = document.getElementById('lead-form') as HTMLFormElement | null
const titleEl = document.getElementById('lead-title')
const subEl = document.getElementById('lead-sub')
const intentEl = document.getElementById('lead-intent') as HTMLInputElement | null
const errorEl = document.getElementById('lead-error') as HTMLElement | null
const successEl = document.getElementById('lead-success') as HTMLElement | null
const submitEl = document.getElementById('lead-submit') as HTMLButtonElement | null
let lastFocused: HTMLElement | null = null

// PLACEHOLDER domain email — replace with the real MX-backed inbox. The primary
// lead path is the /api/lead Pages Function; this is only the mailto fallback.
const CONTACT_EMAIL = 'hello@originphysical.ai'

const INTENT_COPY: Record<string, { title: string; sub: string; cta: string }> = {
  review: { title: 'Book an Agent Evidence Review', sub: 'Tell us about the agent that’s stuck in review. We follow up to learn — not to pitch.', cta: 'Request review' },
  blocker: { title: 'Send us the reviewer blocker', sub: 'Tell us what’s blocking approval and who signs off. We’ll say honestly whether Origin can produce the evidence your reviewer needs.', cta: 'Send the blocker' },
  // default fallback for any CTA without an explicit intent
  demo: { title: 'Book an Agent Evidence Review', sub: 'Tell us about the high-consequence agent you need through security review.', cta: 'Request review' },
  investor: { title: 'Read the one-page brief', sub: 'Leave your details and we’ll share the brief on the wedge, the evidence ladder, and where Origin is going.', cta: 'Request brief' },
  'design-partner': { title: 'Become a design partner', sub: 'Run your agent (or a representative policy) through the gym and get a signed, config-bound reference check. Real-customer evidence stays blocked by default until you authorize it.', cta: 'Start as a design partner' },
}

function openLead(trigger: HTMLElement): void {
  if (!dialog) return
  lastFocused = trigger
  const intent = trigger.getAttribute('data-intent') || 'demo'
  const copy = INTENT_COPY[intent] || INTENT_COPY.demo
  if (titleEl) titleEl.textContent = copy.title
  if (subEl) subEl.textContent = copy.sub
  if (intentEl) intentEl.value = intent
  if (submitEl) submitEl.textContent = copy.cta
  // reset to form view
  if (successEl) successEl.hidden = true
  if (form) { form.querySelectorAll<HTMLElement>('.field, .modal__actions, .modal__note, .modal__sub, .modal__title').forEach((n) => (n.hidden = false)) }
  if (errorEl) errorEl.hidden = true
  // capture which CTA opened the form (hero, demo, evidence, offer, footer, etc.)
  const source = trigger.getAttribute('data-source') || trigger.getAttribute('data-analytics') || 'unknown'
  const srcEl = document.getElementById('lead-source') as HTMLInputElement | null
  if (srcEl) srcEl.value = source
  // CRM handoff context: role path (from a role card), page path, and open timestamp
  const audience = trigger.getAttribute('data-audience') || ''
  const audEl = document.getElementById('lead-audience') as HTMLInputElement | null
  if (audEl) audEl.value = audience
  const pageEl = document.getElementById('lead-page') as HTMLInputElement | null
  if (pageEl) pageEl.value = window.location.pathname + window.location.hash
  const tsEl = document.getElementById('lead-ts') as HTMLInputElement | null
  if (tsEl) tsEl.value = new Date().toISOString()
  track('lead_form_open', { intent, source })
  if (typeof dialog.showModal === 'function') dialog.showModal()
  else dialog.setAttribute('open', '')
  window.setTimeout(() => document.getElementById('lead-name')?.focus(), 30)
}

function closeLead(): void {
  if (!dialog) return
  if (dialog.open) dialog.close()
  lastFocused?.focus()
}

document.querySelectorAll<HTMLElement>('[data-open-lead]').forEach((btn) => {
  btn.addEventListener('click', (e) => { e.preventDefault(); openLead(btn) })
})
document.querySelectorAll<HTMLElement>('[data-close-lead]').forEach((btn) => {
  btn.addEventListener('click', (e) => { e.preventDefault(); closeLead() })
})
// backdrop click closes
dialog?.addEventListener('click', (e) => {
  if (e.target === dialog) closeLead()
})
// return focus after native close (Escape)
dialog?.addEventListener('close', () => lastFocused?.focus())

function showFieldError(input: HTMLInputElement, msg: string): void {
  input.setAttribute('aria-invalid', 'true')
  if (errorEl) { errorEl.textContent = msg; errorEl.hidden = false }
  input.focus()
}

function showSuccess(captured: boolean): void {
  form?.querySelectorAll<HTMLElement>('.field, .modal__actions, .modal__note, .modal__sub, .modal__title').forEach((n) => (n.hidden = true))
  const msg = document.getElementById('lead-success-msg')
  const fb = document.getElementById('lead-success-fallback')
  if (captured) {
    if (msg) msg.textContent = 'We’ve received your request and will be in touch at the email you provided.'
    if (fb) fb.hidden = true
  } else {
    if (msg) msg.textContent = 'Your email app should open with your details ready to send. If it doesn’t, reach us directly:'
    if (fb) fb.hidden = false
  }
  if (successEl) {
    successEl.hidden = false
    const h = successEl.querySelector('h3') as HTMLElement | null
    h?.setAttribute('tabindex', '-1')
    h?.focus()
  }
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault()
  // honeypot: a filled hidden field means a bot — show success, send nothing, track nothing.
  const hp = form.elements.namedItem('company_website') as HTMLInputElement | null
  if (hp && hp.value.trim() !== '') return showSuccess(true)
  const name = form.elements.namedItem('name') as HTMLInputElement
  const email = form.elements.namedItem('email') as HTMLInputElement
  name?.removeAttribute('aria-invalid')
  email?.removeAttribute('aria-invalid')
  if (errorEl) errorEl.hidden = true

  if (!name.value.trim()) return showFieldError(name, 'Please enter your name.')
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())
  if (!emailOk) return showFieldError(email, 'Please enter a valid work email.')

  const intent = intentEl?.value || 'demo'
  const val = (n: string) => {
    const el = form.elements.namedItem(n) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
    return el ? el.value.trim() : ''
  }
  // The visible form is four fields (name, work email, company, blocker). Role,
  // agent, touches, sign-off, workaround, and urgency were removed to cut
  // friction; val() already returns '' for absent controls, so nothing throws —
  // but we deliberately DO NOT send those keys rather than sending empty strings
  // that would look like answered-and-blank in the CRM.

  // Primary path: POST to the Cloudflare Pages Function (/api/lead). It reports two
  // independent outcomes — `stored` (the row is in the admin queue) and `delivered`
  // (a human was notified). EITHER one means we have the request, so the mailto
  // fallback only fires when BOTH failed. Keying off `delivered` alone used to push
  // a visitor into their mail client even when the request was already queued.
  let received = false
  if (submitEl) { submitEl.disabled = true; submitEl.textContent = 'Sending…' }
  try {
    const res = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: val('name'), email: val('email'), company: val('company'),
        blocker: val('blocker'), intent,
        cta_source: val('cta_source'), role_path: val('role_path'),
        page_path: val('page_path'), opened_at: val('opened_at'), company_website: '',
      }),
    })
    if (res.ok) {
      const j = (await res.json().catch(() => ({}))) as { stored?: boolean; delivered?: boolean }
      received = !!j.stored || !!j.delivered
    }
  } catch { received = false }
  if (submitEl) submitEl.disabled = false

  showSuccess(received)
  if (received) {
    track('lead_form_submit_success', { intent })
  } else {
    track('lead_form_submit_error', { intent })
    const subject = `Origin — ${intent} request`
    const body = [
      `Interest: ${intent}`,
      `Name: ${val('name')}`,
      `Email: ${val('email')}`,
      `Company: ${val('company')}`,
      `Blocker: ${val('blocker')}`,
    ].join('\n')
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }
})

/* ---------- Vision film: click-to-play (lazy, no autoplay) ----------
   The <video> is laid out from the start (poster only, preload="none" so no
   bytes until play) with native controls as a guaranteed fallback. The overlay
   just kicks off playback and gets out of the way. */
// Reveal the designed overlay only when JS is active; with JS off the CSS keeps it
// hidden so the native <video controls> are directly usable (no "nothing happens").
document.querySelectorAll<HTMLElement>('[data-video]').forEach((fig) => fig.classList.add('is-enhanced'))
document.querySelectorAll<HTMLElement>('[data-video-play]').forEach((btn) => {
  const fig = btn.closest('[data-video]')
  const video = fig?.querySelector('video') as HTMLVideoElement | null
  if (!video) return
  // Reveal the playing video only once playback truly starts; never hide the
  // overlay up-front, or a delayed/blocked play() leaves the viewer on a static
  // poster ("nothing happens"). If play fails, keep the overlay + the native
  // <video controls> so a click is never a dead end.
  const reveal = () => { btn.hidden = true }
  const restore = () => { btn.hidden = false }
  const start = () => { video.muted = true; return video.play().then(reveal) }
  // It's an ambient brand film: autoplay muted where the browser allows it. If
  // autoplay is blocked (Safari Low Power Mode, data-saver, strict autoplay),
  // the poster/▶ overlay stays and a click starts it (with a load()+retry).
  start().catch(() => { try { video.load() } catch { /* ignore */ } restore() })
  btn.addEventListener('click', () => {
    start().catch(() => { try { video.load() } catch { /* ignore */ } start().catch(restore) })
    track('vision_video_play')
  })
})

/* ---------- interactive 90-second demo (progressive enhancement) ---------- */
document.querySelectorAll<HTMLElement>('[data-demo]').forEach((demo) => {
  const panels = Array.from(demo.querySelectorAll<HTMLElement>('[data-demo-panel]'))
  const dots = Array.from(demo.querySelectorAll<HTMLButtonElement>('[data-demo-step]'))
  const cap = demo.querySelector<HTMLElement>('[data-demo-cap]')
  const playBtn = demo.querySelector<HTMLButtonElement>('[data-demo-play]')
  const prevBtn = demo.querySelector<HTMLButtonElement>('[data-demo-prev]')
  const nextBtn = demo.querySelector<HTMLButtonElement>('[data-demo-next]')
  if (panels.length < 2) return
  const CAPS = [
    'The exact configuration is bound into a digest.',
    'A deterministic battery exercises allow, deny, and escalate.',
    'The oracle grades FAR, FRR, catastrophic failures, and readiness.',
    'Origin issues a configuration-bound sandbox attestation.',
    'The artifact verifies offline — until a bound field changes.',
  ]
  demo.classList.add('is-enhanced')
  const N = panels.length
  let step = 0
  let timer = 0

  const stop = () => {
    if (!timer) return
    window.clearInterval(timer); timer = 0
    if (playBtn) { playBtn.innerHTML = '&#9654; Play'; playBtn.setAttribute('aria-pressed', 'false') }
  }
  // render() is the ONE place tab state changes: selection, roving tabindex,
  // panel visibility (both the class the CSS animates and the `hidden` attribute
  // assistive tech honours), and the caption.
  const render = () => {
    panels.forEach((p, i) => {
      const on = i === step
      p.classList.toggle('is-on', on)
      p.toggleAttribute('hidden', !on)
    })
    dots.forEach((d, i) => {
      const on = i === step
      d.classList.toggle('is-on', on)
      d.setAttribute('aria-selected', String(on))
      d.tabIndex = on ? 0 : -1
    })
    if (cap) cap.textContent = `Stage ${step + 1} of ${N} · ${CAPS[step] ?? ''}`
    prevBtn?.toggleAttribute('disabled', step === 0)
    nextBtn?.toggleAttribute('disabled', step === N - 1)
  }
  const go = (i: number) => { step = Math.max(0, Math.min(N - 1, i)); render() }

  // WAI-ARIA tabs keyboard contract: Left/Right wrap, Home/End jump to the ends.
  dots.forEach((d) => {
    d.addEventListener('keydown', (event: KeyboardEvent) => {
      const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
      if (!keys.includes(event.key)) return
      event.preventDefault()
      stop()
      const next = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? dots.length - 1
          : (step + (event.key === 'ArrowRight' ? 1 : -1) + dots.length) % dots.length
      go(next)
      dots[next].focus()
    })
  })
  const play = () => {
    if (timer) { stop(); return }
    if (playBtn) { playBtn.innerHTML = '&#10073;&#10073; Pause'; playBtn.setAttribute('aria-pressed', 'true') }
    if (step === N - 1) go(0)
    timer = window.setInterval(() => { if (step >= N - 1) stop(); else go(step + 1) }, 1700)
  }

  dots.forEach((d, i) => d.addEventListener('click', () => { stop(); go(i) }))
  prevBtn?.addEventListener('click', () => { stop(); go(step - 1) })
  nextBtn?.addEventListener('click', () => { stop(); go(step + 1) })
  if (reduceMotion && playBtn) playBtn.style.display = 'none'
  else playBtn?.addEventListener('click', () => { const wasPlaying = !!timer; play(); if (!wasPlaying) track('demo_play') })
  render()
})

// ── Hero self-verification ────────────────────────────────────────────────────
//
// The homepage argued that evidence is independently checkable, and then asked the
// visitor to take that on faith — an investor could read the whole page without ever
// seeing Origin refuse anything, or seeing a single claim actually verified.
//
// This recomputes the SHA-256 hash chain over the console's own audit entries, in the
// visitor's browser, with no network and no Origin server involved. It is the same
// computation /verify performs on a real exported package. The tamper button edits one
// entry and re-runs it, so the chain breaks in front of them.
//
// Honesty: these entries are the SIMULATED console's, not a customer's, and the
// caption says so. What is genuinely demonstrated is the mechanism — that altering any
// byte breaks the chain, and that checking it requires nothing of ours.
const chainRoot = document.querySelector<HTMLElement>('[data-chain-check]')
if (chainRoot && window.crypto?.subtle) {
  const out = chainRoot.querySelector<HTMLElement>('[data-chain-out]')
  const runBtn = chainRoot.querySelector<HTMLButtonElement>('[data-chain-run]')
  const tamperBtn = chainRoot.querySelector<HTMLButtonElement>('[data-chain-tamper]')
  const entries = Array.from(document.querySelectorAll<HTMLElement>('.log li'))
    .map((li) => (li.textContent || '').replace(/\s+/g, ' ').trim())
  let tampered = false

  const sha256 = async (text: string): Promise<string> => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  // Same shape as the real chain: each link digests the previous hash plus this entry,
  // so one altered byte changes every hash after it.
  const buildChain = async (rows: string[]): Promise<string[]> => {
    const hashes: string[] = []
    let prev = ''
    for (const row of rows) { prev = await sha256(`${prev}|${row}`); hashes.push(prev) }
    return hashes
  }

  const render = (msg: string, state: 'ok' | 'bad' | 'busy') => {
    if (!out) return
    out.textContent = msg
    out.dataset.state = state
  }

  const verify = async () => {
    render('Recomputing…', 'busy')
    const rows = entries.slice()
    if (tampered && rows.length > 2) rows[2] = rows[2].replace('Approved', 'Approved (altered)')
    const sealed = await buildChain(entries)          // what was sealed when written
    const recomputed = await buildChain(rows)          // what the bytes say now
    const bad = recomputed.findIndex((h, i) => h !== sealed[i])
    if (bad === -1) {
      render(`chain intact · ${sealed.length}/${sealed.length} links verified · head ${sealed[sealed.length - 1].slice(0, 12)}…`, 'ok')
    } else {
      render(`TAMPER at entry ${bad + 1} — recomputed ${recomputed[bad].slice(0, 12)}… ≠ sealed ${sealed[bad].slice(0, 12)}…`, 'bad')
    }
  }

  runBtn?.addEventListener('click', () => { void verify(); track('hero_chain_verify') })
  tamperBtn?.addEventListener('click', () => {
    tampered = !tampered
    if (tamperBtn) tamperBtn.textContent = tampered ? 'Restore the record' : 'Alter one entry'
    void verify()
    track('hero_chain_tamper')
  })
}
