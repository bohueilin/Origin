// Fleet → Robot → Credential permissions — a thin identity roster layered over the EXISTING
// grant model. There is no new permission engine here: a "robot" is just a stable agent_id
// string, and "assigning a credential" creates one ordinary `credential_grant` (agentId =
// robot.agent_id, vaultRef/itemRef from the catalog item). The broker already matches grants
// on the free-text agent_id, so every assignment is brokered, revocable, and audited the same
// way an advanced per-grant is — only the grouping (fleet/robot) is new, and it lives entirely
// in the client as a demo roster.
//
// Fail-soft like store.ts: when `insforge` is null, the roster still renders (in-memory) and
// the grant calls no-op rather than throw, so the matrix is demoable fully offline.

import { insforge } from '../insforge'
import { createGrant, listGrants, revokeGrant, type IntegrationConnection, listIntegrations } from './store'
import { REPRESENTATIVE_VAULT, type VaultItem, isRepresentative } from './mockVault'
import type { CredentialGrant, CredentialScope, ApprovalPolicy } from './types'

// ---- Roster (demo, deterministic, in-memory) ----------------------------------

export interface Fleet {
  id: string
  name: string
  /** 0..5 — drives the colored left-rail accent. */
  colorIndex: number
}

export type RobotType = 'Pick-and-place' | 'AMR' | 'Inspection' | 'Sortation' | 'Welding' | 'Palletizer'

export interface Robot {
  id: string
  fleetId: string
  name: string
  /** The stable identity the broker matches grants on (e.g. 'fleet-a-robot-1'). */
  agentId: string
  type: RobotType
}

const FLEET_NAMES = ['Fleet A', 'Fleet B', 'Fleet C', 'Fleet D', 'Fleet E', 'Fleet F']
const ROBOT_TYPES: RobotType[] = ['Pick-and-place', 'AMR', 'Inspection', 'Sortation', 'Welding', 'Palletizer']

// Deterministic 6 fleets × 6 robots = 36 robots, built once and frozen for the session. The
// agent_id is slugged from the fleet letter + robot index so it's stable and human-legible.
const FLEETS: Fleet[] = FLEET_NAMES.map((name, i) => ({ id: `fleet-${String.fromCharCode(97 + i)}`, name, colorIndex: i }))

const ROBOTS: Robot[] = FLEETS.flatMap((f) =>
  Array.from({ length: 6 }, (_, j) => {
    const n = j + 1
    return {
      id: `${f.id}-robot-${n}`,
      fleetId: f.id,
      name: `${f.name} · Robot ${n}`,
      agentId: `${f.id}-robot-${n}`, // e.g. 'fleet-a-robot-1'
      type: ROBOT_TYPES[(f.colorIndex + j) % ROBOT_TYPES.length],
    }
  }),
)

/** The 6 demo fleets, colored. */
export function listFleets(): Fleet[] {
  return FLEETS
}

/** The 6 robots in a fleet (or all 36 when no fleet is given). */
export function listRobots(fleetId?: string): Robot[] {
  return fleetId ? ROBOTS.filter((r) => r.fleetId === fleetId) : ROBOTS
}

/** Look up one robot by its id. */
export function getRobot(robotId: string): Robot | undefined {
  return ROBOTS.find((r) => r.id === robotId)
}

/** Deterministically "seed" the demo fleet. The roster is in-memory + frozen, so this just
 *  returns it (fail-soft when `insforge` is null, mirroring store.ts). Kept as a named entry
 *  point so the UI has one obvious call to establish the 36-robot demo. */
export function seedDemoFleet(): { fleets: Fleet[]; robots: Robot[]; backed: boolean } {
  return { fleets: FLEETS, robots: ROBOTS, backed: Boolean(insforge) }
}

// ---- Vault catalog (titles + refs only) ---------------------------------------

/** The credential catalog the matrix assigns from. Today this returns the representative
 *  roster directly (no value, ever); when the broker goes live the `op:'catalog'` path in
 *  store.listVaultItems() supplies the real item list and the UI uses that instead. Kept
 *  here too so a caller that only wants the static roster (e.g. a test) has a sync entry. */
export function listVaultItems(): VaultItem[] {
  return REPRESENTATIVE_VAULT
}

export { isRepresentative }

// ---- Assignment = one ordinary grant per (robot, item) ------------------------

const DEFAULT_SCOPE: CredentialScope = 'api_read'

/** Map a scope to its approval policy exactly as the advanced grant form does: low-risk
 *  scopes auto-approve, everything else is step-up. Keeps fleet grants consistent with the
 *  rest of the broker. */
function policyFor(scope: CredentialScope): ApprovalPolicy {
  const LOW: CredentialScope[] = ['api_read', 'login_session', 'cli_auth']
  return LOW.includes(scope) ? 'auto_low_risk' : 'approval_required'
}

export interface AssignInput {
  robot: Robot
  item: VaultItem
  scope?: CredentialScope
  expiresAt: number // epoch ms
  usageLimit?: number // 0 = unlimited
}

/**
 * THE MISSING WIRE. Assign a catalog credential to a robot → create one real
 * `credential_grant` whose agent_id is the robot's identity and whose vaultRef/itemRef point
 * at the chosen vault item. The broker resolves it server-side, JIT, never handing the robot
 * a secret. Fail-soft: returns null when there's no backend.
 */
export async function assignCredential(input: AssignInput): Promise<CredentialGrant | null> {
  const scope = input.scope ?? DEFAULT_SCOPE
  return createGrant({
    agentId: input.robot.agentId,
    // onepassword grants are the resolvable path: vaultRef/itemRef let the broker build a
    // valid op://vault/item ref. (Wallet scopes would use a different provider, but the
    // fleet matrix assigns credential items, so this is always 'onepassword'.)
    provider: 'onepassword',
    targetService: input.item.title,
    // A representative item has no live domain; we derive a stable, descriptive pseudo-domain
    // from the title so the grant has a non-empty target_domain (the broker requires one).
    targetDomain: `${input.item.itemRef}.${input.item.vaultRef}.vault`.toLowerCase(),
    scope,
    approvalPolicy: policyFor(scope),
    expiresAt: input.expiresAt,
    usageLimit: Math.max(0, input.usageLimit ?? 0),
    vaultRef: input.item.vaultRef,
    itemRef: input.item.itemRef,
  })
}

/** Revoke a single robot↔credential assignment (one grant). Thin pass-through to the existing
 *  grant revoke so the audit trail + RLS are identical to per-grant revoke. */
export async function revokeRobotCredential(grantId: string): Promise<boolean> {
  return revokeGrant(grantId)
}

/** The grants currently assigned to one robot — the matrix reads this to show "what can this
 *  robot reach right now". Filters the full grant list by agent_id (= robot.agentId), since
 *  the broker keys authority off that string. */
export async function listRobotGrants(robotId: string): Promise<CredentialGrant[]> {
  const robot = getRobot(robotId)
  if (!robot) return []
  const all = await listGrants()
  return all.filter((g) => g.agentId === robot.agentId)
}

/** All grants for every robot in a fleet — used for the fleet-level summary counts. */
export async function listFleetGrants(fleetId: string): Promise<Record<string, CredentialGrant[]>> {
  const robots = listRobots(fleetId)
  const ids = new Set(robots.map((r) => r.agentId))
  const all = await listGrants()
  const out: Record<string, CredentialGrant[]> = {}
  for (const r of robots) out[r.id] = []
  for (const g of all) {
    if (g.agentId && ids.has(g.agentId)) {
      const r = robots.find((x) => x.agentId === g.agentId)
      if (r) out[r.id].push(g)
    }
  }
  return out
}

/** Is the broker linked to a live 1Password vault, or running representative? Reads the
 *  owner's integration connections; a connected onepassword integration with a vault name is
 *  the "linked" signal. (Whether the *broker* is truly live still depends on the server token;
 *  the catalog probe via store.listVaultItems is the authoritative live check — this is the
 *  cheap roster-side hint.) */
export async function readVaultLink(): Promise<{ linked: boolean; vault: string | null; connection: IntegrationConnection | null }> {
  const conns = await listIntegrations()
  const op = conns.find((c) => c.provider === 'onepassword' && c.status !== 'revoked')
  const vault = op ? (op.metadata.vault as string | undefined) ?? null : null
  return { linked: Boolean(op && vault), vault, connection: op ?? null }
}
