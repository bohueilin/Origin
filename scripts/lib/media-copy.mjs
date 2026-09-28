// Media surfaces must be checked before their words become pixels.
import { checkText } from './banned.mjs'
import { visibleText } from './visible-text.mjs'

export function checkMediaCopy({ cards, cover, captions }) {
  const findings = []
  const check = (surface, text) => {
    for (const finding of checkText(visibleText(text))) findings.push({ surface, ...finding })
  }
  const walk = (value, surface) => {
    if (typeof value === 'string') check(surface, value)
    else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) walk(child, `${surface}.${key}`)
    }
  }
  for (const card of cards) walk(card, `scripts/og-cards.mjs:${card.out}`)
  check('scripts/og-cover.html', cover)
  for (const { file, data } of captions) walk(data, file)
  return findings
}
