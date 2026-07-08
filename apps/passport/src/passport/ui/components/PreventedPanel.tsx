import { Section } from '../bits'

export function PreventedPanel({ prevented }: { prevented: string[] }) {
  return (
    <Section kicker="What Janus prevented" title="Useful autonomy without silent overreach">
      <ul className="pp-prevented">
        {prevented.map((p) => (
          <li key={p}>
            <span className="pp-shield" aria-hidden="true">🛡</span>
            {p}
          </li>
        ))}
      </ul>
    </Section>
  )
}
