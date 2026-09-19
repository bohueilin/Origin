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
import '../shared/product-workspace.css'
import { decodeArtifact } from '../shared/shareLink'
import { KIND_LABELS, parseArtifact, detectArtifact, verifyArtifact, tamperArtifact } from './detect.mjs'
import type { ReportLine, ReportTone, VerifyReport } from './detect.mjs'
import { makeExample } from './examples.mjs'
import type { ExampleKind } from './examples.mjs'

const EXAMPLES: Array<{ kind: ExampleKind; label: string }> = [
  { kind: 'reference', label: 'Synthetic sandbox reference check' },
  { kind: 'action-run', label: 'Signed browser policy evaluation (untrusted)' },
  { kind: 'sigil', label: 'Origin Attestation' },
  { kind: 'credential', label: 'Credential' },
  { kind: 'receipt', label: 'ScoreReceipt' },
  { kind: 'trace', label: 'Episode trace' },
  { kind: 'inclusion', label: 'Batch inclusion proof' },
  { kind: 'factory', label: 'Factory plan reference check' },
]

const liveKeyExamples = new Set<ExampleKind>(['sigil', 'factory'])

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
        The artifact kind is read from the JSON's shape — most specific first (an Origin Attestation may wrap a
        credential or receipt in its payload, so the outer signature wins). Each kind routes to the
        matching verifier from the same SDK the test suite gates.
      </p>
      <div className="vfy-scroll" tabIndex={0} role="region" aria-label="Artifact detection table (scrollable)">
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
              <td><b>Action/Run Evidence</b></td>
              <td><code>schema_version</code> + <code>execution_mode</code> + <code>evidence_digest</code></td>
              <td><code>verifyActionRunEvidence</code> — validate the envelope, re-derive its digest, verify the signed statement, and check coverage/freshness</td>
              <td>VALID with a trusted issuer pin and intact complete/fresh semantics; execution_verified remains a separate field. Unpinned browser policy evidence renders UNTRUSTED.</td>
            </tr>
            <tr>
              <td><b>Origin Attestation</b></td>
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
        Import surface: <code>@origin/verifier-core/action-run-evidence</code> · <code>@origin/verifier-core/sigil</code> · <code>@origin/verifier-core/crucible</code> ·{' '}
        <code>@origin/verifier-core/merkleBatch</code> · <code>@origin/evidence/env-evidence</code> — the exact
        modules the Node test suite runs.
      </p>
    </article>
  )
}

// A shared /verify#a=… link, read once at first render. The artifact rides in the
// FRAGMENT, so it never reaches a server and the "nothing you paste is uploaded" promise
// still holds for a link someone forwarded.
function sharedFromUrl(): { text: string; notes: string[]; error: string | null } {
  const hash = typeof window === 'undefined' ? '' : window.location.hash
  const fragment = hash.startsWith('#a=') ? hash.slice(3) : ''
  if (!fragment) return { text: '', notes: [], error: null }
  const artifact = decodeArtifact(fragment)
  if (artifact === null) {
    return { text: '', notes: [], error: 'That shared link could not be decoded. Paste the artifact itself below.' }
  }
  return {
    text: JSON.stringify(artifact, null, 2),
    notes: ['Loaded from a shared link. Nothing was uploaded — the artifact travelled in the URL fragment.'],
    error: null,
  }
}

const SHARED = sharedFromUrl()

export function VerifyPage() {
  const [text, setText] = useState(SHARED.text)
  const [thumbprint, setThumbprint] = useState('')
  const [report, setReport] = useState<VerifyReport | null>(null)
  const [error, setError] = useState<string | null>(SHARED.error)
  const [notes, setNotes] = useState<string[]>(SHARED.notes)
  const [tampered, setTampered] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selectedExample, setSelectedExample] = useState<ExampleKind | null>(null)
  const pristineRef = useRef<string | null>(null)
  const inputRevision = useRef(0)

  const invalidateReport = () => {
    inputRevision.current += 1
    setReport(null)
    setError(null)
    setNotes([])
  }

  const reset = (nextText: string, nextNotes: string[]) => {
    inputRevision.current += 1
    setText(nextText)
    setNotes(nextNotes)
    setReport(null)
    setError(null)
  }

  const loadExample = async (kind: ExampleKind) => {
    const revision = inputRevision.current
    setBusy(true)
    try {
      const artifact = await makeExample(kind)
      if (revision !== inputRevision.current) return
      // tamper/label by DETECTED kind — an example may wrap another artifact
      // (e.g. the factory reference check is an attestation-wrapped credential)
      const detected = detectArtifact(artifact)
      const pristine = JSON.stringify(artifact, null, 2)
      pristineRef.current = pristine
      setSelectedExample(kind)
      setTampered(false)
      const provenance = liveKeyExamples.has(kind)
        ? 'signed just now with an in-session key from synthetic checked-in inputs'
        : 'generated from synthetic checked-in inputs'
      reset(pristine, [`Loaded a synthetic sandbox ${KIND_LABELS[detected]}, ${provenance} — labeled synthetic in its fields.`])
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
    const revision = inputRevision.current
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
      const nextReport = await verifyArtifact(parsed.value, pin ? { expectedThumbprint: pin } : {})
      if (revision === inputRevision.current) setReport(nextReport)
    } catch (e) {
      if (revision === inputRevision.current) {
        setReport(null)
        setError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setBusy(false)
    }
  }

  const clearAll = () => {
    pristineRef.current = null
    setTampered(false)
    setThumbprint('')
    setSelectedExample(null)
    reset('', [])
  }

  const resetExample = () => {
    if (pristineRef.current == null) return
    setTampered(false)
    reset(pristineRef.current, ['Restored the original example. Verify again to inspect its integrity and trust status.'])
  }

  const verdictTone = report ? (report.ok ? 'ok' : report.verdict === 'UNRECOGNIZED' || report.verdict === 'UNTRUSTED' ? 'info' : 'bad') : null

  return (
    <div className="vfy-grid product-workspace">
      <ol className="workspace-steps" aria-label="Verification workflow">
        <li><span>01</span><div><b>Bring an artifact</b>Paste JSON or load an example</div></li>
        <li><span>02</span><div><b>Check its integrity</b>Inspect the verdict and its scope</div></li>
        <li><span>03</span><div><b>Challenge the result</b>Change one field, then re-verify</div></li>
      </ol>
      <article className="product-panel">
        <div className="workspace-heading">
          <p className="workspace-eyebrow">Evidence verifier · runs locally</p>
          <h2>Put the evidence to the test.</h2>
          <p className="section__lede">Start with a synthetic example or paste your own artifact. A signature, a trusted issuer, and a confirmed execution each mean something different. The result explains what this artifact establishes.</p>
        </div>
        <div className="vfy-examples">
          <span id="vfy-examples-label">Load a synthetic example:</span>
          {EXAMPLES.map((ex) => (
            <button key={ex.kind} className="btn btn--ghost btn--sm" onClick={() => void loadExample(ex.kind)} disabled={busy}
              aria-describedby="vfy-examples-label" aria-pressed={selectedExample === ex.kind}>
              {ex.label}
            </button>
          ))}
        </div>
        <div className="vfy-workbench">
          <div className="vfy-editor">
            <div className="field">
              <label htmlFor="vfy-artifact">Artifact JSON</label>
              <textarea id="vfy-artifact" className="vfy-input" rows={14} spellCheck={false} autoComplete="off"
                placeholder='{ "sigil_schema_version": "1.0.0", … }'
                aria-describedby="vfy-hint" value={text}
                onChange={(e) => {
                  const nextText = e.target.value
                  invalidateReport()
                  setText(nextText)
                  setTampered(false)
                  setSelectedExample(null)
                  pristineRef.current = null
                }} />
            </div>
            <p className="vfy-note" id="vfy-hint">Nothing you paste is uploaded or stored. Verification runs entirely in this tab.</p>
            <div className="field vfy-pin">
              <label htmlFor="vfy-thumbprint">Pin issuer thumbprint (optional — Origin Attestations only)</label>
              <input id="vfy-thumbprint" type="text" spellCheck={false} autoComplete="off"
                placeholder="Expected signer thumbprint"
                value={thumbprint} onChange={(e) => { invalidateReport(); setThumbprint(e.target.value) }} />
              <p className="vfy-note">For standalone Origin Attestation signatures: compare the signer with a thumbprint you already trust. This field does not configure issuer trust for Action/Run evidence.</p>
            </div>
            <div className="vfy-actions">
              <button className="btn btn--primary btn--sm" onClick={() => void runVerify()} disabled={busy || text.trim() === ''} aria-busy={busy}>Verify</button>
              <button className="btn btn--ghost btn--sm" onClick={clearAll} disabled={busy || (text === '' && !report && !error)}>Clear</button>
              <button className="btn btn--ghost btn--sm" onClick={resetExample} disabled={busy || selectedExample == null}>Reset selected example</button>
              <label className="vfy-toggle">
                <input type="checkbox" checked={tampered} onChange={(e) => toggleTamper(e.target.checked)} disabled={busy} />
                Tamper one field (see it void)
              </label>
            </div>
          </div>
          <div className="vfy-result" aria-live="polite" aria-label="Verification result">
            <span className="workspace-eyebrow">The verification record</span>
            {!report && !error ? (
              <div className="workspace-empty">
                <b>{text.trim() ? 'Ready to inspect.' : 'Your result starts here.'}</b>
                <p>{text.trim() ? 'Select Verify to check the current artifact. Editing the JSON or signer pin clears the previous verdict.' : 'Load an example or paste JSON, then select Verify. You will see the checks, their outcome, and the limits of that outcome.'}</p>
              </div>
            ) : null}
            {notes.map((n, i) => <p className="vfy-note" key={i}>{n}</p>)}
            {error ? (
              <div className="vfy-verdict vfy-verdict--bad" role="status"><b>NOT VERIFIABLE</b><span>{error}</span></div>
            ) : null}
            {report && verdictTone ? (
              <>
                <div className={`vfy-verdict vfy-verdict--${verdictTone}`} role="status">
                  <b>{report.verdict}</b>
                  <span>{KIND_LABELS[report.kind]}{report.code != null ? ` · code ${report.code}` : ''}</span>
                </div>
                <p className="section__lede" style={{ marginTop: 16 }}>{report.headline}</p>
                <Log lines={report.lines} />
                <p className="vfy-note"><b>What this establishes:</b> {report.scope}</p>
              </>
            ) : null}
          </div>
        </div>
      </article>
      <details className="product-panel vfy-detection workspace-details">
        <summary>Which artifacts can I verify? See formats, checks, and verdict codes.</summary>
        <DetectionTable />
      </details>
    </div>
  )
}
