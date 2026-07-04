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
  demo: { title: 'Book a floor demo', sub: 'Tell us about your floor and robots. We’ll follow up to schedule.', cta: 'Request demo' },
  pilot: { title: 'Discuss a pilot', sub: 'Start with one workflow on one floor. Tell us where you’d begin.', cta: 'Request pilot' },
  operator: { title: 'Evaluate a supervised pilot', sub: 'Where are interventions costing you today? Tell us about your floor.', cta: 'Start the conversation' },
  partner: { title: 'Discuss integration', sub: 'Tell us about your AMR, humanoid, or ROS 2 stack and we’ll map the fit.', cta: 'Discuss integration' },
  investor: { title: 'Request the company brief', sub: 'Leave your details and we’ll share the deep dive on wedge, timing, and proof.', cta: 'Request brief' },
  engineer: { title: 'See the technical challenges', sub: 'Tell us about your background and what you’d want to work on.', cta: 'Get in touch' },
}

// Prefill the role field when an audience card opens the modal.
const INTENT_ROLE: Record<string, string> = {
  operator: 'Operations',
  partner: 'Robotics / engineering',
  engineer: 'Robotics / engineering',
  investor: 'Investor',
}

function openLead(trigger: HTMLElement): void {
  if (!dialog) return
  lastFocused = trigger
  const intent = trigger.getAttribute('data-intent') || 'demo'
  const copy = INTENT_COPY[intent] || INTENT_COPY.demo
  if (titleEl) titleEl.textContent = copy.title
  if (subEl) subEl.textContent = copy.sub
  if (intentEl) intentEl.value = intent
  const roleSel = document.getElementById('lead-role') as HTMLSelectElement | null
  if (roleSel) roleSel.value = INTENT_ROLE[intent] || ''
  if (submitEl) submitEl.textContent = copy.cta
  // reset to form view
  if (successEl) successEl.hidden = true
  if (form) { form.querySelectorAll<HTMLElement>('.field, .modal__actions, .modal__note, .modal__sub, .modal__title').forEach((n) => (n.hidden = false)) }
  if (errorEl) errorEl.hidden = true
  track('lead_form_open', { intent })
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
  const role = val('role')

  // Primary path: POST to the Cloudflare Pages Function (/api/lead), which
  // forwards securely to our team. If it isn't reachable/configured to deliver,
  // fall back to composing a mailto so demand is never silently dropped.
  let delivered = false
  if (submitEl) { submitEl.disabled = true; submitEl.textContent = 'Sending…' }
  try {
    const res = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: val('name'), email: val('email'), company: val('company'),
        role, floor: val('floor'), intent, company_website: '',
      }),
    })
    if (res.ok) {
      const j = (await res.json().catch(() => ({}))) as { delivered?: boolean }
      delivered = !!j.delivered
    }
  } catch { delivered = false }
  if (submitEl) submitEl.disabled = false

  showSuccess(delivered)
  if (delivered) {
    track('lead_form_submit_success', { intent, role })
  } else {
    track('lead_form_submit_error', { intent, role })
    const subject = `Origin — ${intent} request`
    const body = [
      `Interest: ${intent}`,
      `Name: ${val('name')}`,
      `Email: ${val('email')}`,
      `Company: ${val('company')}`,
      `Role: ${role}`,
      `Floor & robots: ${val('floor')}`,
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
