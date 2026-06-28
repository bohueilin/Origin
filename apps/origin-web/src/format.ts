// Tiny presentational formatters shared across views. Kept in a non-component
// module so component files stay component-only (react-refresh friendly).

export function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`
}

export function actionTrace(actions: readonly string[]): string {
  return actions.map((a) => a.replace('move:', 'move ')).join(' -> ')
}
