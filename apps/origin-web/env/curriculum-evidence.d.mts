// Type surface for curriculum-evidence.mjs — CurriculumState sealing (P8), pinned
// to the frozen band registry in src/curriculum.ts (app-coupled by design).
// Hand-written declarations; keep in lockstep with curriculum-evidence.mjs.

export interface CurriculumCompetence {
  pass: number
  total: number
  rate: number
}

export interface CurriculumPromotion {
  from: string | null
  to: string | null
  promoted: boolean
  mastery?: number
  rate?: number
  [key: string]: unknown
}

export interface CurriculumState {
  curriculum_schema_version: string
  curriculum_version: string
  band_registry_digest: string
  policy: string
  active_band: string
  competence: Record<string, CurriculumCompetence>
  promotion: CurriculumPromotion
  evidence_digest: string
}

export const bandRegistryDigest: () => string

export function sealCurriculumState(args: {
  policy: string
  active_band: string
  competence: Record<string, CurriculumCompetence>
  promotion: CurriculumPromotion
}): CurriculumState

/** Self-consistent AND pinned to the frozen band registry (tamper → curriculum:verify exit 3). */
export function verifyCurriculumState(state: CurriculumState): boolean
