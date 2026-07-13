// The verification-substrate API — the deterministic verdict a GRC platform (Vanta,
// Credo, Holistic) or an insurer embeds BELOW its stack. Pure request→response, no
// secrets, no side effects: give it an agent config + a least-privilege policy posture,
// get back a config-bound reference-check credential, a signed Sigil, and a deterministic
// underwriting signal — all re-verifiable offline without trusting Origin.
//
// This is the "verification-substrate API under the GRC stack" GTM (docs/yc/YC_ANSWERS.md).
// The contract is documented in docs/api/origin-certify.openapi.yaml.
import { issueIamReferenceCheck, iamEnvDigest, IAM_VERSIONS, iamTasks } from '@origin/verifier-core/iamGym'
import { verifyCredential } from '@origin/verifier-core/crucible'
import { underwriteCredential } from '@origin/verifier-core/underwriting'
import { generateSigningKey, signSigil, keyThumbprint } from '@origin/verifier-core/sigil'
import { computeLicenseFromVerdicts, type LicenseVerdict } from '../license'
import { PRESETS, policyForSpec, normalizeAgentConfig, type PolicySpec, type AgentConfig } from './policySpec'

const computeLevel = (v: LicenseVerdict[]) => computeLicenseFromVerdicts(v).level.id

export interface CertifyRequest {
  agent: Partial<AgentConfig> & { tools?: string[] | string }
  policy: string | PolicySpec // a preset key, or an explicit spec
  sign?: boolean // default true — also return a signed Sigil
}

export interface CertifyResponse {
  ok: true
  rsl_level: string
  pass_rate: number
  cold_pass_rate: number
  lift: number
  catastrophic_over_grants: number
  config_digest: string
  env_digest: string
  n_tasks: number
  credential: unknown
  sigil?: unknown
  sigil_thumbprint?: string
  underwriting: unknown
  summary: string
  self_verify_code: number // 0 = the credential re-verifies against the live config
}

export interface CertifyError {
  ok: false
  error: string
}

function resolveSpec(policy: string | PolicySpec): PolicySpec | null {
  if (typeof policy === 'string') return PRESETS[policy]?.spec ?? null
  const keys: (keyof PolicySpec)[] = ['honorRoleAllowlist', 'denyForbidden', 'denyTainted', 'escalateOnApproval', 'autoAllowUpTo']
  if (!policy || keys.some((k) => policy[k] === undefined)) return null
  return policy
}

export async function certify(req: CertifyRequest): Promise<CertifyResponse | CertifyError> {
  const spec = resolveSpec(req.policy)
  if (!spec) return { ok: false, error: 'policy must be a known preset key or a full PolicySpec' }
  const agentConfig = normalizeAgentConfig(req.agent ?? {})

  const policyFor = policyForSpec(spec)
  const result = issueIamReferenceCheck({ agentConfig, policyFor, computeLevel, issuedAt: null })
  const credential = result.credential

  const rv = verifyCredential({ credential, liveConfig: agentConfig, envBundleDigest: iamEnvDigest(), versions: IAM_VERSIONS })
  const underwriting = underwriteCredential(credential)

  const res: CertifyResponse = {
    ok: true,
    rsl_level: credential.rsl_level,
    pass_rate: credential.pass_rate,
    cold_pass_rate: credential.cold_pass_rate,
    lift: credential.lift,
    catastrophic_over_grants: result.catastrophic,
    config_digest: credential.config_digest,
    env_digest: iamEnvDigest(),
    n_tasks: iamTasks.length,
    credential,
    underwriting,
    summary: result.summary,
    self_verify_code: rv.code,
  }

  if (req.sign !== false) {
    const keyPair = await generateSigningKey()
    const sigil = await signSigil(credential, keyPair, { issuer: 'origin-certify-api', kind: 'credential' })
    res.sigil = sigil
    res.sigil_thumbprint = await keyThumbprint(sigil.pubkey_jwk)
  }
  return res
}

export interface VerifyRequest {
  credential: Parameters<typeof verifyCredential>[0]['credential']
  liveConfig?: AgentConfig
}

export function verify(req: VerifyRequest): { ok: boolean; code: number; headline: string } {
  const v = verifyCredential({
    credential: req.credential,
    liveConfig: req.liveConfig ?? req.credential.agent_config,
    envBundleDigest: iamEnvDigest(),
    versions: IAM_VERSIONS,
  })
  const headline =
    v.code === 0 ? 'VALID — reproducible under this verifier + config' : v.code === 4 ? 'VOID — config or environment drift' : 'VOID — tampered or malformed'
  return { ok: v.code === 0, code: v.code, headline }
}
