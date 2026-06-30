import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PassportSnapshot } from '../../engine/session'
import { capabilityLabel } from '../../capabilities'
import { Section } from '../bits'
import './DelegationChain.css'

type DNode = PassportSnapshot['delegation']['nodes'][number]

/**
 * DelegationChain — visualizes snapshot.delegation as an attenuated authority tree.
 *
 * The principle made structural: authority only ever NARROWS down the chain. Each node renders
 * its capability set as mono chips; a child's chips are split into the genuine subset it KEEPS
 * (held, green) and the parent caps it DROPS at that hop (faded, struck). Hovering or focusing
 * any deep node lights the SVG attribution wires all the way back to YOU and prints
 * "this action, N hops deep, still answers to you."
 */
export function DelegationChain({ snap }: { snap: PassportSnapshot }) {
  const { delegation } = snap
  const nodes = delegation.nodes

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const root = useMemo(() => nodes.find((n) => n.parentId === null) ?? nodes[0], [nodes])
  const orchestrator = useMemo(() => nodes.find((n) => n.depth === 1), [nodes])
  const workers = useMemo(() => nodes.filter((n) => n.depth >= 2), [nodes])

  const maxCaps = useMemo(() => Math.max(1, ...nodes.map((n) => n.capabilities.length)), [nodes])

  // hover/focus trace — the node whose path back to root is highlighted
  const [traced, setTraced] = useState<string | null>(null)

  // the chain of ids from `traced` up to the root principal (inclusive)
  const tracePath = useMemo(() => {
    if (!traced) return [] as string[]
    const path: string[] = []
    let cur: DNode | undefined = byId.get(traced)
    const seen = new Set<string>()
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      path.push(cur.id)
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
    return path
  }, [traced, byId])
  const tracedSet = useMemo(() => new Set(tracePath), [tracePath])

  // --- SVG attribution wires: measure node anchors after layout, redraw on resize ---
  const canvasRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState<Array<{ id: string; childId: string; d: string }>>([])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const measure = () => {
      const base = canvas.getBoundingClientRect()
      const nodeEls = new Map(
        Array.from(canvas.querySelectorAll<HTMLElement>('[data-dc-node-id]')).map((el) => [
          el.dataset.dcNodeId ?? '',
          el,
        ]),
      )
      const next: Array<{ id: string; childId: string; d: string }> = []
      for (const n of nodes) {
        if (!n.parentId) continue
        const childEl = nodeEls.get(n.id)
        const parentEl = nodeEls.get(n.parentId)
        if (!childEl || !parentEl) continue
        const c = childEl.getBoundingClientRect()
        const p = parentEl.getBoundingClientRect()
        // anchor: bottom-center of parent -> top-center of child
        const x1 = p.left + p.width / 2 - base.left
        const y1 = p.bottom - base.top
        const x2 = c.left + c.width / 2 - base.left
        const y2 = c.top - base.top
        const my = (y1 + y2) / 2
        // smooth vertical S-curve so siblings fan cleanly
        const d = `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`
        next.push({ id: `${n.parentId}->${n.id}`, childId: n.id, d })
      }
      setEdges(next)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(canvas)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [nodes])

  if (!root || nodes.length === 0) {
    return (
      <Section
        kicker="6 · Attenuated delegation"
        title="An agent is a delegate, not a principal"
      >
        <div className="dc-root">
          <div className="dc-empty">
            <div className="dc-empty-mark" aria-hidden="true">⌗</div>
            <b>No delegation chain yet</b>
            <span>When a run starts, the task grant flows from you to the orchestrator to each worker — authority narrowing at every hop.</span>
          </div>
        </div>
      </Section>
    )
  }

  return (
    <Section
      kicker="6 · Attenuated delegation"
      title="An agent is a delegate, not a principal"
      aside={<span className="pp-count">{nodes.length} principals · {Math.max(...nodes.map((n) => n.depth))} hops</span>}
    >
      <div className="dc-root">
        <p className="dc-thesis">
          <span className="dc-thesis-mark" aria-hidden="true" />
          <span>
            Authority only ever <b>narrows</b> down the chain — each agent holds a strict subset of its
            parent, and every hop still <b>attributes to you</b>. No agent can grant itself more than it was given.
          </span>
        </p>

        <div className="dc-canvas" ref={canvasRef}>
          <svg className="dc-wires" aria-hidden="true">
            {edges.map((e) => {
              const onTrace = tracedSet.has(e.childId)
              const dim = traced != null && !onTrace
              return (
                <path
                  key={e.id}
                  d={e.d}
                  className={`dc-wire ${onTrace ? 'dc-wire-trace' : ''} ${dim ? 'dc-wire-dim' : ''}`}
                />
              )
            })}
          </svg>

          <div className="dc-levels">
            {/* depth 0 — the human principal */}
            <div className="dc-band">
              <span className="dc-band-tag">
                <span className="dc-hop">hop 0</span> principal
              </span>
              <NodeCard
                node={root}
                parent={undefined}
                maxCaps={maxCaps}
                traced={traced}
                tracedSet={tracedSet}
                onTrace={setTraced}
              />
            </div>

            {/* depth 1 — orchestrator (full task grant) */}
            {orchestrator && (
              <div className="dc-band">
                <span className="dc-band-tag">
                  <span className="dc-hop">hop 1</span> orchestrator · full task grant
                </span>
                <NodeCard
                  node={orchestrator}
                  parent={root}
                  maxCaps={maxCaps}
                  traced={traced}
                  tracedSet={tracedSet}
                  onTrace={setTraced}
                />
              </div>
            )}

            {/* depth 2+ — worker agents (strict subsets) */}
            {workers.length > 0 && (
              <div className="dc-band">
                <span className="dc-band-tag">
                  <span className="dc-hop">hop 2</span> workers · attenuated subsets
                </span>
                <div className="dc-band-workers">
                  {workers.map((w) => (
                    <NodeCard
                      key={w.id}
                      node={w}
                      parent={w.parentId ? byId.get(w.parentId) : undefined}
                      maxCaps={maxCaps}
                      traced={traced}
                      tracedSet={tracedSet}
                      onTrace={setTraced}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {traced && byId.get(traced) ? (
          <TraceCallout node={byId.get(traced)!} path={tracePath} byId={byId} />
        ) : (
          <p className="dc-hint">Hover or focus any agent to trace its authority back to you.</p>
        )}
      </div>
    </Section>
  )
}

function NodeCard({
  node,
  parent,
  maxCaps,
  traced,
  tracedSet,
  onTrace,
}: {
  node: DNode
  parent: DNode | undefined
  maxCaps: number
  traced: string | null
  tracedSet: Set<string>
  onTrace: (id: string | null) => void
}) {
  const isTraced = tracedSet.has(node.id)
  const dim = traced != null && !isTraced

  // genuine subset math: which of the parent's caps this child KEEPS vs DROPS
  const held = new Set(node.capabilities)
  const dropped = parent ? parent.capabilities.filter((c) => !held.has(c)) : []
  const isZero = node.depth >= 2 && node.capabilities.length === 0
  const isRoot = node.depth === 0
  const isOrch = node.depth === 1

  const glyph = useMemo(() => {
    const src = node.label || node.id
    if (isRoot) return 'YOU'
    return src.split(/[\s-]+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || node.id.slice(0, 2).toUpperCase()
  }, [node, isRoot])

  // fraction of the maximum envelope this node holds — drives the "shrinking" read
  const ratio = node.capabilities.length / maxCaps

  return (
    <button
      type="button"
      data-dc-node-id={node.id}
      className={[
        'dc-node',
        isRoot ? 'dc-node-root' : '',
        isOrch ? 'dc-node-orch' : '',
        isZero ? 'dc-node-zero' : '',
        isTraced ? 'dc-node-traced' : '',
        dim ? 'dc-node-dim' : '',
      ].filter(Boolean).join(' ')}
      onMouseEnter={() => onTrace(node.id)}
      onMouseLeave={() => onTrace(null)}
      onFocus={() => onTrace(node.id)}
      onBlur={() => onTrace(null)}
      aria-label={`${node.label}: holds ${node.capabilities.length} ${node.capabilities.length === 1 ? 'capability' : 'capabilities'}, TTL ${node.ttlLabel}, attributes to ${node.attributesTo}`}
    >
      <div className="dc-node-head">
        <span className={`dc-glyph ${isZero ? 'dc-glyph-empty' : ''}`} aria-hidden="true">{glyph}</span>
        <span className="dc-node-id">
          <span className="dc-node-label">{node.label}</span>
          <span className="dc-node-role">{node.role}</span>
        </span>
      </div>

      <div className="dc-node-meta">
        <span className="dc-ttl">{node.ttlLabel}</span>
        <span className="dc-capcount"><b>{node.capabilities.length}</b>/{maxCaps} caps</span>
        <span className="dc-attrib" title={`attributes to ${node.attributesTo}`}>
          <span className="dc-attrib-dot" aria-hidden="true" />
          → {node.attributesTo}
        </span>
      </div>

      <div className="dc-caps">
        {isZero ? (
          <span className="dc-cap-none">
            <span className="dc-cap-none-lock" aria-hidden="true">🔒</span>
            zero authority — attenuation granted nothing
          </span>
        ) : (
          <>
            {node.capabilities.map((c) => (
              <span key={c} className="dc-cap dc-cap-held" title={c}>{capabilityLabel(c)}</span>
            ))}
            {dropped.map((c) => (
              <span key={c} className="dc-cap dc-cap-dropped" title={`${c} — held by parent, not delegated here`}>
                {capabilityLabel(c)}
              </span>
            ))}
          </>
        )}
      </div>

      {parent && !isZero && dropped.length > 0 && (
        <div className="dc-caps-foot">
          subset of <b>{parent.label}</b> — {dropped.length} {dropped.length === 1 ? 'capability' : 'capabilities'} dropped at this hop
        </div>
      )}
      {parent && !isZero && dropped.length === 0 && ratio < 1 && (
        <div className="dc-caps-foot">subset of <b>{parent.label}</b></div>
      )}
    </button>
  )
}

function TraceCallout({
  node,
  path,
  byId,
}: {
  node: DNode
  path: string[]
  byId: Map<string, DNode>
}) {
  const hops = node.depth
  // path is leaf→root; reverse to read root→leaf
  const ordered = [...path].reverse().map((id) => byId.get(id)).filter(Boolean) as DNode[]
  return (
    <div className="dc-callout">
      <div className="dc-callout-path">
        {ordered.map((n, i) => (
          <span key={n.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className={`dc-callout-hop ${n.depth === 0 ? 'dc-callout-hop-root' : ''}`}>
              {n.depth === 0 ? 'YOU' : n.label}
            </span>
            {i < ordered.length - 1 && <span className="dc-callout-arrow" aria-hidden="true">→</span>}
          </span>
        ))}
      </div>
      <span className="dc-callout-text">
        <b>{node.label}</b>{' '}
        {hops === 0 ? (
          <>is the principal — the authority originates here.</>
        ) : (
          <>— this action, <span className="dc-mono">{hops}</span> {hops === 1 ? 'hop' : 'hops'} deep, still answers to <b>you</b>.</>
        )}
      </span>
    </div>
  )
}
