# Origin — robot readiness for Physical AI

**A robot brain for every floor.** Origin turns a description of your site into a
deterministic safety gym, then issues a readiness license that says — in plain terms a
safety team can sign off on — what a robot may do on its own, where it must ask a human,
and what it must refuse outright.

🔗 **Live demo:** https://origin-physical-ai.pages.dev

---

## Why this exists

Physical AI is moving from labs onto real floors — warehouses, clinics, factories. The
hard question isn't "can the robot move," it's **"is it ready to move near people, on
*this* floor, doing *this* job?"** Origin answers that with one artifact:

> **finish** — the robot may complete the job autonomously
> **escalate** — the robot must pause and call a human
> **refuse** — the robot must never attempt it

This finish / escalate / refuse triad is the through-line of the whole product, paired
with a **Robot Safety Level (RSL)** tier and false-accept / false-reject rates (FAR/FRR)
so you can see exactly how conservative the call is.

## How it works

Origin is a four-step funnel — the same spine from the marketing site through the console:

| Step | What you do | What Origin does |
| --- | --- | --- |
| **1 · Submit your site** | Pick a template, or describe your floor (text, voice, a video/link — metadata only). | Reads it into a structured workflow + floor map. |
| **2 · Build the robot brain** | Review and edit the plan and the safety calls. | Proposes the plan → verifies it → repairs violations. |
| **3 · Run the proving ground** | Lay out robots, items, and drop-off points; watch them run. | Animates a deterministic, collision-free multi-robot deployment. |
| **4 · Get the readiness license** | Read the report. | Scores every scenario and issues the RSL license. |

### The one rule that makes it trustworthy

**A deterministic oracle is the only judge.** Every readiness verdict comes from a
deterministic verifier with a known ground truth — never from a model grading itself. The
multi-robot animation is an honest illustration of deployment intent; it never feeds the
score. "Measured" numbers come from real evaluation runs scored by that verifier;
anything not yet run is labeled **projected**, never presented as a result.

## The proving ground

Step 3 plans a real **Multi-Agent Pickup & Delivery (MAPD)** deployment:

- Each robot joins the **fleet** of its nearest drop-off and delivers only there.
- Work is balanced across robots (completion-time-greedy allocation) — no robot hauls
  everything while others idle.
- One item per trip: drive to the item, carry it home to the drop, return, repeat.
- Motion is **collision-free in time and space** (space-time search with a reservation
  table) and fully deterministic — same floor in, same motion out.

You build the floor with a tap-to-place editor: a palette doubles as the legend, steppers
set how many robots / items / drops to deploy, and one click clears it back to the
template default.

## Tech

- **React 19 + TypeScript + Vite**, two entry points: a marketing home (`index.html`) and
  the console (`app.html`).
- Client-side deterministic oracle — the public demo needs **no backend and no model
  spend** to produce a readiness call.
- Frontier models are scored offline through the verifier and surfaced as scorecards, a
  readiness curve, and a cost-vs-readiness view.

## Run it locally

Requires Node 20+ and npm.

```bash
npm install
npm run dev        # console + marketing home on the Vite dev server
npm run build      # type-check + production build to dist/
npm run lint       # ESLint
npm test           # Vitest
npm run gates      # build + lint + evidence check + tests (full gate)
```

## Privacy & safety

- The hosted demo is **metadata-only** — nothing you submit is uploaded or parsed.
- No secrets ship to the browser. Only `VITE_*` public configuration is bundled; any
  API keys stay server-side and are never committed (`.env*` is git-ignored).
- The readiness license is a decision-support artifact, not a regulatory certification.

## License

See the repository for license details. Datasets and model outputs referenced in the demo
remain under their respective upstream licenses.

---

*Origin is an independent research demo and is not affiliated with or endorsed by any
model provider whose outputs it evaluates.*
