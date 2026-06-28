import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { ShieldCheck, Check, ArrowRight, ArrowUpRight, Database, ExternalLink, Copy, FileDiff, Download, Loader2, Lock, Sparkles } from '../components/icons'
import { RunHeader } from '../components/RunHeader'
import { RunSummaryFooter } from '../components/RunSummaryFooter'
import { MiniThumb } from '../components/MiniThumb'
import { KV } from '../components/panels'
import { Button, Chip } from '../components/primitives'
import { getRunTreeCounts } from '../lib/runFooter'
import { copyText } from '../lib/copy'
import { useRun } from '../store/RunProvider'

function BigStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-state-green-border bg-state-green-soft py-6">
      <div className="font-display text-5xl tracking-tight text-ink-primary">{value}</div>
      <div className="mt-1 text-sm text-ink-secondary-strong">{label}</div>
      <div className="mt-1 flex items-center gap-1 text-sm font-medium text-accent-text">
        100% <Check size={13} />
      </div>
    </div>
  )
}

function EnvCard({ when, version, status, rows, published }: { when: string; version: string; status: string; rows: [string, string, boolean | null][]; published?: boolean }) {
  return (
    <div className={clsx('rounded-lg border p-4', published ? 'border-state-green-border bg-state-green-soft' : 'border-hairline bg-surface-raised')}>
      <div className="flex items-center justify-between">
            <span className="min-w-0 truncate font-display text-base tracking-tight text-ink-primary">Environment {version}</span>
        <span className="text-2xs font-semibold uppercase tracking-wide text-ink-tertiary">{when}</span>
      </div>
      <div className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between"><span className="text-ink-secondary">{published ? 'Published version' : 'Active version'}</span><span className="font-medium text-ink-primary">{version}</span></div>
        <div className="flex justify-between"><span className="text-ink-secondary">Status</span><span className={clsx('text-2xs font-semibold uppercase', published ? 'text-accent-text' : 'text-ink-secondary-strong')}>{status}</span></div>
        {rows.map(([l, v, ok]) => (
          <div key={l} className="flex justify-between">
            <span className="text-ink-secondary">{l}</span>
            <span className={clsx('flex items-center gap-1 font-medium', ok === null ? 'text-ink-tertiary' : 'text-ink-primary')}>
              {v} {ok === true && <Check size={12} className="text-accent-text" />}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ReleaseProof() {
  const navigate = useNavigate()
  const run = useRun()
  const rp = run.releaseProof

  useEffect(() => {
    if (!rp || rp.status !== 'committed') run.publish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const wk = rp?.witnessesKilled ?? [run.proofSet?.exploitWitnessIds.length ?? 6, run.proofSet?.exploitWitnessIds.length ?? 6]
  const cp = rp?.controlsPreserved ?? [run.proofSet?.legitimateControlIds.length ?? 3, run.proofSet?.legitimateControlIds.length ?? 3]
  const env = rp?.environmentV1 ?? 'mongodb-sales-aggregation-engine'
  const publishedRef = rp?.publishedEnvironmentRef ?? `${env} v2`
  const pubVersion = rp?.publishedVersion ? `v${rp.publishedVersion}` : 'v2'
  const commitId = rp?.commitId ?? 'releaseproof-30e03914472631dd'
  // v6 promote is a UI simulation only: a real registry deploy runs `hud deploy`
  // with HUD credentials in a trusted context, which the static client never holds.
  const [v6, setV6] = useState<'idle' | 'running' | 'done'>('idle')
  const nextVersion = (rp?.publishedVersion ?? 5) + 1
  const v6Ref = publishedRef.replace(/@v\d+$/, `@v${nextVersion}`)
  const simulateV6 = () => {
    if (v6 !== 'idle') return
    setV6('running')
    setTimeout(() => setV6('done'), 1200)
  }
  const reward = (rp?.reward ?? 1.0).toFixed(2)
  const similarity = (rp?.similarity ?? 0.92).toFixed(2)
  const counts = getRunTreeCounts(run)
  const witnessTotal = wk[1]
  const controlTotal = cp[1]
  return (
    <>
      <RunHeader title="Exploit Witness" version="v3.2" primaryLabel="Resume run" onClose={() => navigate('/witness')} />
      <div className="flex min-h-0 flex-1">
        <div className="scrollbar-thin relative min-w-0 flex-1 overflow-y-auto px-8 py-8">
          <div className="relative mx-auto max-w-3xl">
            <div className="flex flex-col items-center text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-accent-text">
                <ShieldCheck size={24} />
              </span>
              <h2 className="mt-3 font-display text-3xl tracking-tight text-ink-primary">Release proof committed</h2>
              <p className="mt-1 text-base text-accent-text">Published to HUD as {pubVersion}</p>
              <p className="mt-1 text-sm text-ink-secondary">Every witness replays to reward 0 and every control stays at reward 1 under the hardened grader.</p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <BigStat value={`${wk[0]} / ${wk[1]}`} label="witnesses killed" />
              <BigStat value={`${cp[0]} / ${cp[1]}`} label="controls preserved" />
            </div>

            <div className="mt-5 grid grid-cols-1 items-center gap-3 xl:grid-cols-[1fr_auto_1fr]">
              <EnvCard
                when="Before"
                version="v1"
                status="Live"
                rows={[
                  ['Witnesses rewarded', `${wk[1]} / ${wk[1]}`, null],
                  ['Controls rewarded', `${cp[1]} / ${cp[1]}`, null],
                  ['Release proof', 'Not committed', null],
                ]}
              />
              <ArrowRight size={20} className="hidden text-ink-tertiary xl:block" />
              <EnvCard
                when="After (published)"
                version={pubVersion}
                status="Published"
                published
                rows={[
                  ['Witnesses blocked', `${wk[0]} / ${wk[1]}`, true],
                  ['Controls preserved', `${cp[0]} / ${cp[1]}`, true],
                  ['Release proof', 'Committed', true],
                ]}
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-state-green-border bg-state-green-soft p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-fill-accent text-ink-inverse"><Database size={18} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-2xs uppercase tracking-wide text-ink-tertiary">Published environment</div>
                <div className="truncate font-mono text-xs font-medium text-ink-primary">{publishedRef}</div>
                <div className="text-xs text-ink-secondary">{rp?.buildStatus ? `HUD build ${rp.buildStatus.toLowerCase()}, append-only.` : 'Published to HUD, append-only.'}</div>
              </div>
              <Button variant="secondary" size="sm" icon={<ExternalLink size={14} />} onClick={() => navigate('/artifacts')}>View in HUD</Button>
            </div>

            {rp?.graderHardeningNote && (
              <div className="mt-3 rounded-lg border border-hairline bg-surface-raised p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles size={15} className="text-accent-text" />
                    <span className="text-sm font-medium text-ink-primary">Promote to hardened v{nextVersion}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface px-2 py-0.5 text-2xs font-medium text-ink-tertiary">
                    <Lock size={11} /> Credentials required
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
                  The v{nextVersion} out-of-process grader is built and kill-proven (witness 0.0, controls 1.0) but the registry is live at {pubVersion}. A real publish runs <code className="font-mono">hud deploy</code> in a trusted context with a HUD API key.
                </p>

                {v6 === 'idle' && (
                  <button
                    type="button"
                    onClick={simulateV6}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium text-ink-primary transition-[background-color,transform] duration-150 ease-out hover:bg-tint-green active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ArrowUpRight size={14} /> Publish v{nextVersion} to HUD
                  </button>
                )}
                {v6 === 'running' && (
                  <div className="mt-3 inline-flex items-center gap-2 text-sm text-ink-secondary-strong">
                    <Loader2 size={14} className="animate-spin text-accent-text" /> Publishing v{nextVersion} to the registry (simulated)…
                  </div>
                )}
                {v6 === 'done' && (
                  <div className="mt-3 rounded-md border border-state-green-border bg-state-green-soft px-3 py-2 text-xs leading-relaxed text-ink-secondary-strong">
                    <span className="inline-flex items-center gap-1 font-medium text-accent-text"><Check size={13} /> Simulated publish</span> to <span className="font-mono">{v6Ref}</span>. No real deploy ran. To publish for real, set <code className="font-mono">HUD_API_KEY</code> and run <code className="font-mono">hud deploy</code> from a trusted context.
                  </div>
                )}

                <p className="mt-3 border-t border-hairline pt-3 text-xs leading-relaxed text-ink-tertiary">
                  <span className="font-medium text-ink-secondary-strong">Hardening note. </span>
                  {rp.graderHardeningNote}
                  {rp.residualLimitation && <> Residual: {rp.residualLimitation}</>}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* right panel */}
        <aside className="flex w-80 shrink-0 flex-col border-l border-hairline bg-background">
          <div className="flex items-center gap-2 px-5 pt-5">
            <ShieldCheck size={16} className="text-accent-text" />
            <h2 className="font-display text-xl tracking-tight text-ink-primary">Release proof</h2>
            <Chip status="witness">COMMITTED</Chip>
          </div>
          <div className="flex-1 px-5 py-4">
            <div className="divide-y divide-hairline">
              <KV label="Environment" valueClass="text-xs">{env}</KV>
              <KV label="Published version">{pubVersion}</KV>
              <KV label="Release proof ID" valueClass="font-mono text-xs">
                <button type="button" onClick={() => copyText(commitId)} className="inline-flex min-w-0 items-center gap-1 rounded-sm transition-[color,transform] duration-150 ease-out hover:text-accent-text active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="truncate">{commitId}</span> <Copy size={11} className="shrink-0 text-ink-tertiary" />
                </button>
              </KV>
              <KV label="Status" valueClass="text-accent-text text-xs font-semibold">COMMITTED</KV>
              <KV label="Reward (H2F)">{reward}</KV>
              <KV label="Similarity">{similarity}</KV>
            </div>
            <div className="mt-4">
              <div className="mb-1 text-sm text-ink-secondary">Notes</div>
              <p className="text-sm text-ink-secondary-strong">All witnesses killed. All controls preserved.</p>
            </div>
            <div className="mt-5 space-y-2">
              <div className="text-2xs font-semibold uppercase tracking-wide text-ink-tertiary">Actions</div>
              <Button variant="primary" size="md" className="w-full" icon={<ExternalLink size={14} />} onClick={() => navigate('/artifacts')}>View release proof</Button>
              <Button variant="secondary" size="md" className="w-full" icon={<FileDiff size={14} />} onClick={() => navigate('/artifacts')}>View state diff</Button>
              <Button variant="secondary" size="md" className="w-full" icon={<Download size={14} />} onClick={() => navigate('/artifacts')}>Download evidence</Button>
            </div>
          </div>
        </aside>
      </div>
      <RunSummaryFooter
        stats={[
          { label: 'Witnesses', value: `${wk[0]} / ${witnessTotal}`, tone: 'green' },
          { label: 'Controls', value: `${cp[0]} / ${controlTotal}`, tone: 'gray' },
        ]}
        total={witnessTotal + controlTotal}
        cards={[
          { icon: 'witness', label: 'Witness', value: counts.witnesses, onClick: () => navigate('/witness') },
          { icon: 'proofset', label: 'Proof set', value: counts.proofSetMembers, onClick: () => navigate('/proofset') },
          { icon: 'releaseproof', label: 'Release proof', value: counts.releaseProofs, onClick: () => navigate('/releaseproof') },
          { icon: 'artifacts', label: 'Evidence artifacts', value: witnessTotal + controlTotal, onClick: () => navigate('/artifacts') },
        ]}
        minimap={<MiniThumb variant="tree" />}
      />
    </>
  )
}
