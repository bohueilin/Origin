// Maps a severity/risk word (CRITICAL / HIGH / MEDIUM / …) to a readable,
// tiered badge class for the dark theme. Pair with the `badge-sev` base class.
export function sevClass(value: string): string {
  const v = (value || '').toLowerCase()
  if (v.includes('critical')) return 'sev-critical'
  if (v.includes('high')) return 'sev-high'
  if (v.includes('medium')) return 'sev-medium'
  return 'sev-low'
}
