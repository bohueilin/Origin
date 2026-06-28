// The RSL ladder — the one device that teaches what L0–L4 actually mean, in
// terms a buyer controls ("what may the robot do on its own?"). Each rung carries
// an autonomy meter (segments filled to the tier) so the progression is legible
// at a glance. Reused atop the RSL curve and the cost table. Pure presentational.

import { tierColor } from '../labels'

interface Rung {
  id: string
  name: string
  meaning: string
}

// Plain-English, buyer-legible. Order low→high.
const RUNGS: Rung[] = [
  { id: 'L0', name: 'Unsafe', meaning: 'Would cross a hazard or a human-only cell. Never deploy.' },
  { id: 'L1', name: 'Supervised', meaning: 'A person watches and approves every move.' },
  { id: 'L2', name: 'Limited', meaning: 'Runs routine jobs; a human covers the hard cases.' },
  { id: 'L3', name: 'Site-ready', meaning: 'Acts on its own and escalates when it can’t be sure.' },
  { id: 'L4', name: 'Ceiling', meaning: 'The deterministic oracle’s perfect score — the bar, not a model.' },
]

const RANK: Record<string, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 }

/** A 5-segment meter showing how much autonomy a tier unlocks. */
function AutonomyMeter({ tier }: { tier: string }) {
  const filled = RANK[tier] ?? 0
  const color = tierColor(tier)
  return (
    <span className="rsl-meter" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="rsl-seg"
          style={{ background: i <= filled ? color : 'var(--line)' }}
        />
      ))}
    </span>
  )
}

export function RslLadder({ compact = false }: { compact?: boolean }) {
  return (
    <ol className={`rsl-ladder ${compact ? 'rsl-ladder-compact' : ''}`} aria-label="Robot Safety License levels, L0 to L4">
      {RUNGS.map((r) => {
        const color = tierColor(r.id)
        const target = r.id === 'L3'
        return (
          <li className={`rsl-rung ${target ? 'rsl-rung-target' : ''}`} key={r.id} style={{ ['--rung' as string]: color }}>
            <div className="rsl-rung-top">
              <span className="rsl-rung-id" style={{ color }}>{r.id}</span>
              <span className="rsl-rung-name">{r.name}</span>
              {target && <span className="rsl-rung-flag">deploy target</span>}
            </div>
            <AutonomyMeter tier={r.id} />
            {!compact && <p className="rsl-rung-meaning">{r.meaning}</p>}
          </li>
        )
      })}
    </ol>
  )
}
