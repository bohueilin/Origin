import { useMemo, useRef, useState } from 'react'
import recordedRunJson from '../data/recordedRuns.json'
import { loopForgeRunSchema, type LoopForgeRun } from '../lib/schemas'
import { runValidationHarness, summarizeGates } from '../lib/validationHarness'
import { buildRepairLoop, repairTimingFromCalls } from '../lib/repairLoop'
import { getTurnstileToken } from './turnstile'

type RunStatus = 'idle' | 'running-recorded' | 'running-live'

type ApiError = {
  error?: string
  missing?: string
}

function hydrateRun(raw: unknown): LoopForgeRun {
  const parsed = loopForgeRunSchema.parse(raw)
  const gates = runValidationHarness(parsed.patch, parsed.simulations)
  const repair =
    parsed.repair ??
    buildRepairLoop(
      parsed.patch,
      parsed.simulations,
      gates,
      repairTimingFromCalls(parsed.latency.cerebrasCalls),
    )

  return loopForgeRunSchema.parse({
    ...parsed,
    gates,
    repair,
    evidencePack: {
      ...parsed.evidencePack,
      validationSummary: summarizeGates(gates),
    },
  })
}

const recordedRun = hydrateRun(recordedRunJson)

export function useLoopForgeRun() {
  const [run, setRun] = useState<LoopForgeRun>(recordedRun)
  const [status, setStatus] = useState<RunStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const replayCount = useRef(0)

  const modeLabel = useMemo(() => {
    if (run.sourceMode === 'live') {
      return 'Live Cerebras'
    }

    if (run.sourceMode === 'live-fallback') {
      return 'Live fallback'
    }

    return 'Recorded demo'
  }, [run.sourceMode])

  async function runRecorded() {
    setStatus('running-recorded')
    setError(null)
    // Fresh runId so the keyed Speed Race + Repair Loop remount and replay their
    // animations — clicking "Run demo" restarts the visual from the top.
    replayCount.current += 1
    setRun({ ...recordedRun, runId: `${recordedRun.runId}-replay-${replayCount.current}` })
    window.scrollTo({ top: 0, behavior: 'smooth' })
    window.setTimeout(() => setStatus('idle'), 320)
  }

  async function runLive() {
    setStatus('running-live')
    setError(null)

    try {
      const turnstileToken = await getTurnstileToken()
      const response = await fetch('/api/loopforge/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-loopforge-client': 'web',
          'cf-turnstile-token': turnstileToken,
        },
        body: JSON.stringify({ mode: 'live' }),
      })

      const payload = (await response.json()) as unknown

      if (!response.ok) {
        const apiError = payload as ApiError
        const missing = apiError.missing ? ` Missing variable: ${apiError.missing}.` : ''
        setError(`${apiError.error || 'Live run is unavailable.'}${missing}`)
        return
      }

      setRun(hydrateRun(payload))
    } catch {
      setError('Live run is unavailable. Recorded mode remains loaded.')
    } finally {
      setStatus('idle')
    }
  }

  return {
    run,
    status,
    modeLabel,
    isBusy: status !== 'idle',
    error,
    runRecorded,
    runLive,
  }
}
