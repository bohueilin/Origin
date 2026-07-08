import type { Itinerary } from '../../scenarios/types'
import { Section } from '../bits'

export function ItineraryPanel({ itinerary }: { itinerary: Itinerary }) {
  return (
    <Section kicker="8 · Final execution packet" title={itinerary.title}>
      <p className="pp-itin-summary">{itinerary.summary}</p>
      <div className="pp-itin-lines">
        {itinerary.lines.map((l) => (
          <div key={l.label} className={`pp-itin-line pp-itin-${l.tone ?? 'default'}`}>
            <span className="pp-itin-k">{l.label}</span>
            <span className="pp-itin-v">{l.value}</span>
          </div>
        ))}
      </div>
      <ul className="pp-itin-notes">
        {itinerary.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </Section>
  )
}
