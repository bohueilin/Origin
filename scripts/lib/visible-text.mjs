// Text extraction for scripts/honesty-lint.mjs, kept in its own module so it can be
// unit-tested (scripts/visible-text.test.mjs) without running the lint's side effects.

// Crude but effective: strip tags so we lint the visible prose, not attributes/scripts.
// HTML comments go first: a disclaimer that survives only inside <!-- --> is not on the
// page, and a REQUIRED check that it satisfies is a check that has stopped checking.
export const visibleText = (html) =>
  html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')

// String values inside <script type="application/ld+json"> blocks. visibleText() strips
// every <script>, so structured data (what search and AI crawlers quote) was never
// linted. A block that does not parse is returned raw, so a syntax error cannot hide
// a phrase from the ban list.
export const jsonLdText = (html) => {
  const chunks = []
  const collect = (value) => {
    if (typeof value === 'string') chunks.push(value)
    else if (Array.isArray(value)) value.forEach(collect)
    else if (value && typeof value === 'object') Object.values(value).forEach(collect)
  }
  for (const m of html.matchAll(/<script[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collect(JSON.parse(m[1])) } catch { chunks.push(m[1]) }
  }
  return chunks.join('  ·  ')
}
