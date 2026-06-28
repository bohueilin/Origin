import { Link, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { HomeBackdrop } from '../components/HomeBackdrop'
import { Button } from '../components/primitives'
import { ArrowRight, FolderOpen, Play, ShieldCheck } from '../components/icons'

type Step = { title: string; detail: string; dest: string; route: string }

const STEPS: Step[] = [
  { title: 'Open the suspicious HUD trace', detail: 'Inspect the flagged reward-1 trace and its QA ForkPoint.', dest: 'Runs', route: '/runs' },
  { title: 'Confirm the exploit witnesses', detail: 'Walk the seeded branches; verify each deterministic replay.', dest: 'Witness', route: '/witness?focus=confirmed' },
  { title: 'Seal the ProofSet', detail: 'Witnesses that must fail, legitimate controls that must pass.', dest: 'ProofSet', route: '/proofset' },
  { title: 'Replay against the patch', detail: 'Run the release gate: every witness 0, every control 1.', dest: 'Gate', route: '/gate' },
  { title: 'Read the ReleaseProof', detail: 'Before/after evidence, committed and digest-pinned.', dest: 'Release', route: '/releaseproof' },
]

export function HomeView() {
  const navigate = useNavigate()

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
      <HomeBackdrop />
      <div className="scrollbar-thin absolute inset-0 z-10 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center px-8 py-12">
          <section className="w-full max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink-secondary shadow-sm">
              <ShieldCheck size={14} className="text-accent-text" />
              Real run artifacts
            </div>
            <h1 className="mt-4 font-display text-5xl leading-tight tracking-tight text-ink-primary">
              Turn a suspected reward hack into a release proof.
            </h1>
            <p className="mt-5 max-w-xl text-base font-medium leading-relaxed text-ink-primary">
              Across 10{' '}
              <Link
                to="/benchmark"
                className="rounded-sm text-accent-text underline decoration-1 underline-offset-2 transition-opacity hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Terminal Bench
              </Link>{' '}
              tasks, Traceback confirmed 14 grader-subversion hacks that production QA flags none of. Each one becomes a deterministic test and a
              gated patch: the exploit dies, legitimate solutions still pass.
            </p>
            <p className="mt-3 max-w-xl text-base font-medium leading-relaxed text-ink-primary">
              Git for agent trajectories.
            </p>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-secondary-strong">
              A reward hack only shows up deep in a run, once an agent has installed packages, edited files, and pushed the environment into a strange
              state. Tools that restart the task from scratch spend their whole budget getting back there, so the deepest hacks never get found.
            </p>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-secondary-strong">
              Traceback reaches that moment once and snapshots it like a commit, then restores it across parallel sandboxes and sends a different attacker
              down each branch. Every branch starts from the same state and tries a different move, so the budget goes to the exploit instead of the setup.
            </p>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-secondary">
              The five steps below walk one through.
            </p>

            <ol className="mt-7 overflow-hidden rounded-xl border border-hairline bg-surface-raised shadow-sm">
              {STEPS.map((step, i) => (
                <li key={step.route}>
                  <button
                    type="button"
                    onClick={() => navigate(step.route)}
                    className={clsx(
                      'group flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors duration-150 ease-out hover:bg-tint-green active:bg-tint-green focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      i > 0 && 'border-t border-hairline',
                    )}
                  >
                    <span
                      className={clsx(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums',
                        i === 0 ? 'bg-fill-accent text-ink-inverse' : 'border border-hairline bg-surface text-ink-secondary',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink-primary">{step.title}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-ink-secondary">{step.detail}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-tertiary transition-colors duration-150 group-hover:text-ink-secondary-strong">
                      {step.dest}
                      <ArrowRight size={14} className="transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
                    </span>
                  </button>
                </li>
              ))}
            </ol>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button variant="primary" size="md" icon={<Play size={15} />} onClick={() => navigate('/runs')}>
                Start at step 1
              </Button>
              <Button variant="secondary" size="md" icon={<FolderOpen size={15} />} onClick={() => navigate('/artifacts')}>
                Browse evidence artifacts
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
