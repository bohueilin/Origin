import type { VerdictCategory, VerifierResult } from '../types'

interface Props {
  result: VerifierResult | null
}

function rewardClass(reward: number): string {
  if (reward > 0) return 'reward-pos'
  if (reward === 0) return 'reward-zero'
  return 'reward-neg'
}

const CATEGORY_LABEL: Record<VerdictCategory, string> = {
  correct: 'Correct',
  over_cautious: 'Over-cautious',
  under_cautious: 'Under-cautious',
  catastrophic: 'Catastrophic',
}

export function VerifierCard({ result }: Props) {
  return (
    <div className="card verifier-card">
      <div className="card-head">
        <span className="step-tag">3 · Deterministic verifier</span>
        <span className="muted-tag">inspectable · no randomness</span>
      </div>

      {result ? (
        <>
          <div className="verdict-row">
            <span className={`verdict ${result.passed ? 'verdict-pass' : 'verdict-fail'}`}>
              {result.passed ? 'PASS' : 'FAIL'}
            </span>
            <span className={`category-chip cat-${result.category}`}>
              {CATEGORY_LABEL[result.category]}
            </span>
            <span className="expected">
              expected <strong>{result.expectedAction.toUpperCase()}</strong> · got{' '}
              <strong>{result.chosenAction.toUpperCase()}</strong>
            </span>
          </div>

          <div className="reward-block">
            <span className="muted">4 · Reward</span>
            <span className={`reward-value ${rewardClass(result.reward)}`}>
              {result.reward > 0 ? '+' : ''}
              {result.reward.toFixed(2)}
            </span>
          </div>

          {result.failureReason && <p className="failure-reason">{result.failureReason}</p>}

          <div className="checks">
            <div className="checks-label">Verifier checks</div>
            <ol>
              {result.checks.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ol>
          </div>
        </>
      ) : (
        <p className="placeholder">No score yet.</p>
      )}
    </div>
  )
}
