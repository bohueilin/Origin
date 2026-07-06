import { Cpu, Gauge, Zap } from 'lucide-react'
import { DeepDiveButton } from '../app/deepDive'
import { useDeepDive } from '../app/deepDiveContext'
import leaderboard from '../data/leaderboard.json'

type Row = {
  model: string
  provider: string
  tokPerSec: number
  source: 'measured' | 'published'
  cerebras?: boolean
  ours?: boolean
}

const rows = (leaderboard.models as Row[])
  .slice()
  .sort((a, b) => b.tokPerSec - a.tokPerSec)

export function ModelLeaderboard() {
  const { open } = useDeepDive()
  const max = Math.max(...rows.map((r) => r.tokPerSec))
  const cerebrasTop = rows.find((r) => r.cerebras)
  // Same model, different silicon — the cleanest hardware proof.
  const ossCerebras = rows.find((r) => r.cerebras && /gpt-oss/i.test(r.model))
  const ossGpu = rows.find((r) => !r.cerebras && /gpt-oss/i.test(r.model))
  const sameModelX =
    ossCerebras && ossGpu ? Math.round(ossCerebras.tokPerSec / ossGpu.tokPerSec) : null
  // Our model is a quarter the size of the field's fastest — make that the headline.
  const ours = rows.find((r) => r.ours)

  return (
    <section className="panel leaderboard-panel" aria-labelledby="lb-title">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Model Speed Leaderboard</p>
          <h2 id="lb-title">Output speed across the field — tokens / second</h2>
        </div>
        <div className="panel-head-actions">
          <DeepDiveButton
            onClick={() =>
              open({
                title: 'Model speed leaderboard',
                subtitle: `Output tokens/sec · measured ${leaderboard.measuredAt} · same prompt`,
                data: leaderboard,
              })
            }
          />
          <Gauge size={22} aria-hidden="true" />
        </div>
      </div>

      {ours && ossCerebras ? (
        <p className="lb-callout ours-callout">
          <Cpu size={15} aria-hidden="true" />
          Our model: <strong>Gemma 4 31B</strong> nearly matches <strong>GPT-OSS 120B</strong> — a model{' '}
          <strong>4× larger</strong> — on the same Cerebras silicon ({ours.tokPerSec.toLocaleString()} vs{' '}
          {ossCerebras.tokPerSec.toLocaleString()} tok/s), and beats every GPU baseline an enterprise
          would actually deploy.
        </p>
      ) : null}

      {sameModelX ? (
        <p className="lb-callout">
          <Zap size={15} aria-hidden="true" />
          Same model, different silicon: <strong>GPT-OSS 120B</strong> runs{' '}
          <strong>{sameModelX}× faster</strong> on Cerebras ({ossCerebras?.tokPerSec.toLocaleString()} tok/s)
          than on a GPU ({ossGpu?.tokPerSec.toLocaleString()} tok/s). Speed is the silicon, not the
          model.
        </p>
      ) : null}

      <div className="lb-rows">
        {rows.map((row) => {
          const pct = Math.max(2, Math.round((row.tokPerSec / max) * 100))
          const multiple =
            cerebrasTop && !row.cerebras
              ? Math.round(cerebrasTop.tokPerSec / row.tokPerSec)
              : null
          const cls = [
            'lb-row',
            row.cerebras ? 'cerebras' : '',
            row.ours ? 'ours' : '',
            row.source === 'published' ? 'published' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <div className={cls} key={`${row.model}-${row.provider}`}>
              <div className="lb-label">
                <strong>
                  {row.model}
                  {row.ours ? <i className="lb-ours">Our model</i> : null}
                </strong>
                <span>
                  {row.cerebras ? <Cpu size={12} aria-hidden="true" /> : null}
                  {row.provider}
                </span>
              </div>
              <div className="lb-bar">
                <span style={{ width: `${pct}%` }} />
              </div>
              <div className="lb-value">
                <strong>{row.tokPerSec.toLocaleString()}</strong>
                <span>{row.source === 'measured' ? 'measured' : 'published'}</span>
                {multiple && multiple > 1 ? <em>{multiple}× slower</em> : null}
              </div>
            </div>
          )
        })}
      </div>

      <p className="lb-footnote">
        Output tokens/sec on an identical ~450-word enterprise prompt. Cerebras, Fireworks (GPU) and
        Google figures measured {leaderboard.measuredAt}; closed frontier APIs (Claude, GPT, Qwen,
        Llama, MiniMax) shown as published/typical native-API throughput for reference, not measured
        here.
      </p>
    </section>
  )
}
