import { clsx } from 'clsx'
import { GitFork, FileCheck2, ShieldCheck, FolderOpen } from './icons'
import type { ReactNode } from 'react'

export interface SummaryStat {
  label: string
  value: number | string
  tone?: 'green' | 'warn' | 'red' | 'gray'
}

const DOT: Record<string, string> = {
  green: 'bg-fill-accent',
  warn: 'bg-warn',
  red: 'bg-fill-danger',
  gray: 'bg-ink-tertiary',
}

function Stat({ label, value, tone = 'gray' }: SummaryStat) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-sm text-ink-secondary-strong">
      <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', DOT[tone])} />
      <span className="truncate">{label}</span>
      <span className="shrink-0 font-medium tabular-nums text-ink-primary">{value}</span>
    </div>
  )
}

export interface FooterCard {
  icon: 'witness' | 'proofset' | 'releaseproof' | 'artifacts'
  label: string
  value?: number | string
  onClick?: () => void
}

const CARD_ICON = {
  witness: GitFork,
  proofset: FileCheck2,
  releaseproof: ShieldCheck,
  artifacts: FolderOpen,
}

function Card({ icon, label, value, onClick }: FooterCard) {
  const Icon = CARD_ICON[icon]
  const ariaLabel = value === undefined ? label : `${label} ${value}`
  const baseClassName =
    'grid min-h-16 min-w-0 grid-cols-[auto_1fr_auto] grid-rows-[auto_auto] items-center gap-x-2 gap-y-1 rounded-lg border border-hairline bg-surface-raised px-3 py-2 text-left'
  const interactiveClassName =
    'transition-[background-color,border-color,transform] duration-150 ease-out hover:bg-tint-green active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const content = (
    <>
      <Icon size={15} className="col-start-1 row-start-1 shrink-0 text-ink-tertiary" />
      {value !== undefined && <span className="col-start-3 row-start-1 shrink-0 text-sm font-medium tabular-nums text-ink-primary">{value}</span>}
      <span className="col-span-3 row-start-2 min-w-0 text-sm leading-tight text-ink-secondary-strong">{label}</span>
    </>
  )

  if (onClick) {
    return (
      <button type="button" className={clsx(baseClassName, interactiveClassName)} onClick={onClick} aria-label={ariaLabel}>
        {content}
      </button>
    )
  }

  return (
    <div className={baseClassName}>
      {content}
    </div>
  )
}

export function RunSummaryFooter({
  stats,
  total,
  cards,
  minimap,
}: {
  stats: SummaryStat[]
  total?: number | string
  cards: FooterCard[]
  minimap?: ReactNode
}) {
  return (
    <div className="grid min-h-24 grid-cols-1 items-center gap-4 border-t border-hairline bg-background px-8 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(132px,176px)] 2xl:grid-cols-[minmax(360px,520px)_minmax(0,1fr)_minmax(132px,176px)] 2xl:gap-6">
      <div className="hidden min-w-0 grid-cols-4 gap-4 2xl:grid">
          {stats.map((s) => (
            <Stat key={s.label} {...s} />
          ))}
          {total !== undefined && (
            <div className="flex min-w-0 items-center gap-1.5 text-sm text-ink-secondary-strong">
              <span className="truncate">Total</span>
              <span className="shrink-0 font-medium tabular-nums text-ink-primary">{total}</span>
            </div>
          )}
      </div>

      <div className="grid w-full max-w-[960px] grid-cols-2 gap-3 justify-self-center sm:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} {...c} />
        ))}
        {Array.from({ length: Math.max(0, 4 - cards.length) }).map((_, index) => (
          <div key={`empty-${index}`} aria-hidden="true" className="min-h-16" />
        ))}
      </div>

      <div className="hidden w-full max-w-44 items-center justify-self-end lg:flex">
        {minimap}
      </div>
    </div>
  )
}
