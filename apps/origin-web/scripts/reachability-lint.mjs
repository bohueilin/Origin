#!/usr/bin/env node
/**
 * Reachability lint — fail the build when shipped source is unreachable.
 *
 * WHY THIS EXISTS. Three times now, working features have gone dark without a
 * single test failing, because nothing in CI checks that code is *reachable*:
 *
 *   c2fc5b3 (2026-07-03) deleted `#factorydad-root` + `/src/factorydad/main.tsx`
 *     from index.html. Its commit message describes a video-overlay bugfix. That
 *     one line was the only door to AccountMenu -> AccountSettings — admin, the
 *     support queue, fleet permissions, wallets, audit and the 1Password step-up,
 *     all in one 1,239-line component. efb7a58 was still editing that tree three
 *     days later; nobody noticed.
 *   b1c14ce (2026-07-04) deleted `#root` + `/src/main.tsx` from app.html, which
 *     also silently broke the Google OAuth callback for 26 days.
 *   f03b604 (07-13) and 3ba917b (07-24) were the first two manual rediscoveries.
 *
 * Typecheck, lint and tests all stayed green through every one of those, because
 * an orphaned module is still valid TypeScript with passing unit tests. The only
 * thing that changes is that no user can ever run it.
 *
 * WHAT IT DOES. Starts from the `<script type="module" src="/src/…">` tags in the
 * HTML files vite actually builds, follows static imports transitively, and reports
 * every module under src/ that nothing reaches.
 *
 * It is a REPORT by default and a GATE with --max. The point is not to reach zero —
 * some orphans are deliberate (deprecated demos, work in progress). The point is
 * that the number cannot silently GROW, and that losing a mount point shows up as a
 * CI diff instead of a customer discovering it months later.
 *
 *   node scripts/reachability-lint.mjs            # report
 *   node scripts/reachability-lint.mjs --max 90   # fail if orphans exceed 90
 *   node scripts/reachability-lint.mjs --json
 *
 * Deliberately dependency-free: it must keep working when the toolchain does not.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, extname } from 'node:path';

const WEB = resolve(dirname(new URL(import.meta.url).pathname), '..');
const SRC = join(WEB, 'src');
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const maxIdx = args.indexOf('--max');
const max = maxIdx >= 0 ? Number(args[maxIdx + 1]) : null;

/** Every HTML file vite is configured to build — the only real entry points. */
function htmlEntries() {
  const cfg = readFileSync(join(WEB, 'vite.config.ts'), 'utf8');
  const block = cfg.slice(cfg.indexOf('input:'), cfg.indexOf('}', cfg.indexOf('input:')));
  return [...block.matchAll(/resolve\(__dirname,\s*'([^']+\.html)'\)/g)].map((m) => m[1]);
}

/** Module specifiers a given file statically imports (plus lazy import()). */
function importsOf(file) {
  const src = readFileSync(file, 'utf8');
  const specs = [];
  for (const re of [
    /\bimport\s+[^'"]*?from\s*['"]([^'"]+)['"]/g,   // import x from 'y'
    /\bimport\s*['"]([^'"]+)['"]/g,                  // import 'y'
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,        // await import('y')
    /\bexport\s+[^'"]*?from\s*['"]([^'"]+)['"]/g,    // export … from 'y'
  ]) for (const m of src.matchAll(re)) specs.push(m[1]);
  return specs;
}

/** Resolve a specifier to a real file under src/, or null if external. */
function resolveSpec(spec, fromFile) {
  let base;
  if (spec.startsWith('/src/')) base = join(WEB, spec.slice(1));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null; // bare specifier -> node_modules, not ours
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const e of EXTS) if (existsSync(base + e)) return base + e;
  for (const e of EXTS) if (existsSync(join(base, 'index' + e))) return join(base, 'index' + e);
  return null;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.includes(extname(p))) out.push(p);
  }
  return out;
}

// ── crawl from the HTML entries ──
const roots = [];
const missingMounts = [];
for (const html of htmlEntries()) {
  const p = join(WEB, html);
  if (!existsSync(p)) { missingMounts.push(`${html}: declared in vite.config.ts but missing on disk`); continue; }
  const tags = [...readFileSync(p, 'utf8').matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  if (tags.length === 0) missingMounts.push(`${html}: built by vite but mounts NO module — anything it should host is dark`);
  for (const t of tags) {
    const f = resolveSpec(t, p);
    if (f) roots.push(f);
    else missingMounts.push(`${html}: <script src="${t}"> does not resolve`);
  }
}

const reached = new Set();
const queue = [...roots];
while (queue.length) {
  const f = queue.pop();
  if (reached.has(f)) continue;
  reached.add(f);
  for (const spec of importsOf(f)) {
    const next = resolveSpec(spec, f);
    if (next && next.startsWith(SRC) && !reached.has(next)) queue.push(next);
  }
}

const all = walk(SRC).filter((f) => !/\.(test|spec)\.[tj]sx?$/.test(f) && !f.includes('__tests__'));
const orphans = all.filter((f) => !reached.has(f)).map((f) => relative(WEB, f)).sort();

if (asJson) {
  console.log(JSON.stringify({ total: all.length, reached: reached.size, orphans }, null, 2));
} else {
  console.log(`reachability: ${reached.size}/${all.length} modules reachable from ${roots.length} HTML mount point(s); ${orphans.length} orphaned`);
  for (const m of missingMounts) console.log(`  ! ${m}`);
  if (orphans.length) {
    console.log('  orphaned (shipped source nothing can reach):');
    for (const o of orphans.slice(0, 15)) console.log(`    ${o}`);
    if (orphans.length > 15) console.log(`    … and ${orphans.length - 15} more (use --json for the full list)`);
  }
}

// A <script src> that does not RESOLVE is always a bug — the page ships a broken
// mount. (A page with no module at all is fine: several pages are deliberately
// static marketing. Those are reported above, not failed, so that turning one into
// a static page stays a visible, reviewable diff.)
if (missingMounts.some((m) => m.includes('does not resolve') || m.includes('missing on disk'))) {
  console.error('\nreachability: FAIL — a built page references a module that does not resolve.');
  process.exit(1);
}
if (max !== null && orphans.length > max) {
  console.error(`\nreachability: FAIL — ${orphans.length} orphaned modules exceeds the agreed ceiling of ${max}.`);
  console.error('Either wire the new code to an entry point, or raise the ceiling deliberately in the same PR.');
  process.exit(1);
}
