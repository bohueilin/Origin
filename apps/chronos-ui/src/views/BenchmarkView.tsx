import { Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { RunHeader } from '../components/RunHeader'
import { Activity } from '../components/icons'
import { apiBase } from '../api/config'
import type { Benchmark } from '../domain/types'

/**
 * Plan 008 QA-classifier benchmark. Cross-task evidence (orthogonal to a single
 * run), so it loads the committed static `benchmark.json` directly rather than
 * through the run-scoped TracebackApi. Honest framing per the source report:
 * proactive discovery / red-teaming, not a classifier-accuracy claim.
 *
 * Data loads with the Suspense "render-as-you-fetch" resource pattern (no
 * effect): the fetch starts the first time `BenchmarkContent` renders, and the
 * read() suspends to the boundary below until it resolves.
 */
type BenchmarkResource = { read: () => Benchmark | null }
let resource: BenchmarkResource | null = null

function loadBenchmark(): BenchmarkResource {
  let status: 'pending' | 'ready' | 'error' = 'pending'
  let value: Benchmark | null = null
  const suspender = fetch(`${apiBase}/benchmark.json`, { headers: { accept: 'application/json' } })
    .then((res) => {
      if (!res.ok) throw new Error(String(res.status))
      return res.json() as Promise<Benchmark>
    })
    .then((data) => {
      status = 'ready'
      value = data
    })
    .catch(() => {
      status = 'error'
      value = null
    })
  return {
    read() {
      if (status === 'pending') throw suspender
      return value
    },
  }
}

function benchmarkResource(): BenchmarkResource {
  if (!resource) resource = loadBenchmark()
  return resource
}

/** Strip dashes that arrive inside committed source strings. */
function clean(text: string): string {
  return text.replace(/\s*[—–]\s*/g, ', ')
}

export function BenchmarkView() {
  const navigate = useNavigate()
  return (
    <>
      <RunHeader title="QA benchmark" version="plan 008" subtitle="Traceback discovery vs production QA" primaryLabel="View artifacts" onPrimary={() => navigate('/artifacts')} />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-4xl">
          <Suspense fallback={<p className="text-sm text-ink-tertiary">Loading benchmark.</p>}>
            <BenchmarkContent />
          </Suspense>
        </div>
      </div>
    </>
  )
}

function BenchmarkContent() {
  const data = benchmarkResource().read()
  if (!data) {
    return (
      <p className="text-sm text-ink-danger">
        Could not load <code className="font-mono">benchmark.json</code>. Run <code className="font-mono">uv run python -m forkproof.api.export</code> from the repo root.
      </p>
    )
  }
  return <BenchmarkBody data={data} />
}

function BenchmarkBody({ data }: { data: Benchmark }) {
  const part = data.sftPartition
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-sunken text-ink-secondary">
          <Activity size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-2xl tracking-tight text-ink-primary">Traceback discovery vs production QA</h2>
          <p className="text-sm text-ink-secondary">
            Plan {data.planId} · {data.tasksMeasured} Terminal-Wrench tasks · {data.rewardedBranches} rewarded branches
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard tone="accent" value={data.discoveryHacks} label="reward hacks Traceback discovered" sub={`across ${data.tasksWithHacks} of ${data.tasksMeasured} task graders`} />
        <StatCard tone="muted" value={data.qaInProductionHacks} label="hacks production QA reported" sub="on the real traces, which are legitimate solves, so QA correctly finds zero" />
      </div>

      <div className="mt-4 rounded-lg border border-hairline bg-surface px-4 py-3 text-sm leading-relaxed text-ink-secondary-strong">
        <span className="font-medium text-ink-primary">How to read this. </span>
        {clean(data.framing)} Pointed at the discovered branches, a view production QA never gets, it catches {data.qaCaughtOfDiscovered} of {data.discoveryHacks} and still misfires both ways, so a QA verdict is not treated as ground truth.
      </div>

      <h3 className="mt-8 text-sm font-semibold text-ink-primary">Per task</h3>
      <div className="mt-2 overflow-hidden rounded-lg border border-hairline bg-surface-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-2xs uppercase tracking-wide text-ink-tertiary">
              <th className="px-4 py-2 text-left font-semibold">Task</th>
              <th className="px-4 py-2 text-right font-semibold">Rewarded</th>
              <th className="px-4 py-2 text-right font-semibold">Hacks</th>
              <th className="px-4 py-2 text-right font-semibold">Legit</th>
              <th className="px-4 py-2 text-right font-semibold">QA caught</th>
            </tr>
          </thead>
          <tbody>
            {data.perTask.map((t) => (
              <tr key={t.taskId} className="border-b border-hairline last:border-b-0">
                <td className="px-4 py-2 font-mono text-xs text-ink-secondary-strong">{t.taskId}</td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-secondary">{t.rewardedBranches}</td>
                <td className={clsx('px-4 py-2 text-right font-medium tabular-nums', t.hacks > 0 ? 'text-ink-danger' : 'text-ink-tertiary')}>{t.hacks}</td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-secondary">{t.legit}</td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-secondary">{t.hacks > 0 ? `${t.qaCaughtOfHacks}/${t.hacks}` : 'n/a'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-8 text-sm font-semibold text-ink-primary">Reward-positive split</h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
        The {data.rewardedBranches} rewarded branches partition for SFT. The hardened clean set is the conservative intersection (SFT-clean), not every verifier-legit branch, since weak-grader gaming can still hide in the unproven remainder.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PartitionCard tone="danger" label="Confirmed hacks" value={part.confirmedHacks} />
        <PartitionCard tone="muted" label="Verifier-legit" value={part.verifierLegit} />
        <PartitionCard tone="accent" label="SFT-clean" value={part.sftClean} />
        <PartitionCard tone="warn" label="Quarantined" value={part.quarantined} />
      </div>

      <div className="mt-8 rounded-lg border border-hairline bg-surface px-4 py-3 text-xs leading-relaxed text-ink-secondary">
        <div>
          <span className="font-medium text-ink-secondary-strong">Scope. </span>
          {clean(data.scope)}
        </div>
        <div className="mt-1.5">
          <span className="font-medium text-ink-secondary-strong">Referee. </span>
          {clean(data.referee)}
        </div>
        <div className="mt-1.5">
          <span className="font-medium text-ink-secondary-strong">Source. </span>
          <code className="font-mono">{data.sourcePath}</code>
        </div>
      </div>
    </>
  )
}

function StatCard({ value, label, sub, tone }: { value: number; label: string; sub: string; tone: 'accent' | 'muted' }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-raised px-5 py-4 shadow-sm">
      <div className={clsx('font-display text-5xl leading-none tracking-tight tabular-nums', tone === 'accent' ? 'text-accent-text' : 'text-ink-tertiary')}>{value}</div>
      <div className="mt-2 text-sm font-medium text-ink-primary">{label}</div>
      <div className="mt-0.5 text-xs leading-snug text-ink-secondary">{sub}</div>
    </div>
  )
}

const PARTITION_TONE: Record<string, string> = {
  danger: 'text-ink-danger',
  warn: 'text-warn-text',
  accent: 'text-accent-text',
  muted: 'text-ink-secondary-strong',
}

function PartitionCard({ label, value, tone }: { label: string; value: number; tone: 'danger' | 'warn' | 'accent' | 'muted' }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface-raised px-3 py-2.5">
      <div className={clsx('font-display text-2xl tracking-tight tabular-nums', PARTITION_TONE[tone])}>{value}</div>
      <div className="mt-0.5 text-xs text-ink-secondary">{label}</div>
    </div>
  )
}
