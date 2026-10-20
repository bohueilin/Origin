import { verifyChain } from '@origin/evidence/env-evidence'
import { tamperArtifact } from '../verify/detect.mjs'

const figure = document.querySelector<HTMLElement>('[data-diagram="trace"]')
if (figure) {
  const nodes = [...figure.querySelectorAll<SVGGElement>('[data-trace-node]')]
  const step = figure.querySelector<HTMLButtonElement>('[data-trace-step]')!
  const detail = figure.querySelector<HTMLElement>('[data-trace-detail]')!
  const block = figure.querySelector<HTMLElement>('[data-trace-block]')!
  const rows = [...document.querySelectorAll<HTMLElement>('.tr2-flow li')]
  let position = 0
  let selected = 0
  const show = (seq: number) => {
    const line = document.getElementById(`trace-ev-${seq}`)?.textContent?.split(' Hash ')[0] || "Activate 'Step through the chain' to begin at Event 1."
    if (detail.textContent !== line) detail.textContent = line
    rows.forEach(row => row.classList.toggle('is-current', Number(row.dataset.seq) === seq))
  }
  const select = (seq: number) => {
    selected = selected === seq ? 0 : seq
    nodes.forEach(node => node.setAttribute('aria-pressed', String(Number(node.dataset.traceNode) === selected)))
    show(seq)
  }
  figure.querySelectorAll('svg').forEach(svg => svg.setAttribute('role', 'group'))
  step.hidden = false
  show(position)
  step.onclick = () => {
    position = position === rows.length ? 0 : position + 1
    figure.classList.toggle('is-stepping', position > 0)
    nodes.forEach(node => node.classList.toggle('is-stepped', Number(node.dataset.traceNode) <= position))
    figure.querySelectorAll<SVGElement>('[data-link]').forEach(link => link.classList.toggle('is-stepped', Number(link.dataset.link) < position))
    step.textContent = position === rows.length ? 'Reset' : 'Step through the chain'
    step.setAttribute('aria-pressed', String(position > 0))
    block.hidden = position < 11
    block.textContent = document.querySelector('.blockline__t')?.textContent || ''
    if (!position) { selected = 0; nodes.forEach(node => node.setAttribute('aria-pressed', 'false')) }
    show(position)
  }
  for (const type of ['focusin', 'pointermove', 'click', 'keydown']) figure.addEventListener(type, event => {
    // Scrolling can fire pointerover beneath a stationary pointer; only motion inspects.
    if (type === 'pointermove' && event instanceof PointerEvent && (event.pointerType === 'touch' || (!event.movementX && !event.movementY))) return
    const node = (event.target as Element).closest<SVGGElement>('[data-trace-node]')
    if (!node) return
    const seq = Number(node.dataset.traceNode)
    if (event instanceof KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); show(position); step.focus() }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(seq) }
    } else if (type === 'click') select(seq)
    else show(seq)
  })

  const panel = document.querySelector<HTMLElement>('[data-tamper]')!
  const run = panel.querySelector<HTMLButtonElement>('[data-tamper-run]')!
  const flip = panel.querySelector<HTMLButtonElement>('[data-tamper-flip]')!
  const out = panel.querySelector<HTMLElement>('[data-tamper-out]')!
  type Trace = Parameters<typeof verifyChain>[0]
  let original: Promise<Trace> | undefined
  let tampered = false
  let request = 0
  const check = async () => {
    const revision = ++request
    try {
      original ??= fetch('/proof/tr-a002.json').then(async response => {
        if (!response.ok) throw Error()
        const trace: Trace = await response.json()
        if (!Array.isArray(trace.events) || trace.events.length !== rows.length || trace.event_count !== rows.length || !/^[a-f0-9]{64}$/.test(trace.final_digest) || trace.events.some((event, i) => !event || event.seq !== i + 1)) throw Error()
        return trace
      })
      const source = await original
      if (revision !== request) return
      const trace = structuredClone(source)
      if (tampered) trace.final_digest = (tamperArtifact('trace', { final_digest: source.final_digest }).value as Trace).final_digest
      const result = verifyChain(trace)
      const seal = trace.events.at(-1)!.event_hash.slice(0, 12)
      const digest = trace.final_digest.slice(0, 12)
      // /verify's verifyTraceArtifact uses the same chain result and codes 0/2.
      out.textContent = result.ok
        ? `VALID (code 0) — ${trace.events.length} of ${trace.events.length} event hashes and prev_hash links re-derive in this tab; the seal ${seal} equals final_digest. `
        : result.failures.length === 1 && result.failures[0] === 'final_digest != sealing hash'
          ? `VOID (code 2) — final_digest no longer equals the sealing event's hash: sealed ${seal}, now ${digest}.`
          : `VOID (code 2) — ${result.failures.join('; ')}.`
      out.dataset.state = result.ok ? 'ok' : 'bad'
      if (result.ok) { const code = document.createElement('code'); code.textContent = trace.final_digest; out.append(code) }
    } catch {
      original = undefined
      if (revision === request) { out.textContent = 'Unable to re-check this artifact. Try again or use the command on this page.'; out.dataset.state = 'bad' }
    }
  }
  panel.hidden = false
  run.onclick = () => { void check() }
  flip.onclick = () => {
    tampered = !tampered
    flip.setAttribute('aria-pressed', String(tampered))
    flip.textContent = tampered ? 'Restore the original' : 'Flip one character of final_digest'
    void check()
  }
}
