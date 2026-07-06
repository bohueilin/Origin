import { Cpu, FlaskConical, GitBranch, Lock, ScrollText, ShieldCheck } from 'lucide-react'

const ITEMS = [
  { icon: Lock, label: 'Server-side secrets' },
  { icon: ShieldCheck, label: 'Deterministic Guardian gates' },
  { icon: FlaskConical, label: 'Synthetic data only' },
  { icon: GitBranch, label: 'Fail-closed + rollback' },
  { icon: ScrollText, label: 'Audit-ready Evidence Pack' },
  { icon: Cpu, label: 'gemma-4-31b on Cerebras' },
]

export function PostureStrip() {
  return (
    <section className="posture-strip" aria-label="Production posture">
      {ITEMS.map(({ icon: Icon, label }) => (
        <span key={label}>
          <Icon size={14} aria-hidden="true" />
          {label}
        </span>
      ))}
    </section>
  )
}
