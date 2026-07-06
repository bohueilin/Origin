import { ArrowRight, Eye, ScanText, ShieldAlert, Zap } from 'lucide-react'
import { formatMs, formatNumber } from '../lib/latency'
import { DeepDiveButton } from '../app/deepDive'
import { useDeepDive } from '../app/deepDiveContext'
import type { Ingest } from '../lib/schemas'

type IngestPanelProps = {
  ingest?: Ingest
}

export function IngestPanel({ ingest }: IngestPanelProps) {
  const { open } = useDeepDive()
  if (!ingest) {
    return null
  }

  const jsonView = Object.fromEntries(
    ingest.fields.map((field) => [
      field.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      field.value,
    ]),
  )

  return (
    <section className="panel ingest-panel" aria-labelledby="ingest-title">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Multimodal Ingest</p>
          <h2 id="ingest-title">Gemma 4 reads the support console</h2>
        </div>
        <div className="panel-head-actions">
          <div className="ingest-badge">
            <Eye size={15} aria-hidden="true" />
            Gemma 4 · Vision
          </div>
          <DeepDiveButton
            onClick={() =>
              open({
                title: 'Multimodal ingest',
                subtitle: `Gemma 4 vision · ${formatNumber(ingest.imageTokens)} image tokens · ${formatMs(ingest.inferenceMs)} on Cerebras`,
                data: jsonView,
              })
            }
          />
        </div>
      </div>

      <p className="panel-takeaway">
        <Eye size={16} aria-hidden="true" />
        <span>
          <strong>Image in, structured incident out</strong> in {formatMs(ingest.inferenceMs)} —
          Gemma 4 vision reads the support console like an analyst, so any screenshot becomes
          machine-actionable with no integration.
        </span>
      </p>

      <div className="ingest-flow">
        <figure className="ingest-shot">
          <img src={`/${ingest.source}`} alt="Support console screenshot ingested by Gemma 4" />
          <figcaption>
            <ScanText size={13} aria-hidden="true" />
            {ingest.source}
          </figcaption>
        </figure>

        <div className="ingest-arrow" aria-hidden="true">
          <ArrowRight size={20} />
          <span>Gemma 4 vision</span>
          <em>
            <Zap size={12} />
            {formatNumber(ingest.imageTokens)} img tokens
          </em>
          <em>{formatMs(ingest.inferenceMs)} on Cerebras</em>
        </div>

        <dl className="ingest-fields">
          {ingest.fields.map((field) => (
            <div key={field.label}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <footer className="ingest-footer">
        <ShieldAlert size={15} aria-hidden="true" />
        {ingest.note}
      </footer>
    </section>
  )
}
