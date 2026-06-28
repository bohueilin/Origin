// Client-side store for the user's factories and their nested floors. Each floor
// holds the multimodal input the brain ran on plus the last verified run, so the
// profile menu can reopen any floor. Persisted to localStorage — no backend.
import { useCallback, useEffect, useState } from 'react'
import type { BrainInput, BrainRun } from './brainTypes'

export type SavedFloor = {
  id: string
  name: string
  brainInput: BrainInput | null
  run?: BrainRun | null
  industry?: string
  verified?: boolean
  updatedAt: number
}
export type Factory = { id: string; name: string; floors: SavedFloor[] }
export type ProfileState = { factories: Factory[]; currentFactoryId: string | null; currentFloorId: string | null }

const KEY = 'factoryceo.profile.v1'
const uid = () => Math.random().toString(36).slice(2, 9)

function seed(): ProfileState {
  const f: Factory = { id: uid(), name: 'My factory', floors: [] }
  return { factories: [f], currentFactoryId: f.id, currentFloorId: null }
}

function load(): ProfileState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as ProfileState
      if (p.factories?.length) return p
    }
  } catch { /* ignore */ }
  return seed()
}

export function useFactories() {
  const [state, setState] = useState<ProfileState>(load)
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* ignore */ } }, [state])

  const currentFactory = state.factories.find((f) => f.id === state.currentFactoryId) ?? state.factories[0]
  const currentFloor = currentFactory?.floors.find((fl) => fl.id === state.currentFloorId) ?? null

  const addFactory = useCallback((name: string) => {
    const f: Factory = { id: uid(), name: name.trim() || 'Untitled factory', floors: [] }
    setState((s) => ({ ...s, factories: [...s.factories, f], currentFactoryId: f.id, currentFloorId: null }))
    return f.id
  }, [])

  const renameFactory = useCallback((id: string, name: string) => {
    setState((s) => ({ ...s, factories: s.factories.map((f) => (f.id === id ? { ...f, name } : f)) }))
  }, [])

  const removeFactory = useCallback((id: string) => {
    setState((s) => {
      const factories = s.factories.filter((f) => f.id !== id)
      const next = factories.length ? factories : seed().factories
      return { factories: next, currentFactoryId: next[0].id, currentFloorId: null }
    })
  }, [])

  const removeFloor = useCallback((factoryId: string, floorId: string) => {
    setState((s) => {
      const factories = s.factories.map((f) =>
        f.id === factoryId ? { ...f, floors: f.floors.filter((fl) => fl.id !== floorId) } : f,
      )
      return {
        ...s,
        factories,
        currentFloorId: s.currentFloorId === floorId ? null : s.currentFloorId,
      }
    })
  }, [])

  const selectFactory = useCallback((id: string) => {
    setState((s) => ({ ...s, currentFactoryId: id, currentFloorId: null }))
  }, [])

  // Create a new floor under the current factory and make it current.
  const startFloor = useCallback((name: string, brainInput: BrainInput | null) => {
    const floor: SavedFloor = { id: uid(), name: (name || 'New floor').slice(0, 60), brainInput, updatedAt: Date.now() }
    setState((s) => {
      const fid = s.currentFactoryId ?? s.factories[0]?.id
      return {
        ...s,
        currentFactoryId: fid,
        currentFloorId: floor.id,
        factories: s.factories.map((f) => (f.id === fid ? { ...f, floors: [floor, ...f.floors] } : f)),
      }
    })
    return floor.id
  }, [])

  const openFloor = useCallback((factoryId: string, floorId: string) => {
    setState((s) => ({ ...s, currentFactoryId: factoryId, currentFloorId: floorId }))
  }, [])

  // Attach the brain's verified run to the current floor (called after a run).
  const saveRun = useCallback((run: BrainRun) => {
    setState((s) => {
      if (!s.currentFloorId) return s
      const industry = run?.intake?.industry
      const verified = run?.region?.verified ?? (run?.episode?.repair_trace?.length ? true : undefined)
      return {
        ...s,
        factories: s.factories.map((f) =>
          f.id !== s.currentFactoryId
            ? f
            : { ...f, floors: f.floors.map((fl) => (fl.id === s.currentFloorId ? { ...fl, run, industry, verified, updatedAt: Date.now() } : fl)) },
        ),
      }
    })
  }, [])

  return {
    state, currentFactory, currentFloor,
    addFactory, renameFactory, removeFactory, removeFloor, selectFactory,
    startFloor, openFloor, saveRun,
  }
}
export type FactoriesApi = ReturnType<typeof useFactories>
