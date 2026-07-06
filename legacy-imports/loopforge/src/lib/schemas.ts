import { z } from 'zod'

export const riskTierSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])

export const sourceModeSchema = z.enum(['recorded', 'live', 'live-fallback'])

export const providerModeSchema = z.enum([
  'live',
  'recorded',
  'simulation',
  'fallback',
])

export const providerStatusSchema = z.enum([
  'complete',
  'missing-config',
  'fallback',
  'error',
])

export const expectedRouteSchema = z.enum([
  'verify_then_submit_dispute',
  'explain_pending',
  'explain_ineligible',
  'route_fraud',
  'explain_refunded',
  'escalate_human',
  'verify_then_escalate',
])

export const rootCauseClassTypeSchema = z.enum([
  'MISSING_KNOWLEDGE',
  'AOP_LOGIC_GAP',
  'TOOL_SELECTION_GAP',
  'TOOL_ARGUMENT_GAP',
  'BACKEND_TOOL_FAILURE',
  'AUTHENTICATION_GAP',
  'POLICY_AMBIGUITY',
  'COMPLIANCE_RISK',
  'MODEL_BEHAVIOR',
  'USER_AMBIGUITY',
  'ABUSE_OR_ADVERSARIAL_INPUT',
])

export const gateStatusSchema = z.enum(['pass', 'fail', 'warn'])

export const incidentSchema = z
  .object({
    id: z.string(),
    channel: z.string(),
    quote: z.string(),
    qaFlag: z.string(),
    workflow: z.string(),
    severity: riskTierSchema,
    amountCents: z.number().int().nonnegative(),
    chargeStatus: z.enum(['posted', 'pending', 'refunded', 'unknown']),
    authenticated: z.boolean(),
    intent: z.string(),
  })
  .strict()

export const policySnippetSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    body: z.string(),
    owner: z.string(),
  })
  .strict()

export const toolTraceSchema = z
  .object({
    incidentId: z.string(),
    trace: z.array(
      z
        .object({
          step: z.string(),
          tool: z.string(),
          status: z.string(),
          note: z.string(),
        })
        .strict(),
    ),
  })
  .strict()

export const clusterSchema = z
  .object({
    name: z.string(),
    volume: z.number().int().nonnegative(),
    impactEstimate: z.string(),
    affectedWorkflow: z.string(),
    riskTier: riskTierSchema,
    representativeEvidence: z.array(z.string()),
  })
  .strict()

export const rootCauseClassSchema = z
  .object({
    type: rootCauseClassTypeSchema,
    applies: z.boolean(),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string()),
    whyNotPrimary: z.string(),
  })
  .strict()

export const rootCauseAnalysisSchema = z
  .object({
    primaryClass: rootCauseClassTypeSchema,
    summary: z.string(),
    classes: z.array(rootCauseClassSchema),
    whyOtherCausesNotPrimary: z.array(z.string()),
  })
  .strict()

export const semanticDiffSchema = z
  .object({
    area: z.string(),
    before: z.string(),
    after: z.string(),
    risk: riskTierSchema,
  })
  .strict()

export const patchControlsSchema = z
  .object({
    requiresIdentityBeforeDetails: z.boolean(),
    blocksPendingCharges: z.boolean(),
    routesFraudLanguage: z.boolean(),
    escalatesHighDollar: z.boolean(),
    requiresProvisionalCreditDisclosure: z.boolean(),
    requiredToolFields: z.array(z.string()),
  })
  .strict()

export const workflowPatchSchema = z
  .object({
    title: z.string(),
    summary: z.string(),
    riskTier: riskTierSchema,
    beforeBehavior: z.array(z.string()),
    afterBehavior: z.array(z.string()),
    semanticDiff: z.array(semanticDiffSchema),
    affectedTools: z.array(z.string()),
    approvalRequirements: z.array(z.string()),
    failClosedRule: z.string(),
    rollbackNote: z.string(),
    controls: patchControlsSchema,
  })
  .strict()

const toolArgValueSchema = z.union([z.string(), z.number(), z.boolean()])

export const toolPayloadArgsSchema = z
  .object({
    customerId: toolArgValueSchema.optional(),
    chargeId: toolArgValueSchema.optional(),
    chargeStatus: toolArgValueSchema.optional(),
    transactionDate: toolArgValueSchema.optional(),
    amountCents: toolArgValueSchema.optional(),
    disputeReason: toolArgValueSchema.optional(),
    idempotencyKey: toolArgValueSchema.optional(),
    provisionalCreditDisclosed: z.boolean().optional(),
    reason: toolArgValueSchema.optional(),
  })
  .strict()

export const toolPayloadSchema = z
  .object({
    tool: z.string(),
    args: toolPayloadArgsSchema,
  })
  .strict()

export const simulationSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    persona: z.string(),
    input: z.string(),
    scenarioTags: z.array(z.string()),
    amountCents: z.number().int().nonnegative(),
    chargeStatus: z.enum(['posted', 'pending', 'refunded', 'unknown']),
    authenticated: z.boolean(),
    containsFraudLanguage: z.boolean(),
    containsPromptInjection: z.boolean(),
    merchantAlreadyRefunded: z.boolean(),
    requireDisclosure: z.boolean(),
    expectedRoute: expectedRouteSchema,
    expectedBehavior: z.string(),
    hardFailConditions: z.array(z.string()),
    generatedToolPayload: toolPayloadSchema.nullable(),
  })
  .strict()

export const simulationsOutputSchema = z
  .object({
    simulations: z.array(simulationSchema),
  })
  .strict()

export const validationGateSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    status: gateStatusSchema,
    severity: riskTierSchema,
    detail: z.string(),
    evidence: z.string(),
  })
  .strict()

export const ingestFieldSchema = z
  .object({
    label: z.string(),
    value: z.string(),
  })
  .strict()

export const ingestSchema = z
  .object({
    source: z.string(),
    modality: z.string(),
    model: z.string(),
    imageTokens: z.number().int().nonnegative(),
    inferenceMs: z.number().nonnegative(),
    caption: z.string(),
    fields: z.array(ingestFieldSchema),
    note: z.string(),
  })
  .strict()

export const repairAttemptSchema = z
  .object({
    iteration: z.number().int().nonnegative(),
    label: z.string(),
    gates: z.array(validationGateSchema),
    passCount: z.number().int().nonnegative(),
    failCount: z.number().int().nonnegative(),
    cerebrasMs: z.number().nonnegative(),
    summary: z.string(),
  })
  .strict()

export const repairLoopSchema = z
  .object({
    iterations: z.number().int().positive(),
    resolved: z.boolean(),
    resolvedMs: z.number().nonnegative(),
    attempts: z.array(repairAttemptSchema).min(1),
  })
  .strict()

export const evidencePackSchema = z
  .object({
    issueSummary: z.string(),
    conversationEvidence: z.array(z.string()),
    rootCauseHypothesis: z.string(),
    semanticDiff: z.array(semanticDiffSchema),
    validationSummary: z.string(),
    riskTier: riskTierSchema,
    expectedImpact: z.string(),
    rolloutRecommendation: z.string(),
    postLaunchMonitors: z.array(z.string()),
    reviewerDecisionOptions: z.array(z.string()),
  })
  .strict()

export const providerLatencySchema = z
  .object({
    provider: z.string(),
    label: z.string(),
    model: z.string(),
    mode: providerModeSchema,
    status: providerStatusSchema,
    totalMs: z.number().nonnegative(),
    queueMs: z.number().nonnegative().nullable(),
    completionMs: z.number().nonnegative().nullable(),
    promptTokens: z.number().int().nonnegative().nullable(),
    completionTokens: z.number().int().nonnegative().nullable(),
    tokensPerSecond: z.number().nonnegative().nullable(),
    note: z.string(),
  })
  .strict()

export const cerebrasCallTraceSchema = providerLatencySchema.extend({
  task: z.string(),
})

export const latencyRaceSchema = z
  .object({
    cerebras: providerLatencySchema,
    baseline: providerLatencySchema,
    cerebrasCalls: z.array(cerebrasCallTraceSchema).min(1),
    winner: z.enum(['cerebras', 'baseline', 'tie']),
    speedup: z.number().positive(),
  })
  .strict()

export const loopForgeRunSchema = z
  .object({
    runId: z.string(),
    sourceMode: sourceModeSchema,
    scenario: z.string(),
    createdAt: z.string(),
    activeStep: z.string(),
    ingest: ingestSchema.optional(),
    cluster: clusterSchema,
    rootCause: rootCauseAnalysisSchema,
    patch: workflowPatchSchema,
    simulations: z.array(simulationSchema).min(8),
    gates: z.array(validationGateSchema).min(8),
    repair: repairLoopSchema.optional(),
    evidencePack: evidencePackSchema,
    latency: latencyRaceSchema,
    providerNotes: z.array(z.string()),
  })
  .strict()

export type Incident = z.infer<typeof incidentSchema>
export type PolicySnippet = z.infer<typeof policySnippetSchema>
export type ToolTrace = z.infer<typeof toolTraceSchema>
export type Cluster = z.infer<typeof clusterSchema>
export type RootCauseAnalysis = z.infer<typeof rootCauseAnalysisSchema>
export type WorkflowPatch = z.infer<typeof workflowPatchSchema>
export type Simulation = z.infer<typeof simulationSchema>
export type ValidationGate = z.infer<typeof validationGateSchema>
export type IngestField = z.infer<typeof ingestFieldSchema>
export type Ingest = z.infer<typeof ingestSchema>
export type RepairAttempt = z.infer<typeof repairAttemptSchema>
export type RepairLoop = z.infer<typeof repairLoopSchema>
export type EvidencePack = z.infer<typeof evidencePackSchema>
export type ProviderLatency = z.infer<typeof providerLatencySchema>
export type LatencyRace = z.infer<typeof latencyRaceSchema>
export type LoopForgeRun = z.infer<typeof loopForgeRunSchema>
