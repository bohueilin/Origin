import type { CaptureItem } from '../captureManifest'
import type { SignageCue, SiteArtifactProvenance, SiteHint } from './types'

const CUE_PATTERNS: Array<{
  pattern: RegExp
  cue: string
  normalized: string
  contributesTo: SignageCue['contributesTo']
}> = [
  { pattern: /restricted|no[-_\s]?entry|employees[-_\s]?only|staff[-_\s]?only|human[-_\s]?only/i, cue: 'restricted area', normalized: 'restricted_area', contributesTo: 'restricted_zone' },
  { pattern: /exit|fire[-_\s]?door|stairs|elevator/i, cue: 'egress/signage landmark', normalized: 'egress_landmark', contributesTo: 'landmark' },
  { pattern: /loading[-_\s]?dock|dock[-_\s]?door|receiving/i, cue: 'loading dock', normalized: 'loading_dock', contributesTo: 'landmark' },
  { pattern: /hazard|wet[-_\s]?floor|spill|forklift|danger/i, cue: 'hazard sign', normalized: 'hazard_sign', contributesTo: 'hazard' },
]

export function extractSignageCues(item: CaptureItem, text: string): SignageCue[] {
  return CUE_PATTERNS
    .filter((cue) => cue.pattern.test(text))
    .map((cue, index) => ({
      id: `${item.id}_sign_${index + 1}`,
      cue: cue.cue,
      normalized: cue.normalized,
      sourceItemId: item.id,
      confidence: 0.58,
      contributesTo: cue.contributesTo,
    }))
}

export function cuesToHints(cues: readonly SignageCue[]): SiteHint[] {
  return cues.map((cue) => ({
    id: `${cue.id}_hint`,
    kind: cue.contributesTo === 'restricted_zone' ? 'restricted_zone' : cue.contributesTo === 'hazard' ? 'obstacle' : 'landmark',
    label: `OCR/signage hook detected ${cue.cue}.`,
    confidence: cue.confidence,
    sourceItemIds: [cue.sourceItemId],
  }))
}

export function cuesToProvenance(cues: readonly SignageCue[]): SiteArtifactProvenance[] {
  return cues.map((cue) => ({
    artifactId: cue.id,
    sourceInputId: cue.sourceItemId,
    sourceType: 'photo',
    extractionMethod: 'ocr',
    confidence: cue.confidence,
    requiresReview: true,
    label: `OCR/signage cue: ${cue.cue}`,
    details: 'Bounded deterministic signage hook from file names, notes, and visible cue text; not production OCR.',
  }))
}
