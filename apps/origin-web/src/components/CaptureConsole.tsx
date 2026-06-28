import { useEffect, useRef, useState } from 'react'
import {
  CAPTURE_ROLES,
  createCaptureManifest,
  driveLinkToCaptureItem,
  fileMetaToCaptureItem,
  type CaptureItem,
  type CaptureManifest,
  type CaptureRole,
  type FloorLayoutSpec,
} from '../captureManifest'
import {
  PHYSICAL_DOMAINS,
  ROBOT_EMBODIMENTS,
  getDomainTheme,
  getEmbodimentProfile,
  type EnvironmentRequirement,
  type PhysicalDomain,
  type RobotEmbodiment,
} from '../environmentPlan'
import { VoiceInput } from './VoiceInput'
import type { VoiceFields } from '../useVoiceWorkflow'
import { FloorLibrary } from './FloorLibrary'
import { floorToCaptureFields } from '../staerAdapter'
import type { FloorCatalogEntry } from '../brainTypes'

const ROLE_LABEL: Record<CaptureRole, string> = {
  workflow_video: 'Workflow video',
  site_photo: 'Site photo',
  floor_plan: 'Floor plan',
  sop: 'SOP / manual',
  forbidden_example: 'Forbidden example',
  robot_profile: 'Robot profile',
  google_drive: 'Google Drive',
}

/** Pull the numeric floor counts out of a template entry's loosely-typed layout. */
function coerceFloorLayout(layout: unknown): FloorLayoutSpec | undefined {
  if (!layout || typeof layout !== 'object') return undefined
  const o = layout as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  const spec: FloorLayoutSpec = {
    docks: num(o.docks),
    aisles: num(o.aisles),
    staging_lanes: num(o.staging_lanes),
    robots: num(o.robots),
    no_go_zones: num(o.no_go_zones),
  }
  return Object.values(spec).some((v) => v !== undefined) ? spec : undefined
}

// The recognizable input types we surface as example chips above the picker.
// Same vocabulary as the per-file classification dropdown, so the chips, the
// upload, and the dropdown all teach one consistent mental model.
const UPLOAD_EXAMPLE_ROLES: CaptureRole[] = [
  'workflow_video',
  'site_photo',
  'floor_plan',
  'sop',
  'forbidden_example',
]

const VIDEO_ACCEPT =
  'video/mp4,video/quicktime,video/webm,video/x-msvideo,video/mpeg,image/*,application/pdf,text/plain,.mov,.mp4,.webm,.avi,.mpeg,.pdf,.txt,.md'

function formatSize(size: number | null): string {
  if (size == null) return 'linked'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function CaptureConsole({
  onAnalyze,
  onManual,
  onBack,
}: {
  onAnalyze: (req: EnvironmentRequirement, manifest: CaptureManifest) => void
  onManual: (req: EnvironmentRequirement, manifest: CaptureManifest) => void
  onBack: () => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [outcome, setOutcome] = useState(
    'A robot assistant for my dad’s factory that can move totes safely without entering operator-only cells.',
  )
  const [description, setDescription] = useState(
    'Dad receives a tote, checks the lane, carries it to packing, and stops when a forklift lane or operator-only cell is active.',
  )
  const [rules, setRules] = useState('Never enter operator-only cells\nEscalate if a forklift lane blocks the route')
  const [domain, setDomain] = useState<PhysicalDomain>('manufacturing')
  const [embodiments, setEmbodiments] = useState<RobotEmbodiment[]>(['humanoid'])
  const embodiment = embodiments[0] ?? 'humanoid' // primary type (back-compat)
  // toggle a type in the expected set — keep ≥1, cap at 5
  const toggleEmbodiment = (e: RobotEmbodiment) =>
    setEmbodiments((prev) =>
      prev.includes(e) ? (prev.length > 1 ? prev.filter((x) => x !== e) : prev) : prev.length < 5 ? [...prev, e] : prev,
    )
  const [items, setItems] = useState<CaptureItem[]>([])
  const [driveUrl, setDriveUrl] = useState('')
  const [dragging, setDragging] = useState(false)
  const [voiceFilled, setVoiceFilled] = useState(false)
  const [highlight, setHighlight] = useState(false)
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null)
  const [floorLayout, setFloorLayout] = useState<FloorLayoutSpec | undefined>(undefined)
  const fillTimer = useRef<number | null>(null)
  // Clear the highlight timer on unmount so a fast Back/route change can't setState
  // after the component is gone.
  useEffect(() => () => {
    if (fillTimer.current) window.clearTimeout(fillTimer.current)
  }, [])

  const theme = getDomainTheme(domain)
  const profile = getEmbodimentProfile(embodiment)
  const canContinue = outcome.trim().length >= 8

  function buildManifest(): { req: EnvironmentRequirement; manifest: CaptureManifest } {
    const safetyRules = rules
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean)
    const req: EnvironmentRequirement = {
      outcome: outcome.trim(),
      domain,
      embodiment,
      notes: description.trim() || undefined,
      attachments: items.map((item) => `${ROLE_LABEL[item.role]}: ${item.name}`),
    }
    const manifest = createCaptureManifest({
      outcome: req.outcome,
      domain,
      expectedEmbodiment: embodiment,
      expectedEmbodiments: embodiments,
      description,
      safetyRules,
      items,
      floorLayout,
    })
    return { req, manifest }
  }

  // Voice intake pre-fills the form from speech (structured server-side by MiniMax).
  // Only non-empty, valid fields override what's there; the operator still reviews.
  function applyVoice(f: VoiceFields) {
    if (f.outcome) setOutcome(f.outcome)
    if (f.description) setDescription(f.description)
    if (f.safetyRules && f.safetyRules.length) setRules(f.safetyRules.join('\n'))
    if (f.domain && (PHYSICAL_DOMAINS as string[]).includes(f.domain)) setDomain(f.domain as PhysicalDomain)
    if (f.embodiment && (ROBOT_EMBODIMENTS as string[]).includes(f.embodiment)) {
      setEmbodiments([f.embodiment as RobotEmbodiment])
    }
    setVoiceFilled(true)
    setHighlight(true)
    if (fillTimer.current) window.clearTimeout(fillTimer.current)
    fillTimer.current = window.setTimeout(() => setHighlight(false), 4000)
  }

  // Picking a reference floor pre-fills the capture form (descriptive only); the
  // deterministic oracle still judges the run downstream.
  function pickFloor(entry: FloorCatalogEntry) {
    const f = floorToCaptureFields(entry)
    setOutcome(f.outcome)
    setDescription(f.description)
    setRules(f.rules)
    setDomain(f.domain)
    setEmbodiments([f.embodiment])
    setSelectedFloorId(entry.id)
    setFloorLayout(coerceFloorLayout(entry.layout))
    setHighlight(true)
    if (fillTimer.current) window.clearTimeout(fillTimer.current)
    fillTimer.current = window.setTimeout(() => setHighlight(false), 4000)
  }

  function addFiles(files: FileList | File[]) {
    const next = Array.from(files).map((file, index) =>
      fileMetaToCaptureItem(
        { name: file.name, type: file.type, size: file.size },
        items.length + index,
      ),
    )
    setItems((prev) => [...prev, ...next])
  }

  function addDriveLink() {
    const item = driveLinkToCaptureItem(driveUrl, items.length)
    if (!item) return
    setItems((prev) => [...prev, item])
    setDriveUrl('')
  }

  function updateRole(id: string, role: CaptureRole) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, role } : item)))
  }

  function submit(mode: 'analyze' | 'manual') {
    if (!canContinue) return
    const payload = buildManifest()
    if (mode === 'manual') onManual(payload.req, payload.manifest)
    else onAnalyze(payload.req, payload.manifest)
  }

  return (
    <section className="capture">
      <div className="flow-shell">
        <button className="btn ghost back" onClick={onBack}>
          ← Back
        </button>
        <div className="flow-kicker">Create your site</div>
        <h1>Create your site before the robot ever steps on it.</h1>
        <p className="flow-sub">
          Two ways to begin: <strong>start from a template</strong> below, or{' '}
          <strong>build your own</strong> — upload a video, paste a Google Drive link, describe it by
          voice, or just type it out. Origin turns whichever you choose into a deterministic
          robot-safety gym and a readiness report. Metadata only in this demo — nothing is uploaded
          or parsed.
        </p>

        <div className="capture-divider">
          <span className="capture-divider-n">1</span>
          <div>
            <h2 className="capture-divider-title">Start from a template</h2>
            <p className="capture-divider-sub">
              Pick a ready-made factory floor — it pre-fills the whole brief, and you customize it in
              the next steps. Click any card to preview the layout.
            </p>
          </div>
        </div>

        <div className="floorlib">
          <FloorLibrary selectedId={selectedFloorId} onPick={pickFloor} />
        </div>

        {selectedFloorId && (
          <div className="voice-review" role="status">
            <span className="vr-check" aria-hidden="true">✓</span>
            <p>
              Template loaded — review your brief in fields <strong>1–3</strong> below, then press{' '}
              <strong>Analyze workflow</strong>.
            </p>
          </div>
        )}

        <div className="capture-divider">
          <span className="capture-divider-n">2</span>
          <div>
            <h2 className="capture-divider-title">Or build your own site</h2>
            <p className="capture-divider-sub">
              No template needed — tell Origin about your real workflow. Mix any of the methods
              below; it all lands in the same brief you’ll review.
            </p>
          </div>
        </div>
        <p className="capture-modes" aria-label="Ways to describe your site">
          <span>🎙 Describe by voice</span>
          <span>🎥 Upload a video</span>
          <span>🔗 Paste a Drive link</span>
          <span>⌨️ Type it out</span>
        </p>

        <VoiceInput onFields={applyVoice} />

        {voiceFilled && (
          <div className="voice-review" role="status">
            <span className="vr-check" aria-hidden="true">✓</span>
            <p>
              Filled from your voice — review fields <strong>1–3</strong> below, then press{' '}
              <strong>Analyze workflow</strong>.
            </p>
          </div>
        )}

        <div className="capture-layout">
          <div
            className={`upload-zone ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              addFiles(e.dataTransfer.files)
            }}
          >
            <div className="upload-orb">↑</div>
            <h2>Add anything that shows the site</h2>
            <ul className="upload-types" aria-label="Examples of useful inputs">
              {UPLOAD_EXAMPLE_ROLES.map((role) => (
                <li key={role} className="upload-type">
                  {ROLE_LABEL[role]}
                </li>
              ))}
            </ul>
            <p>
              Drag files in, or select them below. MP4, MOV, images, PDFs, and notes — metadata
              only in this demo; nothing is uploaded or parsed.
            </p>
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              aria-label="Choose site files to add"
              multiple
              accept={VIDEO_ACCEPT}
              onChange={(e) => {
                if (e.currentTarget.files) addFiles(e.currentTarget.files)
                e.currentTarget.value = ''
              }}
            />
            <button className="btn primary" onClick={() => inputRef.current?.click()}>
              Select files
            </button>
            <div className="drive-row">
              <span className="drive-logo" aria-hidden="true">
                <svg viewBox="0 0 87.3 78" width="18" height="18">
                  <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
                  <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
                  <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
                  <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
                  <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
                  <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
                </svg>
              </span>
              <input
                className="field-input"
                value={driveUrl}
                placeholder="Paste a Google Drive link"
                onChange={(e) => setDriveUrl(e.target.value)}
              />
              <button className="btn" onClick={addDriveLink}>
                Add link
              </button>
            </div>
          </div>

          <div className="capture-form">
            <label className={`field ${highlight ? 'field-filled' : ''}`}>
              <span className="field-label">
                <span className="field-num">1</span> Outcome requirement
              </span>
              <textarea
                className="field-input"
                rows={3}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              />
            </label>
            <label className={`field ${highlight ? 'field-filled' : ''}`}>
              <span className="field-label">
                <span className="field-num">2</span> What happens in the workflow?
              </span>
              <textarea
                className="field-input"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className={`field ${highlight ? 'field-filled' : ''}`}>
              <span className="field-label">
                <span className="field-num">3</span> Safety rules
              </span>
              <textarea
                className="field-input"
                rows={3}
                value={rules}
                onChange={(e) => setRules(e.target.value)}
              />
            </label>
            <div className="capture-selects">
              <label className="field">
                <span className="field-label">Deployment context</span>
                <select className="field-input" value={domain} onChange={(e) => setDomain(e.target.value as PhysicalDomain)}>
                  {PHYSICAL_DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {getDomainTheme(d).label}
                    </option>
                  ))}
                </select>
                <span className="field-hint">{theme.blurb}</span>
              </label>
              <div className="field">
                <span className="field-label">Expected robots — pick up to 5 types</span>
                <div className="embodiment-picker" role="group" aria-label="Expected robot types">
                  {ROBOT_EMBODIMENTS.filter((e) => e !== 'other').map((e) => {
                    const on = embodiments.includes(e)
                    return (
                      <button
                        type="button"
                        key={e}
                        className={`embodiment-chip ${on ? 'on' : ''}`}
                        aria-pressed={on}
                        disabled={!on && embodiments.length >= 5}
                        onClick={() => toggleEmbodiment(e)}
                        title={getEmbodimentProfile(e).label}
                      >
                        {getEmbodimentProfile(e).label}
                      </button>
                    )
                  })}
                </div>
                <span className="field-hint">
                  {embodiments.length === 1
                    ? profile.note
                    : `${embodiments.length} types — your proving ground will run a mixed fleet.`}
                </span>
              </div>
            </div>
          </div>
        </div>

        <details className="tips">
          <summary>
            <span className="cg-badge" aria-hidden="true">TIP</span>
            <span className="tips-primary">
              <strong>Good footage shows</strong> start area, the item, drop-off, hazards,
              human-only zones, and the robot’s path.
            </span>
            <span className="tips-more">More tips</span>
          </summary>
          <ul className="tips-list">
            <li>
              <strong>Show what’s forbidden</strong> — cells the robot must never enter, and
              actions it must refuse.
            </li>
            <li>
              <strong>Note the limits</strong> — battery / shift time, lifting limits, and when it
              should call a person.
            </li>
          </ul>
        </details>

        <div className="capture-items">
          {items.length === 0 ? (
            <div className="empty-upload">
              No files yet — that’s fine. Describe the site by voice or in the fields, or add files
              above.
            </div>
          ) : (
            <>
              <div className="capture-items-head">
                <h3>Your inputs · {items.length}</h3>
                <p>Pick what each file shows — it helps map your site (metadata only; files aren’t parsed).</p>
              </div>
              {items.map((item) => (
                <div className="capture-card" key={item.id}>
                  <div className="cc-main">
                    <strong className="cc-name">{item.name}</strong>
                    <span className="cc-meta">{item.type} · {formatSize(item.size)}</span>
                  </div>
                  <label className="cc-role">
                    <span className="cc-role-label">What is this?</span>
                    <select
                      value={item.role}
                      onChange={(e) => updateRole(item.id, e.target.value as CaptureRole)}
                    >
                      {CAPTURE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABEL[role]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="btn ghost"
                    onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="flow-actions">
          <button className="btn primary hero-action" onClick={() => submit('analyze')} disabled={!canContinue}>
            Analyze workflow
          </button>
          <button className="btn ghost" onClick={() => submit('manual')} disabled={!canContinue}>
            Map manually instead
          </button>
          <span className="trust-note">Local metadata only · no upload · no model spend</span>
        </div>
      </div>
    </section>
  )
}

