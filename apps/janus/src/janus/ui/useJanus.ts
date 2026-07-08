import { useCallback, useEffect, useRef, useState } from 'react'
import { JanusSession } from '../engine/session'
import type { JanusSnapshot } from '../engine/session'
import type { ScenarioSpec } from '../scenarios/types'

export type Speed = 'live' | 'fast' | 'instant'
const PACE: Record<Speed, number> = { live: 640, fast: 300, instant: 0 }

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/** A live, reactive handle to a JanusSession. */
export interface JanusHandle {
  snapshot: JanusSnapshot | null
  scenarioId: string | null
  speed: Speed
  setSpeed(s: Speed): void
  start(scenario: ScenarioSpec): void
  replay(): void
  approve(id: string): void
  deny(id: string): void
  revoke(): void
  reset(): void
}

export function useJanus(): JanusHandle {
  const sessionRef = useRef<JanusSession | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)
  const lastScenarioRef = useRef<ScenarioSpec | null>(null)
  const [snapshot, setSnapshot] = useState<JanusSnapshot | null>(null)
  const [scenarioId, setScenarioId] = useState<string | null>(null)
  const [speed, setSpeed] = useState<Speed>(prefersReducedMotion() ? 'instant' : 'live')
  const speedRef = useRef<Speed>(speed)
  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  const run = useCallback((scenario: ScenarioSpec) => {
    unsubRef.current?.()
    lastScenarioRef.current = scenario
    const session = new JanusSession(scenario, { pace: PACE[speedRef.current] })
    sessionRef.current = session
    setScenarioId(scenario.id)
    const sync = () => setSnapshot(session.getState())
    unsubRef.current = session.subscribe(sync)
    void session.start().then(sync)
    sync()
  }, [])

  const replay = useCallback(() => {
    if (lastScenarioRef.current) run(lastScenarioRef.current)
  }, [run])

  const approve = useCallback((id: string) => {
    void sessionRef.current?.resolveApproval(id, 'approve')
  }, [])
  const deny = useCallback((id: string) => {
    void sessionRef.current?.resolveApproval(id, 'deny')
  }, [])
  const revoke = useCallback(() => {
    sessionRef.current?.revoke()
  }, [])
  const reset = useCallback(() => {
    unsubRef.current?.()
    unsubRef.current = null
    sessionRef.current = null
    lastScenarioRef.current = null
    setSnapshot(null)
    setScenarioId(null)
  }, [])

  return { snapshot, scenarioId, speed, setSpeed, start: run, replay, approve, deny, revoke, reset }
}
