# Persistence and artifact specification

## Goals

Persistence must make a Witness reproducible, a ProofSet immutable, and a ReleaseProof reviewable after process restarts and snapshot expiry. It must also support safe retries without creating ambiguous duplicate artifacts.

## Backend neutrality

This specification does not select a database or object store. Wave 1 binds records to the repository's existing persistence and artifact interfaces. When no durable interface exists, use the smallest repository-native file-backed manifest store plus existing blob storage; do not introduce a new database for the hackathon.

## Identity and integrity

Use stable opaque ids for human/reference identity and content digests for integrity. A digest covers the canonical manifest content and immutable referenced-file hashes, excluding mutable timestamps or display-only links. The repository's existing canonicalization and hash utilities take precedence.

Minimum identities:

- run id,
- ForkPoint id,
- branch id,
- node id,
- Witness id,
- exploit cluster id,
- control id,
- ProofSet id,
- ReleaseProof id,
- environment and grader versions/digests.

## Immutability

ForkPoints, completed BranchRuns, Witnesses, frozen controls, ProofSets, and ReleaseProofs are append-only records. Correct a bad artifact by superseding it with a new record that names the old id and reason; never mutate evidence in place.

Mutable operational status may exist separately while a run is in progress. Finalization atomically switches status to complete and seals the content digest.

## Snapshot references

A snapshot reference records:

- provider/object identity,
- snapshot mode,
- creation time,
- expiry or indefinite-retention setting,
- content/image digest when available,
- task working-directory boundary,
- source ForkPoint or branch node,
- durable fallback reference.

Directory/Filesystem artifacts used by Witnesses must have an explicit retention decision. A Memory Snapshot reference alone can never satisfy Witness durability.

## Recorded actions

Store the repository-native action/tool envelopes in order, with:

- action index,
- action kind,
- normalized input reference or hash,
- observed output reference or hash,
- side-effect/file-diff link,
- timing metadata needed for diagnosis,
- redaction metadata,
- replay policy for nondeterministic external calls.

Secrets are not stored. If replay requires a secret, store a capability name and resolve it at execution under least privilege.

## Evidence links

Prefer immutable ids or content-addressed artifact paths over transient dashboard URLs. Dashboard links may be added for operator convenience but do not replace durable records.

## Artifact layout

The exact backend is repository-bound. Logically, a finalized Witness contains:

    witness manifest
    pre-attack durable state reference
    history prefix
    recorded actions
    file diff
    verifier output
    QA result
    environment/grader identity
    replay results
    content digest

A ReleaseProof contains its own results and references the sealed ProofSet; it does not copy mutable live taskset state.

## Retention

- Core Witnesses: retain indefinitely or according to an explicit project retention policy strong enough for release regression testing.
- Source traces and controls: retain at least as long as the corresponding release.
- In-progress branches: may use shorter retention after diagnostics and metrics are extracted.
- Memory snapshots: follow provider expiry and are immediately converted on success.
- Failed/unsafe branches: retain only sanitized diagnostic metadata according to security policy.

## Concurrency

Use atomic create/finalize or compare-and-set semantics. Two workers attempting to finalize the same branch id must not produce divergent canonical records. Distinct stochastic attempts always have distinct branch ids even when their seed/configuration match.

## Migration and versioning

Every manifest carries `schema_version`. Readers reject unknown major versions or use an explicit migration path. Avoid speculative version frameworks: add one migration only when a real prior artifact needs reading.

## Redaction

Before persistence, remove credentials, access tokens, environment secrets, and unrelated personal data from prompts, logs, tool outputs, and file evidence. Preserve hashes and redaction markers so replay diagnostics can distinguish “not recorded by policy” from missing data.

## Open questions

- Which repository store supports immutable metadata and large blobs?
- Can provider snapshot retention be set at creation or extended later through the installed SDK?
- How are HUD trace exports and file diffs retained today?
- Is there an existing canonical JSON/hash utility?
- What legal/security retention limit applies to attacker-authored code and logs?
