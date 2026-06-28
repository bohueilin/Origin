// Delegation — attenuated delegation chain (Passport feature #2 / P5).
//
// The multi-agent roster is modeled as a delegation TREE in which authority only ever NARROWS
// and attribution survives every hop:
//
//   you (rootPrincipal, holds the human's full authority)
//     └─ orchestrator (holds the full TASK grant — the issued CapabilityGrant)
//          ├─ Calendar Agent   (holds ONLY calendar.read … — a strict subset)
//          ├─ Ride Agent       (holds ONLY ride.estimate, ride.booking.prepare …)
//          └─ … one node per worker the scenario actually uses
//
// Attenuation is GENUINE, not cosmetic:
//   child.capabilities = (caps the worker's role actually needs)  ∩  parent.capabilities
// so child.caps ⊆ parent.caps is guaranteed by construction (we intersect), and every node's
// TTL is ≤ its parent's TTL. Every node records parentId and attributesTo — and attributesTo
// is ALWAYS the original human ('you'), so no hop can launder away who is ultimately
// responsible for the action.

import type { Capability, CapabilityGrant } from '../types'
import type { ScenarioSpec, StepSpec } from '../scenarios/types'
import { getConnector } from '../connectors'
import { workerForTool } from '../agents'

export const ROOT_PRINCIPAL_ID = 'you'

export interface DelegationNode {
  id: string
  label: string
  role: string
  capabilities: Capability[]
  parentId: string | null
  /** Human-readable TTL, e.g. "≤ 90 min". Always ≤ the parent's TTL. */
  ttlLabel: string
  /** The original human this authority is always attributed back to. */
  attributesTo: string
  depth: number
}

export interface DelegationTree {
  rootPrincipal: string
  nodes: DelegationNode[]
}

/** A child grant attenuated from a parent grant: caps narrowed to a subset, TTL never longer. */
export interface AttenuatedGrant {
  parent_grant_id: string
  agent_id: string
  capabilities: Capability[]
  ttl_seconds: number
  scope: string
  attributesTo: string
}

function ttlLabel(seconds: number): string {
  if (seconds >= 3600) {
    const h = seconds / 3600
    return `≤ ${Number.isInteger(h) ? h : h.toFixed(1)} h`
  }
  return `≤ ${Math.round(seconds / 60)} min`
}

/** The capability a step exercises (read/prepare via connector, or commit via packet). */
function stepCapability(spec: StepSpec): Capability | null {
  if (spec.kind === 'tool') return getConnector(spec.tool)?.requiredCapability ?? null
  if (spec.kind === 'approval') return spec.packet.capability
  return null
}

/** The tool a step routes through (read tool, or commit tool). */
function stepTool(spec: StepSpec): string | null {
  if (spec.kind === 'tool') return spec.tool
  if (spec.kind === 'approval') return spec.commitTool
  return null
}

/**
 * Compute, per worker agent, the set of capabilities that worker's ROLE actually needs in this
 * scenario — derived from the steps it owns. This is the "needs" set, before intersection.
 */
function workerNeeds(scenario: ScenarioSpec): Map<string, { role: string; label: string; caps: Set<Capability> }> {
  const byWorker = new Map<string, { role: string; label: string; caps: Set<Capability> }>()
  for (const spec of scenario.steps) {
    const tool = stepTool(spec)
    const cap = stepCapability(spec)
    if (!tool || !cap) continue
    const w = workerForTool(tool)
    let entry = byWorker.get(w.id)
    if (!entry) {
      entry = { role: w.role, label: w.name, caps: new Set<Capability>() }
      byWorker.set(w.id, entry)
    }
    entry.caps.add(cap)
  }
  return byWorker
}

export const Delegation = {
  /**
   * Build the delegation tree for a run. Authority narrows at every hop:
   *   root (you)  ⊇  orchestrator (full task grant)  ⊇  each worker (intersected subset).
   */
  build(grant: CapabilityGrant, scenario: ScenarioSpec): DelegationTree {
    // The full task envelope the orchestrator holds = everything the grant covers.
    const taskCaps = uniq([...grant.allowed_capabilities, ...grant.requires_approval_for])
    const parentSet = new Set<Capability>(taskCaps)
    const grantTtl = grant.ttl

    const nodes: DelegationNode[] = []

    // depth 0 — the human principal. Holds the human's authority; attributes to itself.
    nodes.push({
      id: ROOT_PRINCIPAL_ID,
      label: 'You',
      role: 'Principal — the human who owns the authority',
      capabilities: taskCaps,
      parentId: null,
      ttlLabel: ttlLabel(grantTtl),
      attributesTo: ROOT_PRINCIPAL_ID,
      depth: 0,
    })

    // depth 1 — the orchestrator. Holds the FULL task grant (no narrowing yet).
    nodes.push({
      id: 'orchestrator',
      label: 'Orchestrator',
      role: 'Holds the full task grant; routes each step',
      capabilities: taskCaps,
      parentId: ROOT_PRINCIPAL_ID,
      ttlLabel: ttlLabel(grantTtl),
      attributesTo: ROOT_PRINCIPAL_ID,
      depth: 1,
    })

    // depth 2 — one node per worker the scenario uses. STRICT SUBSET, intersected with parent.
    // Worker TTLs are attenuated to half the task TTL (floored at 60s) to make narrowing visible.
    const workerTtl = Math.max(60, Math.floor(grantTtl / 2))
    const needs = workerNeeds(scenario)
    for (const [id, info] of needs) {
      const caps = [...info.caps].filter((c) => parentSet.has(c)) // child.caps ⊆ parent.caps
      nodes.push({
        id,
        label: info.label,
        role: info.role,
        capabilities: caps,
        parentId: 'orchestrator',
        ttlLabel: ttlLabel(Math.min(workerTtl, grantTtl)),
        attributesTo: ROOT_PRINCIPAL_ID,
        depth: 2,
      })
    }

    return { rootPrincipal: ROOT_PRINCIPAL_ID, nodes }
  },

  /**
   * Derive an attenuated child grant for a worker that requests authority. The result is
   * GUARANTEED to be a subset of the parent: requested caps are intersected with the parent's
   * caps (anything not held by the parent is dropped), and TTL is clamped to ≤ the parent's.
   */
  attenuate(
    parentGrant: CapabilityGrant,
    childAgentId: string,
    requestedCaps: Capability[],
    requestedTtlSeconds?: number,
  ): AttenuatedGrant {
    const parentSet = new Set<Capability>([
      ...parentGrant.allowed_capabilities,
      ...parentGrant.requires_approval_for,
    ])
    const capabilities = uniq(requestedCaps.filter((c) => parentSet.has(c)))
    const ttl_seconds = Math.min(requestedTtlSeconds ?? parentGrant.ttl, parentGrant.ttl)
    return {
      parent_grant_id: parentGrant.grant_id,
      agent_id: childAgentId,
      capabilities,
      ttl_seconds,
      scope: parentGrant.scope,
      attributesTo: ROOT_PRINCIPAL_ID,
    }
  },

  /**
   * Enforce attenuation at the point a sub-agent acts: a worker may NEVER exceed the
   * capabilities of its attenuated node. Returns true iff `capability` is within the node's
   * subset. (A guard layered on top of — not a replacement for — the ToolRouter grant authz.)
   */
  permits(tree: DelegationTree, agentId: string, capability: Capability): boolean {
    const node = tree.nodes.find((n) => n.id === agentId)
    if (!node) return false
    return node.capabilities.includes(capability)
  },
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}
