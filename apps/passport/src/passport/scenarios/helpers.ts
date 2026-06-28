// Small helpers shared by scenario finalize() functions.

import type { Capability, ToolResult } from '../types'
import type { FinalizeContext, ItineraryLine } from './types'

export function line(label: string, value: string, tone: ItineraryLine['tone'] = 'default'): ItineraryLine {
  return { label, value, tone }
}

/** Did the user approve the action carrying this commit capability? (approved or already run) */
export function approvedCap(ctx: FinalizeContext, cap: Capability): boolean {
  return ctx.approvals.some((p) => p.capability === cap && (p.status === 'approved' || p.status === 'consumed'))
}

/** Safe summary text from a tool result. */
export function resultStr(result: ToolResult | undefined, fallback: string): string {
  return result?.summary ?? fallback
}
