# Autonomy License for Physical AI — 90-second YC demo

**One-liner:** *Turn factory footage into a robot safety eval. We prove when a robot
should finish, escalate, or refuse — and issue the autonomy license for that exact site.*

## Setup (before you present)
- Terminal: `npm run dev -- --host 127.0.0.1 --port 5176 --strictPort`
  (use a fresh port to avoid a stale tab; for the live server path also run
  `npm run server` so evidence can persist — optional for the visual demo).
- Open the printed URL. Start on the **Landing** screen, full-screen, light mode.
- The Capture form is pre-filled with the "dad's factory" example, so you can move fast.
- Trust line to keep saying: **the deterministic oracle decides — never an LLM.**

## The 90-second arc

**0:00–0:12 — Landing (the hook).**
"Robots are entering human workplaces faster than anyone can prove they're safe."
Point at the headline *Turn factory footage into a robot safety eval* and the upload
console preview. "You start by uploading real workflow footage." Click **Upload
workflow video**.

**0:12–0:28 — Capture (media-first).**
"Drop in the video, photos, floor plan, SOPs, forbidden examples — or a Google Drive
link. In this demo we capture metadata only; nothing is uploaded or parsed." Point at
the guidance tip ("good footage shows start, item, drop-off, hazards, human-only zones,
robot path"). Click **Analyze workflow**.

**0:28–0:38 — Understand (honest interpretation).**
"The system proposes what it understood — site map, storyboard, finish/escalate/refuse
rules — but it's a draft you confirm. Interpretation is never the judge." Click
**Review proposed workflow**.

**0:38–0:58 — Align (the deployment planner — the wow).**
"This is where the operator becomes the author." Use the **tool palette** to drop a
**Hazard** and a **Human-only** zone, then switch to **Robot** and place **R1, R2** (or
hit **Add robot**). "We're planning a multi-robot deployment; robots are descriptive —
they never change the score." Read the legend (S/I/D/R/Hazard/Human-only/Wall). Click
**Approve workflow**.

**0:58–1:10 — Illustrate (deterministic, not a vibe).**
"Now the frozen workflow runs as a deterministic rollout." Let the robot animate to its
terminal decision; read the captioned reason. "Confirmed by you; scored by the oracle."
Click **Freeze eval**, then on the preview click **Run license eval**.

**1:10–1:30 — License artifact (the close).**
Land on the **certificate band**: tier seal (e.g. L4), *issued for Manufacturing floor /
Humanoid*, the **FAR / FRR operating point**, and the provenance chain
*declared → confirmed → frozen → scored by deterministic oracle*. "FAR is the dangerous
error — acting when it should refuse. A capable-but-reckless agent fails it; a
cautious-but-useless one fails false-reject; only calibrated behavior earns the license."
One-line callout: the **reward-hacking trace** scores 0 — "shaping can't rescue a fake
finish." End: **"That's the driving test for Physical AI."**

## If you have 15 extra seconds
Click **See sample safety case** to show the full FAR/FRR matrix, triptych, and Signal
Extractor JSON export — the training-data byproduct.

## Hard guarantees to name if asked
- Oracle/verifier (BFS) is the source of truth; no LLM judge; reward is hard-gated.
- Uploaded media + robot placement are authoring/provenance only — they cannot set
  labels, rewards, or the license. (Enforced by tests on `frozenToPlanInput`.)
- Deterministic + reproducible; tamper-evident evidence; no model spend in this flow.
