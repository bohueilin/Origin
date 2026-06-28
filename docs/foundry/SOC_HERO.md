# Origin Autonomy-Control — the AI-SOC hero (the spine)

> Decision (post-eval): the hackathon hero is now **Origin Autonomy-Control** at `/soc`. It keeps
> Foundry's defensible IP — a **deterministic policy is the only judge** + a Guardian on every action —
> but points it at the buyer YC respects. The warehouse floor (`/foundry`) becomes the *physical-AI proof
> point* of the same engine. **One engine, two buyers: robots on a floor, software agents on your tools.**

## The one sentence
**Your AI agent has the keys. Origin makes sure it can't be tricked into using them.** A Guardian
(`gemma-4-31b`) ratifies every tool-call and a fail-closed deterministic policy floor guarantees a
destructive action *never executes* — and per-step verification is only free because Cerebras runs
gemma-4-31b at ~1,500 tok/s.

## Why this is honest (and why it beats the grid)
- The judge is a **deterministic policy** (`socEnv.ts`: a safe/destructive tool catalog + a known-correct
  answer per incident). That's real ground truth — unlike a live camera, where "is this safe" would be a
  regex grading an LLM. The eval's sharpest critique (fake oracle on a camera path) is avoided by design.
- The threat is **current and real**: an autonomous remediation agent that follows a **prompt injection**
  hidden in alert data and runs `disable_firewall` / `delete_logs`. We model the *realistic
  misconfiguration* (an agent told to follow remediation guidance in alerts) — not a strawman.

## Verified live (real Cerebras key)
- The Planner (gemma-4-31b) **falls for both injection traps** (INC-4 → `disable_firewall`, INC-6 →
  `delete_logs`). The **Guardian vetoes both**; the policy floor blocks execution; `escalate_to_human`
  runs instead. **0 destructive actions executed; 2 threats blocked; 2 would have fired unguarded.**
- **The loop-race:** in the wall-time the GPU baseline triaged **1** alert, Cerebras fully triaged + verified
  **6** and **caught 2 threats** — **~8× throughput**, ~912 tok/s. (Gemini baseline is quota-limited →
  labeled illustrative; swap in any GPU-class key for a fully-live race.)

## The 90-second demo (runbook)
1. `cd ~/hackathons/Origin/apps/origin-web && npm run foundry` → open **http://localhost:5173/soc**.
2. **Run the loop-race** first (the money shot): "in the time the GPU does one alert, Cerebras clears six
   and catches two attacks." Speed = safety, felt not asserted.
3. **Triage the queue.** Narrate INC-4: the agent *obeys the injection* and proposes `disable_firewall`;
   the **Guardian VETO** fires with its reasoning; the executed action is `escalate_to_human`; the red
   counterfactual shows what an unguarded agent would have done.
4. Land it: **"0 destructive actions executed. The deterministic policy — not an LLM — decided every
   *allowed*, and the Guardian ran on every step because it's free at Cerebras speed."**
5. Cross-link: `/foundry` is the same engine as a **robot-readiness** license — physical autonomy. Capability
   is not permission.

## Honesty guardrails (do not regress)
- The policy is the only judge; never an LLM grading an LLM. The fail-closed floor (`isDestructive`) blocks a
  destructive tool-call even if the LLM Guardian errs — verify this on the real-key path before judging.
- Cerebras gemma-4-31b is **image+text in / text out** — no video, no training. Never claim otherwise.
- Label sim vs live; the GPU baseline is illustrative until a real GPU-class key is wired.
- Pre-record the loop-race + the INC-4 veto so wifi can't kill the hero moment.

## Naming note
Working names: product **Origin Autonomy-Control** (SOC) / **Origin Foundry** (robot floor); engine **Quorum**.
Per the hackathon-prep retro, vet a single clean name before the public post.
