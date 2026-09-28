import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { PRODUCT_POSTURE } from './product-status.ts'

interface TraceEvent { seq: number; action: string; tool: string | null; verdict: string | null; side_effect: { executed?: boolean } | null; prev_hash: string; event_hash: string; sandbox: boolean }
interface Trace { events: TraceEvent[]; event_count: number; final_digest: string; log_digest: string; sandbox: boolean }
interface Summary { event_count: number; final_digest: string; log_digest: string; verify_command: string }
const escape = (s: unknown) => String(s ?? '—').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v !== null && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v)
const digest = (s: string) => createHash('sha256').update(s).digest('hex')

export function validateTrace(trace: Trace, summary: Summary): void {
  if (!trace.sandbox || trace.events.length !== trace.event_count || summary.event_count !== trace.event_count || !trace.events.length) throw new Error('Trace count/lane mismatch')
  let prev = '0'.repeat(64)
  trace.events.forEach((event, i) => {
    const { event_hash, ...payload } = event
    if (event.seq !== i + 1 || !event.sandbox || event.prev_hash !== prev || digest(canonical(payload)) !== event_hash) throw new Error(`Trace chain mismatch at ${i + 1}`)
    prev = event_hash
  })
  if (prev !== trace.final_digest || prev !== summary.final_digest || trace.log_digest !== summary.log_digest || digest(canonical(trace.events.map(e => e.event_hash))) !== trace.log_digest) throw new Error('Trace seal mismatch')
}

function text(x: number, y: number, value: unknown, cls = '', size = 14): string {
  return `<text x="${x}" y="${y}" font-size="${size}"${cls ? ` class="${cls}"` : ''}>${escape(value)}</text>`
}
function lines(value: string, max: number): string[] {
  const out: string[] = []
  // Preserve identifier punctuation and character order when wrapping.
  while (value.length > max) { let cut = value.lastIndexOf('.', max); if (cut < 4) cut = value.lastIndexOf('_', max); cut = cut < 4 ? max : cut + 1; out.push(value.slice(0, cut)); value = value.slice(cut) }
  return [...out, value]
}
const lane = ['Machine-emitted · one simulated,', 'sandboxed workflow ·', 'not a customer deployment']
const svgStart = (kind: string, layout: string, width: number, height: number, title: string, description: string) => `<svg class="diagram-${layout}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${kind}-${layout}-title ${kind}-${layout}-desc"><title id="${kind}-${layout}-title">${title}</title><desc id="${kind}-${layout}-desc">${description}</desc>`

export function renderTraceDiagram(trace: Trace, summary: Summary): string {
  validateTrace(trace, summary)
  const draw = (mobile: boolean) => {
    const positions = trace.events.map((_, i) => mobile ? { x: 8, y: 102 + i * 238, w: 244, h: 188 } : { x: 18 + (i < 6 ? i : 11 - i) * 182, y: i < 6 ? 95 : 370, w: 172, h: 180 })
    let svg = svgStart('trace', mobile ? 'mobile' : 'desktop', mobile ? 260 : 1120, mobile ? 102 + trace.event_count * 238 : 620, 'TR-A002: twelve events in the verified hash chain', 'One simulated sandbox workflow. Links show the previous event hash. A solid marker identifies the executed sandbox side effect; held and denied events are labeled.')
    svg += mobile ? lane.map((l, i) => text(8, 20 + i * 17, l, 'diagram-lane', 12)).join('') : text(18, 25, 'Machine-emitted · one simulated, sandboxed workflow · not a customer deployment', 'diagram-lane', 12)
    svg += text(mobile ? 8 : 18, mobile ? 80 : 53, '● Executed sandbox side effect', 'diagram-lane', 12)
    trace.events.forEach((e, i) => {
      const p = positions[i], held = /held|blocked/.test(e.action) || e.verdict === 'deny'
      svg += `<g data-trace-node="${e.seq}" data-hash="${e.event_hash}" data-prev-hash="${e.prev_hash}"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="8" class="diagram-node"/>`
      svg += text(p.x + 12, p.y + 24, `Event ${e.seq}${e.side_effect?.executed ? ' ●' : ''}`, '', 14)
      const actionLines = lines(e.action, mobile ? 29 : 19)
      svg += actionLines.map((s, n) => text(p.x + 12, p.y + 49 + n * 18, s, held ? 'diagram-danger' : '', 13)).join('')
      svg += text(p.x + 12, p.y + 108, e.tool || 'No tool', '', 13)
      svg += text(p.x + 12, p.y + 131, e.verdict || 'No verdict', held ? 'diagram-danger' : '', 13)
      svg += text(p.x + 12, p.y + 157, e.event_hash.slice(0, 8), 'diagram-hash', 12)
      if (i === trace.events.length - 1) svg += text(p.x + 12, p.y + 173, `Seal ${summary.final_digest.slice(0, 12)}`, 'diagram-hash', 12)
      svg += '</g>'
      if (i < trace.events.length - 1) {
        const q = positions[i + 1], x = p.x + p.w / 2, nx = q.x + q.w / 2
        let path: string, tx: number, ty: number
        if (mobile) { path = `M${x} ${p.y + p.h} V${q.y}`; tx = x + 10; ty = p.y + p.h + 29 }
        else if (i === 5) { path = `M${x} ${p.y + p.h} V${q.y}`; tx = x + 10; ty = 333 }
        else { const y = p.y + p.h + 38; path = `M${x} ${p.y + p.h} V${y} H${nx} V${q.y + q.h}`; tx = (x + nx) / 2 - 30; ty = y - 5 }
        svg += `<path d="${path}" class="diagram-chain"/>${text(tx, ty, e.event_hash.slice(0, 8), 'diagram-hash', 12)}`
      }
    })
    return svg + '</svg>'
  }
  const list = trace.events.map(e => `<li>Event ${e.seq}: ${escape(e.action)}; tool ${escape(e.tool || 'none')}; verdict ${escape(e.verdict || 'none')}; sandbox side effect ${e.side_effect?.executed ? 'executed' : 'not executed'}. Hash ${e.event_hash}; previous ${e.prev_hash}.</li>`).join('')
  return `<figure class="evidence-diagram" data-diagram="trace"><div class="diagram-scroll" tabindex="0" role="group" aria-label="TR-A002 hash chain; scroll horizontally at intermediate widths">${draw(false)}${draw(true)}</div><ol class="sr-only">${list}</ol><figcaption>Computed from <a href="/proof/tr-a002.json">/proof/tr-a002.json</a>. Re-verify the chain yourself: <code>${escape(summary.verify_command)}</code>. Link labels show the preceding event’s hash; the final node shows the seal.</figcaption></figure>`
}

export function renderPostureCards(): string {
  return PRODUCT_POSTURE.map(p => `<article class="editorial-card"><span class="status status--${p.status === 'Available now' ? 'now' : 'pilot'}"><span class="status__txt">${p.status}</span></span><h3>${p.title}</h3><p>${p.description}</p></article>`).join('')
}
export function renderPostureDiagram(): string {
  const today = PRODUCT_POSTURE.filter(p => p.status === 'Available now'), proposed = PRODUCT_POSTURE.find(p => p.status === 'Proposed architecture')!
  const steps = today.flatMap(p => [...p.steps])
  const draw = (mobile: boolean) => {
    const width = mobile ? 260 : 1000, left = mobile ? 8 : 20, right = mobile ? 8 : 580, top = 94, nextTop = mobile ? 526 : top, boxWidth = mobile ? 244 : 400
    let svg = svgStart('posture', mobile ? 'mobile' : 'desktop', width, mobile ? 940 : 520, 'Origin: current browser workflow and proposed runtime architecture', 'The browser-local synthetic evaluation and artifact checks are available. Controlled execution is proposed, not built. The two lanes do not grant production permission.')
    const laneText = mobile ? ['Synthetic browser workflow ·', 'proposed runtime architecture ·', 'not a customer deployment'] : ['Synthetic browser workflow · proposed runtime architecture · not a customer deployment']
    svg += laneText.map((l,i) => text(left, 22 + i * 18, l, 'diagram-lane', 12)).join('')
    svg += `<g data-current="true"><rect x="${left}" y="${top}" width="${boxWidth}" height="340" rx="8" class="diagram-node"/>`
    svg += text(left + 14, top + 29, 'Runs today, in your browser', '', mobile ? 15 : 20)
    svg += text(left + 14, top + 53, today[0].status, 'diagram-lane', 12)
    steps.forEach((s,i) => { svg += text(left + 14, top + 99 + i * 56, s, '', mobile ? 15 : 18); if (i < steps.length - 1) svg += `<path d="M${left + 28} ${top + 110 + i * 56} v22 m-4 -4 l4 4 4 -4" class="diagram-chain"/>` })
    svg += '</g>'
    if (mobile) svg += `<path d="M130 448 v60 m-5 -6 l5 6 5 -6" class="diagram-line"/>${text(10, 475, 'separately agreed pilot work', '', 12)}`
    else svg += `<path d="M432 259 H568 m-6 -5 l6 5 -6 5" class="diagram-line"/>${text(435, 225, 'separately agreed', '', 12)}${text(461, 244, 'pilot work', '', 12)}`
    svg += `<g data-proposed="true"><rect opacity="0.6" x="${right}" y="${nextTop}" width="${boxWidth}" height="340" rx="8" class="diagram-node" stroke-dasharray="7 5"/>`
    svg += text(right + 14, nextTop + 29, 'Proposed — not built', '', mobile ? 16 : 20)
    svg += text(right + 14, nextTop + 53, proposed.status, 'diagram-lane', 12)
    proposed.steps.forEach((s,i) => { svg += text(right + 14, nextTop + 99 + i * 56, s, '', mobile ? 15 : 18) })
    return svg + '</g></svg>'
  }
  return `<figure class="evidence-diagram" data-diagram="posture">${draw(false)}${draw(true)}<figcaption>The browser workflow evaluates a selected policy against synthetic tasks and rechecks artifact integrity. Controlled execution is proposed and requires separately agreed pilot work; no customer deployment or runtime enforcement is claimed.</figcaption></figure>`
}

export function evidenceDiagrams(): Plugin {
  return { name: 'origin-evidence-diagrams', transformIndexHtml(html, context) {
    const root = resolve(context.filename, '..')
    if (html.includes('<!-- ORIGIN:TRACE -->')) {
      const trace = JSON.parse(readFileSync(resolve(root, 'public/proof/tr-a002.json'), 'utf8')) as Trace
      const summary = JSON.parse(readFileSync(resolve(root, 'public/proof/tr-a002-summary.json'), 'utf8')) as Summary
      html = html.replace('<!-- ORIGIN:TRACE -->', renderTraceDiagram(trace, summary))
    }
    return html.replace('<!-- ORIGIN:POSTURE -->', renderPostureDiagram()).replace('<!-- ORIGIN:POSTURE_CARDS -->', renderPostureCards())
  } }
}
