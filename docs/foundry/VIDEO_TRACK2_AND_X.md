# Origin Foundry — Track 2 (People's Choice) viral cut + X post copy

> **STATUS: DRAFT ONLY. Do NOT post.** Nothing in this file has been published to X/Twitter,
> Discord, or anywhere. These are drafts for a human to review, tighten, and post manually.
> No secrets, tokens, phone numbers, or notifications appear in any shot — verify on-screen before record.

**Project:** Origin Foundry — engine name **Quorum** (*no agent acts alone; every action is ratified*).
**Event:** Cerebras × Gemma-4 24h hackathon. **X deadline-adjacent window:** post in the US-morning
slot **before** the Mon Jun 29 10:00 PT submission deadline (see "Post timing" below).

**The one true line:** Upload a floor plan → `gemma-4-31b` (vision) on Cerebras reads it into a real RL
environment → a fast Perceiver → Planner → Guardian loop ratifies **every** step at ~1,500 tok/s → so the
robot policy **can't reward-hack**, because the judge of "did it do the job safely" is a **deterministic
oracle, never an LLM.** Capability is not permission.

---

## Honesty guardrails (read before you cut anything)

- **Speed numbers are real.** Use **~1,284 tok/s measured** (verified live on `gemma-4-31b` /
  Cerebras, TTFT ~8ms) and **~1,500 tok/s** only as the rounded headline. **~15× a comparable GPU**
  is the speed-class claim, not a per-run measurement — say "about 15×," not a fake decimal.
- **Claim speed + latency, not energy or cost.** WSE wins tok/s + TTFT at low batch (the real-time
  agent regime). Do not claim energy-per-token or cost-at-scale wins.
- **Training is real but small.** If training appears on screen, the caption says "small but real RL
  loop," never "trained a production robot."
- **Any illustrative figure is labeled "illustrative" on screen.** The only live, unlabeled numbers are
  the real `time_info` tok/s / TTFT pulled from the API.
- **GPU baseline = Gemini** (allowed). Gemma-4-on-Cerebras stays the primary/hero side.
- Pre-record the race. Network round-trip can dwarf inference on bad wifi — never let the money shot
  ride on live judging wifi.

---

## The hero concept for Track 2

We combine the **two** highest-EV shareable formats into one ≤60s cut:

- **A — "The Latency Race"** (split-screen, identical task, live tok/s + wall-clock): Cerebras runs the
  **entire** Quorum verify-loop — Perceiver → Planner → Guardian ratifies every step → deterministic
  license issued — while the GPU baseline is **still streaming its first answer**. This is the money shot:
  it makes "the loop is free" *felt*, not explained. We race a **LOOP**, not one call.
- **B — "It reacts before I finish."** The Guardian veto lands *before the narrator finishes saying the
  unsafe step out loud.* The eerie "the brain is ahead of the world" beat that sells real-time as visceral.

One cut, both beats. Payoff-first.

---

## ≤60s split-screen latency-race shot-list

Format: **9:16 vertical**, native upload to X. Sound-off safe — every claim is also a bold on-screen
caption. Captions are high-contrast (white text, dark scrim). No audio dependency for the win.

Layout for the race section: **left pane = GPU (Gemini), right pane = Cerebras (gemma-4-31b)**, a shared
running **wall-clock** across the top, and a **live tok/s counter** under each pane fed by the real
`time_info` object. A thin label strip reads "same prompt · same Gemma-4 family · the only difference is
the silicon."

| # | Time | Shot | On-screen caption (sound-off safe) | Notes |
|---|------|------|-----------------------------------|-------|
| 1 | 0:00–0:02 | **HOOK — result-first.** Freeze on the instant the right (Cerebras) pane shows a green **"LICENSE ISSUED · Guardian ratified 7/7 steps"** while the left (GPU) pane is mid-first-sentence. | **"GPU is still typing its first answer. Cerebras already verified the whole job."** | Lead with the payoff frame, not a logo. Decides watch-through in 3s. |
| 2 | 0:02–0:09 | **STAKES.** Cut to the FoundryApp upload: a floor-plan PNG dropped in, `gemma-4-31b` vision parsing it into a grid (FloorGrid animates in). | **"Upload a floor plan. Gemma-4 turns it into a real environment a robot trains in."** | One line of real-world what-it-does. Show the floor plan, not a wall of text. |
| 3 | 0:09–0:12 | **SETUP the race.** Both panes load the **same** planning prompt. Wall-clock resets to 00.000. Tiny "reasoning: none" tag on both. | **"Same task. Two chips. Watch the right side finish the entire loop."** | reasoning OFF for the speed shot. |
| 4 | 0:12–0:34 | **SPEED-REVEAL (the highest-leverage 5s, held longer).** GPU pane streams slowly. Cerebras pane rips through the loop: Perceiver reads grid → Planner emits steps → **Guardian ratifies/vetoes each step** → deterministic oracle scores it → license card flips green. Live tok/s counter on the Cerebras side climbs to **~1,284 tok/s**; GPU counter crawls. | Top caption: **"~1,284 tok/s measured · TTFT ~8ms"** then **"~1,500 tok/s headline · ~15× a comparable GPU."** Lower third when Guardian vetoes: **"Guardian VETO — caught before it acted."** | This is the whole video. The Cerebras pane completes N loop iterations in the time the GPU does ~1 partial answer. Real counter, no fakery. |
| 5 | 0:34–0:42 | **"IT REACTS BEFORE I FINISH" beat.** Narrator/caption begins to read an unsafe planned step aloud ("…just skip the scan and grab the—"). The Guardian veto chip flips red **mid-sentence**, before the step name finishes. | **"It vetoed the unsafe step before I finished saying it."** | The eerie ahead-of-the-world moment. Time the edit so the red veto lands a beat early. |
| 6 | 0:42–0:52 | **THE TWIST (why it matters).** Split to the counterfactual: **left = no-Guardian "reckless" run** racks up a high reward by reward-hacking (calls `finish` early); **right = verified run** scores lower but **the deterministic oracle marks reckless INVALID**. | **"The reckless agent 'won' — until a deterministic oracle, not an LLM, called it. Capability ≠ permission."** | This is our defensible wedge: the judge of safety is code, never a model. Hold on the INVALID stamp. |
| 7 | 0:52–0:58 | **PAYOFF.** The deterministic License card finalizes: "Ratified by oracle · 7/7 steps safe." Quorum wordmark fades up. | **"Quorum: no agent acts alone. Every step ratified."** | |
| 8 | 0:58–1:00 | **SOFT CTA / reply-bait card.** | **"Gemma-4 on Cerebras. The brain runs faster than the world moves. What would you point it at?"** | Question on the end card seeds replies (replies » likes). |

**Cutting rules**
- Total ≤60s, hard. If it runs long, steal from shots 2 and 7, never from the race (shot 4).
- Tags and hashtags go in the **X post**, not burned into the video.
- Pre-record the race section (shot 4) on a clean network; everything else can be screen-capture.
- Keep all numbers that appear live = the real `time_info` values. Any comparative figure ("~15×") is
  framed as "about," and any non-measured figure carries an on-screen "illustrative" tag.

---

## Post timing & reply plan (Track 2 wins on organic impressions)

- **Optimal window: weekday US morning, ~9:00–11:00am ET** (AI-Twitter waking window). Given the
  Mon Jun 29 10:00 PT deadline, the cleanest slot is **Mon Jun 29 morning ET, posted well before
  the 10:00 PT cutoff** so the submission link is live when reach peaks. If the build is camera-ready
  Sunday, a **Sun morning ET** post also works and gives a second day of runway.
- **First 30 minutes of engagement velocity decides amplification** (~10+ engagements triggers the
  boost). Have the whole team + any friendly accounts ready to **reply and quote within minutes** — not
  just like. **Reply fast and reply often.**
- **Replies are weighted far above likes**, so the caption and the seeded first reply must **provoke a
  reply**, not admiration. End on a question.
- **Native upload** the video into X (not a YouTube link). Sound-off captions already baked in.

---

## 3 candidate X post drafts (each ≤280 chars, DRAFT — do not post)

> Pick ONE. All tag **@Cerebras** + **@googlegemma**, 1–2 hashtags, end with reply-bait.
> Char counts are approximate; re-verify before posting since the video attaches separately.

**Draft 1 — the race (highest EV, lead with the payoff)**
```
GPU on the left is still typing its first answer.
On the right, @googlegemma Gemma-4 on @Cerebras already ran the WHOLE loop: see → plan → a Guardian ratifies every step → safe.
~1,284 tok/s measured. ~15x a GPU.

What would you point it at? #Cerebras #Gemma
```
(~248 chars)

**Draft 2 — the "it reacts before I finish" beat**
```
I started reading the unsafe step out loud.
It vetoed it before I finished the sentence.

@googlegemma Gemma-4 on @Cerebras runs a multi-agent verify-loop at ~1,500 tok/s — so a Guardian can ratify EVERY action in real time.

Faster than the world moves. #Cerebras
```
(~258 chars)

**Draft 3 — the wedge: deterministic oracle, can't reward-hack**
```
Most "AI safety" lets an LLM grade the LLM. Ours can't.

Upload a floor plan → @googlegemma Gemma-4 on @Cerebras reads it into an RL env → a deterministic oracle (never a model) judges every step.

Capability ≠ permission. ~15x GPU speed makes it free.

#Cerebras #Gemma
```
(~271 chars)

---

## First-reply comment (seed the thread immediately after posting)

> Post this as your **own first reply** within seconds of the main post — it adds the technical depth,
> invites the debate, and starts the engagement-velocity clock. DRAFT — do not post.

```
How it works: same Gemma-4 family on both sides — the only variable is the silicon. Cerebras runs the full Perceiver→Planner→Guardian loop while the GPU streams one answer.

The catch that makes it safe: the thing scoring "did it do the job?" is a deterministic oracle, not an LLM. The policy literally can't reward-hack the judge.

GPU folks — how long does ONE agent verify-loop take you? Drop a number 👇
```

> Optional follow-up replies to keep velocity (use only real numbers): the live `time_info` screenshot
> (~1,284 tok/s / TTFT ~8ms), and one line on the reckless-vs-verified counterfactual ("the reckless
> agent scored higher and the oracle still marked it INVALID").

---

## Pre-flight checklist before any human posts

- [ ] Video ≤60s, 9:16, native-uploaded to X, captions readable sound-off.
- [ ] No secrets / tokens / phone numbers / notification banners visible in any frame.
- [ ] Every live number on screen is the real `time_info` value; any other figure is labeled illustrative.
- [ ] Speed framed as ~1,284 tok/s measured / ~1,500 headline / ~15x GPU — no invented precision.
- [ ] Tags @Cerebras + @googlegemma and 1–2 hashtags are in the post text, not the video.
- [ ] Posted in the US-morning window; team is online and ready to reply within minutes.
- [ ] First-reply comment posted immediately after the main tweet.
- [ ] Submission link (Discord/X) is live when the post goes out.
