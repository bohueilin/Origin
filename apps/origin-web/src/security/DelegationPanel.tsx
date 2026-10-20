// One delegation graph for /security, /over-grant and build-time HTML.
import { useState, useSyncExternalStore } from 'react'
import { blastRadius, resources as overGrantResources, isSensitive } from '@origin/verifier-core/overGrant'
import type { OverGrantCorpus } from '@origin/verifier-core/overGrant'
import { DemoCard, Log } from './panelUi'

// Six identities, laid out so the whole delegation tree reads at a glance. The
// percentages are computed by the SAME blastRadius() the published bench uses -- widening
// an edge really does change what the root can reach, it is not a typed-in number.
const TREE = [
  { id: 'root', parent: null, x: 300, y: 46, label: 'platform', granted: ['payroll:read', 'customer-pii:read', 'ledger:read', 'wire-transfer:read', 'source-secrets:read', 'dashboards:read'] },
  { id: 'ops', parent: 'root', x: 168, y: 150, label: 'ops', granted: ['payroll:read', 'customer-pii:read', 'dashboards:read'] },
  { id: 'fin', parent: 'root', x: 432, y: 150, label: 'finance', granted: ['ledger:read', 'wire-transfer:read'] },
  { id: 'ops-a', parent: 'ops', x: 96, y: 254, label: 'payroll-bot', granted: ['payroll:read'], widen: 'hr-records:read' },
  { id: 'ops-b', parent: 'ops', x: 240, y: 254, label: 'pii-bot', granted: ['customer-pii:read'], widen: 'prod-db:delete' },
  { id: 'fin-a', parent: 'fin', x: 432, y: 254, label: 'ledger-bot', granted: ['ledger:read'], widen: 'audit-log:read' },
] as const

// Preorder keeps each branch together on narrow screens. Only drawing coordinates
// differ; identities, grants, computation and controls still share TREE.
const NARROW = [
  { id: 'root', x: 26, y: 30 },
  { id: 'ops', x: 56, y: 90 },
  { id: 'ops-a', x: 86, y: 150 },
  { id: 'ops-b', x: 86, y: 210 },
  { id: 'fin', x: 56, y: 270 },
  { id: 'fin-a', x: 86, y: 330 },
] as const

const subscribeToHydration = () => () => {}
const isHydrated = () => true

export function DelegationPanel({ hydrate = false }: { hydrate?: boolean }) {
  // Reserve the controls' space in the initial HTML. A failed script leaves the
  // complete computed baseline visible without presenting inoperative buttons.
  const ready = useSyncExternalStore(subscribeToHydration, isHydrated, () => !hydrate)
  const [widened, setWidened] = useState<ReadonlySet<string>>(new Set())
  const at = (id: string) => TREE.find((n) => n.id === id)!

  const corpus = {
    seed: 1,
    windowDays: 30,
    resources: overGrantResources,
    identities: TREE.map((n) => ({
      id: n.id,
      parent: n.parent,
      owner: 'human-01',
      tainted: false,
      granted: widened.has(n.id) && 'widen' in n ? [...n.granted, n.widen].sort() : [...n.granted],
      granted_day: 0,
      ttl_days: 30,
    })),
    events: [],
    planted: { violationEdges: [], dormantScopes: [] },
  } as unknown as OverGrantCorpus

  const root = blastRadius(corpus).perIdentity.find((p) => p.id === 'root')!
  const sensitive = overGrantResources.filter(isSensitive).length
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`

  const toggle = (id: string) =>
    setWidened((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <DemoCard
      id="delegation"
      kicker="05 · Delegated authority"
      title="Widen one edge. Watch the root's blast radius move."
      lede="A correct capability token can only narrow as it is delegated, so an ancestor reaches exactly its own grant. Break that on any edge and authority flows back up the tree."
    >
      {(['wide', 'narrow'] as const).map((layout) => {
        const narrow = layout === 'narrow'
        const nodes = narrow
          ? NARROW.map(point => ({ ...at(point.id), x: point.x, y: point.y }))
          : TREE
        const pointAt = (id: string) => nodes.find(n => n.id === id)!
        return (
          <svg key={layout} width={narrow ? 220 : 600} height={narrow ? 365 : 300}
            viewBox={narrow ? '0 0 220 365' : '0 0 600 300'} className={`deleg deleg--${layout}`}
            role="img" aria-label={`Delegation tree. Root reaches ${root.reachable} of ${sensitive} sensitive resources.`}>
            <title>Delegation tree</title>
            <desc>Six synthetic identities. A widened child grant adds its scope to every ancestor's effective authority.</desc>
            {nodes.filter((n) => n.parent).map((n) => {
              const p = pointAt(n.parent!)
              const bad = widened.has(n.id)
              const stroke = bad ? 'var(--warn)' : 'var(--line-2)'
              return narrow
                ? <path key={`e-${n.id}`} d={`M ${p.x} ${p.y + 18} V ${n.y} H ${n.x - 18}`}
                    fill="none" stroke={stroke} strokeWidth={bad ? 3 : 1.5} />
                : <line key={`e-${n.id}`} x1={p.x} y1={p.y + 18} x2={n.x} y2={n.y - 18}
                    stroke={stroke} strokeWidth={bad ? 3 : 1.5} />
            })}
            {nodes.filter(n => widened.has(n.id)).map(leaf => {
              let node = leaf
              const segments: string[] = []
              while (node.parent) {
                const parent = pointAt(node.parent)
                segments.push(narrow
                  ? `M ${node.x - 18} ${node.y} H ${parent.x} V ${parent.y + 18}`
                  : `M ${node.x} ${node.y - 18} L ${parent.x} ${parent.y + 18}`)
                node = parent
              }
              return <path key={`inherit-${leaf.id}`} className="deleg__inheritance" d={segments.join(' ')} fill="none" stroke="var(--warn)" strokeWidth="2" strokeDasharray="4 3" />
            })}
            {widened.size > 0 && <circle className="deleg__inheritance" cx={pointAt('root').x} cy={pointAt('root').y} r="24" fill="none" stroke="var(--warn)" strokeWidth="2" />}
            {nodes.map((n) => (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y} r="18" fill={n.id === 'root' ? 'var(--signal)' : 'var(--paper-2)'}
                  stroke={widened.has(n.id) ? 'var(--warn)' : 'var(--line-2)'} strokeWidth={widened.has(n.id) ? 3 : 1.5} />
                <text x={narrow ? n.x + 28 : n.x} y={narrow ? n.y + 5 : n.y + 34}
                  textAnchor={narrow ? 'start' : 'middle'} className="deleg__l">{n.label}</text>
              </g>
            ))}
          </svg>
        )
      })}

      <div className={`deleg__ctl${ready ? " is-ready" : ""}`} style={ready ? undefined : { visibility: "hidden" }}>
        {TREE.filter((n) => 'widen' in n).map((n) => (
          <button key={n.id} type="button" className={`btn btn--ghost btn--sm${widened.has(n.id) ? ' is-on' : ''}`}
            disabled={!ready} aria-pressed={widened.has(n.id)} onClick={() => toggle(n.id)}>
            {widened.has(n.id) ? 'Narrow' : 'Widen'} {n.label}
          </button>
        ))}
      </div>

      <Log status steps={[
        widened.size === 0
          ? { tone: 'ok', label: 'attenuation holds', text: `Every child narrows. The root reaches exactly its own grant: ${root.reachable} of ${sensitive} sensitive resources.` }
          : { tone: 'bad', label: `${widened.size} edge${widened.size > 1 ? 's' : ''} widened`, text: `A descendant now holds a scope its parent never had, so the root inherits it.` },
        { tone: 'info', label: 'blast radius at the root', text: `${root.reachable} / ${sensitive} sensitive resources reachable — BRI ${pct(root.bri)}` },
      ]} />
    </DemoCard>
  )
}
