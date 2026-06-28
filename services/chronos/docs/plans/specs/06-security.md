# Security specification

## Threat model

Chronos deliberately runs attacker-authored code and prompts inside branches. A branch may try to read secrets, exfiltrate data, mutate the host or sibling branches, persist beyond its lifetime, consume excessive resources, influence grading, or tamper with evidence. Treat every branch as untrusted.

## Isolation requirements

- One isolated sandbox or verified equivalent per branch.
- No shared writable filesystem between sibling branches.
- No host Docker socket, cloud metadata credentials, or broad platform token.
- Only task-required secrets, injected at execution and never persisted in artifacts.
- Network denied by default or allowlisted to the minimum required endpoints.
- CPU, memory, process, disk, wall-clock, and branch-count bounds.
- Clean termination and namespace cleanup on success, failure, timeout, or cancellation.
- Grader execution separated from attacker-controlled plugin/import paths where the real task requires it.

## Credential model

Use capability-specific credentials. The branch agent may need a model gateway credential scoped by run/branch tags; it must not receive HUD publication credentials, infrastructure administration tokens, or unrelated repository secrets. The release/publish step runs in a separate trusted context.

Redact credentials from history, action logs, subprocess output, file diffs, and evidence manifests. Store a capability label, not a secret value.

## Network policy

Document the actual enforceable policy in the repo map. Test one disallowed destination or metadata endpoint using a harmless request. When the platform cannot enforce a required boundary, stop rather than relying on prompt instructions.

## Filesystem and process policy

The branch may write only inside its isolated task state and designated artifact staging area. Snapshot operations must not capture secret mounts or unrelated home directories. A durable Witness is sanitized before retention.

For the MongoDB pytest-subversion example, the verifier must execute in a clean evaluator context that does not auto-load agent-controlled plugins or import paths. The exact patch is decided by harden-v0 and the real grader; the plan does not prescribe a detached toy fix.

## Evidence integrity

- Seal finalized artifacts with content digests.
- Capture environment image and grader digests.
- Write evidence from trusted orchestration, not from the untrusted branch.
- Treat branch-reported success as data only; authoritative reward comes from the grader.
- Treat QA classification as separate signed/linked evidence where available.
- Preserve append-only audit events for promotion and release decisions.

## Abuse and resource controls

Apply bounded branch budgets: about 12 initial branches for core, optional 8-child depth-two expansion, and early stopping. Enforce per-branch timeout and aggregate budget through repository-native controls. A timeout or policy denial becomes a normal failed BranchRun, not a reason to weaken isolation.

## Publication boundary

Only a trusted release process with a passing ReleaseProof may publish environment v2. A branch, fixer sandbox, or demo UI must not hold publication authority. Publication errors do not alter or backfill proof results.

## Security STOP conditions

Stop before attacker execution when:

- secret or network isolation cannot be verified,
- sibling writable state is shared,
- the grader runs inside the same attacker-controlled import/plugin context without a defense boundary,
- evidence can be overwritten by the branch,
- snapshot capture includes prohibited secret mounts,
- resource limits are unavailable for a potentially destructive workload.

## Open questions

- Which Modal/HUD controls enforce egress, secret scope, and resource quotas in this account?
- Does the existing grader already run in a separate trusted sandbox?
- How are branch gateway credentials scoped and rotated?
- What artifact sanitizer/redactor already exists?
- Which security checks are safe in a shared hackathon account?
