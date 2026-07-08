// /verify — paste any Origin evidence artifact, re-verify it offline.
// =============================================================================
// The interactive half of verify.html. All logic lives in ./detect.mjs (pure,
// framework-free — the Node self-test imports the same module); this file is
// only the paste box, the verdict rendering, and the synthetic examples.
//
//   • auto-detects the artifact kind from its shape (see the table on the page)
//   • routes to the matching @origin/verifier-core / @origin/evidence verifier
//   • "Tamper one field" flips a value WITHOUT re-signing/re-sealing, so the
//     next Verify shows the artifact void — the visceral proof
//
// Honesty rails: a green verdict means "reproducible under this verifier" —
// never "safe" or "correct". Client-side only: nothing pasted here is uploaded,
// and nothing is persisted (no cookies, no localStorage).
// =============================================================================
import { useRef, useState } from 'react'
import { KIND_LABELS, parseArtifact, detectArtifact, verifyArtifact, tamperArtifact } from './detect.mjs'
import type { ReportLine, ReportTone, VerifyReport } from './detect.mjs'
import { makeExample } from './examples.mjs'
import type { ExampleKind } from './examples.mjs'

const EXAMPLES: Array<{ kind: ExampleKind; label: string }> = [
  { kind: 'sigil', label: 'Sigil' },
  { kind: 'credential', label: 'Credential' },
  { kind: 'receipt', label: 'ScoreReceipt' },
  { kind: 'trace', label: 'Episode trace' },
  { kind: 'inclusion', label: 'Batch inclusion proof' },
]

function Pill({ tone }: { tone: ReportTone }) {
  const txt = tone === 'ok' ? 'pass' : tone === 'bad' ? 'void' : 'note'
  return <span className={`vfy-pill vfy-pill--${tone}`}>{txt}</span>
}

function Log({ lines }: { lines: ReportLine[] }) {
  if (lines.length === 0) return null
  return (
    <ul className="vfy-log">
      {lines.map((l, i) => (
        <li key={i}>
          <Pill tone={l.tone} />
          <span>
            <b>{l.label}</b> — {l.text}
          </span>
        </li>
      ))}
    </ul>
  )
}

function DetectionTable() {
  return (
    <article className="card">
      <p className="kicker">How detection works</p>
      <h2 style={{ marginTop: 6 }}>Shape in, verifier out.</h2>
      <p className="section__lede" style={{ marginTop: 8 }}>
        The artifact kind is read from the JSON's shape — most specific first (a Sigil may wrap a
        credential or receipt in its payload, so the outer signature wins). Each kind routes to the
        matching verifier from the same SDK the test suite gates.
      </p>
      <div className="vfy-scroll">
        <table className="vfy-table">
          <thead>
            <tr>
              <th scope="col">You pasted</th>
              <th scope="col">Detected by</th>
              <th scope="col">Verified with</th>
              <th scope="col">Verdict codes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><b>Sigil</b></td>
              <td><code>pubkey_jwk</code> + <code>signature</code> + <code>payload_digest</code></td>
              <td><code>verifySigil</code> — recompute the content-address, verify ES256 with the embedded key, optional issuer pin</td>
              <td>0 valid · 1 payload tampered · 2 signature invalid · 3 wrong signer · 4 malformed</td>
            </tr>
            <tr>
              <td><b>Crucible credential</b></td>
              <td><code>credential_digest</code> + <code>config_digest</code> (or <code>{'{ credential, liveConfig, … }'}</code>)</td>
              <td><code>verifyCredential</code> — recompute the credential digest + config/env/verifier bindings</td>
              <td>0 valid · 3 tamper · 4 drift → VOID</td>
            </tr>
            <tr>
              <td><b>ScoreReceipt</b></td>
              <td><code>receipt_digest</code></td>
              <td>recompute <code>sha256(canonical(receipt))</code> against the sealed digest</td>
              <td>0 self-consistent · 3 tampered</td>
            </tr>
            <tr>
              <td><b>Episode trace</b></td>
              <td><code>events[]</code> + <code>final_digest</code></td>
              <td><code>verifyChain</code> — re-derive every hash link + the sealing event</td>
              <td>0 intact · 2 chain tamper</td>
            </tr>
            <tr>
              <td><b>Merkle inclusion proof</b></td>
              <td><code>beneficiary</code> + <code>receipt</code> + <code>proof</code> + <code>root</code></td>
              <td><code>verifyReceiptInBatch</code> — refold the sibling hashes to the count-bound root</td>
              <td>included / not included</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="vfy-note">
        Import surface: <code>@origin/verifier-core/sigil</code> · <code>@origin/verifier-core/crucible</code> ·{' '}
        <code>@origin/verifier-core/merkleBatch</code> · <code>@origin/evidence/env-evidence</code> — the exact
        modules the Node test suite runs.
      </p>
    </article>
  )
}

export function VerifyPage() {
  const [text, setText] = useState('')
  const [thumbprint, setThumbprint] = useState('')
  const [report, setReport] = useState<VerifyReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [tampered, setTampered] = useState(false)
  const [busy, setBusy] = useState(false)
  const pristineRef = useRef<string | null>(null)

  const reset = (nextText: string, nextNotes: string[]) => {
    setText(nextText)
    setNotes(nextNotes)
    setReport(null)
    setError(null)
  }

  const loadExample = async (kind: ExampleKind) => {
    setBusy(true)
    try {
      const artifact = await makeExample(kind)
      const pristine = JSON.stringify(artifact, null, 2)
      pristineRef.current = pristine
      if (tampered) {
        const t = tamperArtifact(kind, artifact)
        reset(JSON.stringify(t.value, null, 2), [
          `Loaded a synthetic ${KIND_LABELS[kind]} minted just now by the SDK.`,
          `Tampered: ${t.note}.`,
        ])
      } else {
        reset(pristine, [`Loaded a synthetic ${KIND_LABELS[kind]} minted just now by the SDK — labeled synthetic in its fields.`])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const toggleTamper = (on: boolean) => {
    if (on) {
      const parsed = parseArtifact(text)
      if (!parsed.ok) {
        setError(`cannot tamper: ${parsed.error} — load an example or paste an artifact first`)
        return
      }
      const kind = detectArtifact(parsed.value)
      const t = tamperArtifact(kind, parsed.value)
      pristineRef.current = text
      setTampered(true)
      reset(JSON.stringify(t.value, null, 2), [`Tampered: ${t.note}. Verify to see it void; untick to restore the original.`])
    } else {
      setTampered(false)
      if (pristineRef.current != null) {
        reset(pristineRef.current, ['Restored the untampered original.'])
      }
    }
  }

  const runVerify = async () => {
    setBusy(true)
    try {
      const parsed = parseArtifact(text)
      if (!parsed.ok) {
        setReport(null)
        setError(parsed.error)
        return
      }
      setError(null)
      const pin = thumbprint.trim()
      setReport(await verifyArtifact(parsed.value, pin ? { expectedThumbprint: pin } : {}))
    } catch (e) {
      setReport(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const clearAll = () => {
    pristineRef.current = null
    setTampered(false)
    setThumbprint('')
    reset('', [])
  }

  const verdictTone = report ? (report.ok ? 'ok' : report.verdict === 'UNRECOGNIZED' ? 'info' : 'bad') : null

  return (
    <div className="vfy-grid">
      <article className="card">
        <p className="kicker">Paste + verify · offline</p>
        <h2 style={{ marginTop: 6 }}>One artifact in, one honest verdict out.</h2>
        <p className="section__lede" style={{ marginTop: 8 }}>
          Paste the JSON of any Origin evidence artifact. The kind is auto-detected from its shape and
          re-verified right here — digests recomputed, signatures checked, chains re-derived. Or mint a
          synthetic example below and tamper with it yourself.
        </p>

        <div className="field">
          <label htmlFor="vfy-artifact">Artifact JSON</label>
          <textarea
            id="vfy-artifact"
            className="vfy-input"
            rows={14}
            spellCheck={false}
            autoComplete="off"
            placeholder='{ "sigil_schema_version": "1.0.0", … }  — a Sigil, Crucible credential, ScoreReceipt, episode trace, or Merkle inclusion proof'
            aria-describedby="vfy-hint"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <p className="vfy-note" id="vfy-hint">
          Client-side only: nothing you paste is uploaded, and nothing is stored. Verification runs the
          published <code>@origin/verifier-core</code> + <code>@origin/evidence</code> modules in this tab.
        </p>

        <div className="field">
          <label htmlFor="vfy-thumbprint">Pin issuer thumbprint (optional — Sigils only)</label>
          <input
            id="vfy-thumbprint"
            type="text"
            spellCheck={false}
            autoComplete="off"
            placeholder="expected signer thumbprint (sha256 of the RFC-7638 JWK members) — rejects a valid-but-wrong-signer Sigil"
            value={thumbprint}
            onChange={(e) => setThumbprint(e.target.value)}
          />
        </div>

        <div className="vfy-actions">
          <button className="btn btn--primary btn--sm" onClick={() => void runVerify()} disabled={busy || text.trim() === ''}>
            Verify
          </button>
          <button className="btn btn--ghost btn--sm" onClick={clearAll} disabled={busy || (text === '' && !report && !error)}>
            Clear
          </button>
          <label className="vfy-toggle">
            <input type="checkbox" checked={tampered} onChange={(e) => toggleTamper(e.target.checked)} disabled={busy} />
            Tamper one field (see it void)
          </label>
        </div>

        <div className="vfy-examples">
          <span id="vfy-examples-label">Load a synthetic example:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.kind}
              className="btn btn--ghost btn--sm"
              onClick={() => void loadExample(ex.kind)}
              disabled={busy}
              aria-describedby="vfy-examples-label"
            >
              {ex.label}
            </button>
          ))}
        </div>

        <div className="vfy-result" aria-live="polite">
          {notes.map((n, i) => (
            <p className="vfy-note" key={i}>
              {n}
            </p>
          ))}
          {error ? (
            <div className="vfy-verdict vfy-verdict--bad" role="status">
              <b>NOT VERIFIABLE</b>
              <span>{error}</span>
            </div>
          ) : null}
          {report && verdictTone ? (
            <>
              <div className={`vfy-verdict vfy-verdict--${verdictTone}`} role="status">
                <b>{report.verdict}</b>
                <span>
                  {KIND_LABELS[report.kind]}
                  {report.code != null ? ` · code ${report.code}` : ''}
                </span>
              </div>
              <p className="section__lede" style={{ marginTop: 12 }}>
                {report.headline}
              </p>
              <Log lines={report.lines} />
              <p className="vfy-note">
                <b>Scope, honestly:</b> {report.scope}
              </p>
            </>
          ) : null}
        </div>
      </article>

      <DetectionTable />
    </div>
  )
}
