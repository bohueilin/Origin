import type { ReviewState, SiteToGymRun } from './types'

export const DRAFT_REVIEW_STATE: ReviewState = { status: 'draft' }

export function approveReviewState(notes?: string): ReviewState {
  return {
    status: 'approved',
    reviewerNotes: notes?.trim() || undefined,
    approvedAt: new Date().toISOString(),
  }
}

export function correctionReviewState(notes?: string): ReviewState {
  return {
    status: 'needs_correction',
    reviewerNotes: notes?.trim() || 'Map needs correction before deployment evidence.',
  }
}

export function exportedReviewState(current: ReviewState): ReviewState {
  return {
    ...current,
    status: 'exported',
    exportedAt: new Date().toISOString(),
  }
}

export function reviewRequiresQualification(state: ReviewState): boolean {
  return state.status !== 'approved' && state.status !== 'exported'
}

export function reviewGateCopy(run: Pick<SiteToGymRun, 'reviewState' | 'siteRepresentation'>): string {
  if (run.reviewState.status === 'approved') return 'Approved map: evidence bundle can be treated as a customer-reviewed draft.'
  if (run.reviewState.status === 'exported') return 'Exported bundle: portable pilot evidence, not compliance certification.'
  if (run.reviewState.status === 'needs_correction') return 'Needs correction: export remains draft-only until the map is fixed and approved.'
  if (run.siteRepresentation.requiresHumanReview) return 'Human review required before this Gym becomes deployment-readiness evidence.'
  return 'Draft map ready for human approval.'
}
