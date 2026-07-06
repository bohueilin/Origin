import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { track } from '../lib/analytics'
import { DeepDiveContext, type DeepDivePayload } from './deepDiveContext'

export function DeepDiveProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<DeepDivePayload | null>(null)

  const open = useCallback((next: DeepDivePayload) => {
    track('deep_dive', { panel: next.title })
    setPayload(next)
  }, [])
  const close = useCallback(() => setPayload(null), [])
  const value = useMemo(() => ({ open, close }), [open, close])

  return (
    <DeepDiveContext.Provider value={value}>
      {children}
      {payload ? (
        <div className="deepdive-scrim" role="dialog" aria-modal="true" aria-label={payload.title}>
          <button className="deepdive-backdrop" type="button" aria-label="Close" onClick={close} />
          <aside className="deepdive-drawer">
            <header className="deepdive-head">
              <div>
                <p className="deepdive-kicker">Deep dive</p>
                <h3>{payload.title}</h3>
                {payload.subtitle ? <p className="deepdive-sub">{payload.subtitle}</p> : null}
              </div>
              <button className="deepdive-close" type="button" onClick={close} aria-label="Close">
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <div className="deepdive-body">
              {payload.detail ? <div className="deepdive-detail">{payload.detail}</div> : null}
              {payload.data !== undefined ? (
                <>
                  <p className="deepdive-label">Raw structured output (Zod-validated)</p>
                  <pre className="deepdive-json">{JSON.stringify(payload.data, null, 2)}</pre>
                </>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </DeepDiveContext.Provider>
  )
}

/** Small affordance panels use to open their deep dive. */
export function DeepDiveButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="deepdive-trigger" type="button" onClick={onClick}>
      Deep dive
      <span aria-hidden="true">↗</span>
    </button>
  )
}
