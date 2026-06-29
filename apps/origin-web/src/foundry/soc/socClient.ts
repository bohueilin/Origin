// Thin client for the Autonomy-Control (AI-SOC) routes. Relative base by default (Vite proxies
// /api to the Hono backend). No secrets here — the Cerebras key stays server-side.
import type { SocRunResponse, SocRaceResponse, LeaderboardResponse, SocShootoutResponse, EconomicsResponse, EnsembleResponse } from './socTypes'

const BASE = (import.meta.env.VITE_FOUNDRY_API_BASE as string | undefined)?.replace(/\/+$/, '') ?? ''

async function postJson<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  } catch {
    throw new Error('Autonomy-Control backend unreachable — start it with `npm run foundry` (or `npm run server`).')
  }
  if (!res.ok) throw new Error(`Backend returned ${res.status}. Is the Hono server running?`)
  try {
    return (await res.json()) as T
  } catch {
    throw new Error('Backend sent a non-JSON response — check the server logs.')
  }
}

export const socRun = () => postJson<SocRunResponse>('/api/foundry/soc-run')
export const socRace = () => postJson<SocRaceResponse>('/api/foundry/soc-race')
export const leaderboard = () => postJson<LeaderboardResponse>('/api/foundry/leaderboard')
export const socShootout = () => postJson<SocShootoutResponse>('/api/foundry/soc-shootout')
export const economics = () => postJson<EconomicsResponse>('/api/foundry/economics')
export const ensemble = () => postJson<EnsembleResponse>('/api/foundry/ensemble')
