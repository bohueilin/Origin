import { LICENSE_LEVELS, levelRank } from '../license'
import type { LicenseLevelId, LicenseState } from '../types'

const ORDER: LicenseLevelId[] = ['L0', 'L1', 'L2', 'L3', 'L4']

interface Props {
  license: LicenseState
}

export function LicenseSummary({ license }: Props) {
  const { level } = license
  const currentRank = levelRank(level.id)

  return (
    <div className="license-summary" style={{ borderColor: level.color }}>
      <div className="license-headline">
        <div className="license-badge" style={{ background: level.color }}>
          {level.id}
        </div>
        <div className="license-name-block">
          <div className="license-eyebrow">Autonomy license</div>
          <div className="license-name" style={{ color: level.color }}>
            {level.name}
          </div>
        </div>
      </div>

      <p className="license-blurb">{level.blurb}</p>
      <p className="license-permission">{level.permission}</p>

      <ol className="license-ladder" aria-label="Autonomy license ladder">
        {ORDER.map((id) => {
          const lvl = LICENSE_LEVELS[id]
          const active = id === level.id
          const earned = levelRank(id) <= currentRank
          return (
            <li
              key={id}
              className={`ladder-step ${active ? 'active' : ''} ${earned ? 'earned' : ''}`}
              style={active ? { borderColor: level.color } : undefined}
              aria-current={active ? 'true' : undefined}
            >
              <span className="ladder-id" style={active ? { color: level.color } : undefined}>
                {id}
              </span>
              <span className="ladder-name">{lvl.name}</span>
              {active && <span className="ladder-here">you are here</span>}
            </li>
          )
        })}
      </ol>

      <div className="license-stats">
        <div className="stat">
          <span className="stat-num">{license.episodes}</span>
          <span className="stat-label">episodes</span>
        </div>
        <div className="stat">
          <span className="stat-num">{(license.passRate * 100).toFixed(0)}%</span>
          <span className="stat-label">pass rate</span>
        </div>
        <div className="stat">
          <span className="stat-num">{license.avgReward.toFixed(2)}</span>
          <span className="stat-label">avg reward</span>
        </div>
        <div className="stat">
          <span className={`stat-num ${license.catastrophicCount > 0 ? 'danger' : ''}`}>
            {license.catastrophicCount}
          </span>
          <span className="stat-label">catastrophic</span>
        </div>
      </div>

      <p className="license-reason">{license.reason}</p>
    </div>
  )
}
