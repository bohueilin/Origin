// Plain-language primer that sets up the RSI / learning cluster below (RsiClimb,
// ModelLearning, FailureRows) — so "RL environment", "the RSI loop", and "Open the
// RSI verifier dashboard" actually mean something to a first-time visitor.

const CONCEPTS = [
  {
    tag: 'RL environment',
    title: 'Your floor, turned into a gym',
    body:
      'The site you submit becomes a reinforcement-learning environment — thousands of scenarios where the brain must choose finish, escalate, or refuse. A deterministic oracle grades every decision; no LLM ever grades another LLM.',
  },
  {
    tag: 'RSI loop',
    title: 'Every failure becomes the next lesson',
    body:
      'When the brain gets a case wrong, that failure becomes a training row. It retrains, re-runs the gym, and climbs the readiness ladder — recursive self-improvement, pass after pass, instead of a model frozen at launch.',
  },
  {
    tag: 'Verified gains',
    title: 'Improvement you can actually trust',
    body:
      'A fast model (Gemma) proposes the next brain; Origin’s oracle verifies it — divergence 0 means the gain is real, not gamed. A policy can never buy a tier by cutting a safety corner.',
  },
]

export function RsiPrimer() {
  return (
    <section className="fd-section fd-shell" id="rsi-primer">
      <div className="fd-kicker">The loop that earns trust</div>
      <h2>Your floor becomes a gym. The brain trains in it — and climbs.</h2>
      <p className="fd-section-sub">
        Origin doesn’t hand you a frozen model. Every floor you submit becomes a training environment
        where the brain <strong>earns — then re-earns</strong> the right to act, with every gain checked
        against the oracle so it can’t be faked. Here’s the loop behind the charts below.
      </p>

      <div className="fd-rsi-concepts">
        {CONCEPTS.map((c, i) => (
          <div className="fd-rsi-concept" key={c.tag}>
            <span className="fd-rsi-concept-step" aria-hidden="true">{i + 1}</span>
            <span className="fd-rsi-concept-tag">{c.tag}</span>
            <h3>{c.title}</h3>
            <p>{c.body}</p>
          </div>
        ))}
      </div>

      <p className="fd-rsi-primer-why">
        <strong>Why it matters to you:</strong> the robot you deploy today shouldn’t be the robot
        you’re stuck with. With Origin it learns from every mistake on <em>your</em> floor and re-earns
        its license — and because the oracle signs off (never the model itself), “better” provably means
        <strong> safer</strong>, not just higher-scoring.
      </p>
    </section>
  )
}
