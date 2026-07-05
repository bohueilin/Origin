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
import { runSiteToGymPipeline } from '../site-to-gym/pipeline'
import type { SiteGymStepStatus, SiteToGymRun } from '../site-to-gym/types'
import {
  DRAFT_REVIEW_STATE,
  approveReviewState,
  correctionReviewState,
  exportedReviewState,
  reviewGateCopy,
} from '../site-to-gym/humanReview'
import { bundleToClipboardText, downloadEvidenceBundle } from '../site-to-gym/exportBundle'
import { createDemoSitePackage } from '../site-to-gym/samplePackage'
import {
  CUSTOMER_CALIBRATION_SUMMARY,
  CUSTOMER_CALIBRATION_TASKS,
  formatCalibrationPercent,
} from '../site-to-gym/customerCalibrationSummary'
import {
  CUSTOMER_POLICY_GATE_SUMMARY,
  formatPolicyGatePercent,
} from '../site-to-gym/customerPolicyGateSummary'
import {
  CUSTOMER_ROBUSTNESS_SUMMARY,
  formatRobustnessPercent,
} from '../site-to-gym/customerRobustnessSummary'
import {
  CUSTOMER_HARDCASE_SUMMARY,
  formatHardCasePercent,
} from '../site-to-gym/customerHardCaseSummary'
import {
  REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY,
  realCustomerGateStateClass,
} from '../site-to-gym/realCustomerEvidenceGateSummary'
import {
  AUTHORIZED_FIXTURE_GATE_SUMMARY,
  formatAuthorizedFixturePercent,
} from '../site-to-gym/authorizedFixtureGateSummary'
import { DESIGN_PARTNER_INTAKE_SUMMARY } from '../site-to-gym/designPartnerIntakeSummary'

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

const INPUT_METHODS: Array<{
  title: string
  detail: string
  role: CaptureRole
}> = [
  {
    title: 'Upload floor plan',
    detail: 'PDF, scan, CAD export, or marked-up map for walls, rooms, portals, and scale.',
    role: 'floor_plan',
  },
  {
    title: 'Upload site video',
    detail: 'Walkthroughs help Origin infer paths, sight lines, obstacles, and operational context.',
    role: 'workflow_video',
  },
  {
    title: 'Upload photos',
    detail: 'Dock doors, shelves, hazard tape, human-only zones, and workstation context.',
    role: 'site_photo',
  },
  {
    title: 'Add site references',
    detail: 'Google Drive links, SOPs, robot specs, incident examples, or deployment notes.',
    role: 'google_drive',
  },
]

const SITE_OUTPUTS = [
  'Structured 2D site map',
  'Video-assisted spatial hints',
  'Obstacle and restricted-zone ledger',
  'Finish / escalate / refuse task set',
]

const RSI_PIPELINE = [
  {
    step: '01',
    title: 'Customer site context',
    detail: 'Floor plans, walkthroughs, photos, SOPs, links, and notes define the real operating world.',
  },
  {
    step: '02',
    title: 'Site representation',
    detail: 'Origin builds the best available 2D map today and preserves evidence for richer 3D reconstruction.',
  },
  {
    step: '03',
    title: 'Task planner',
    detail: 'The site becomes many start / item / drop / obstacle / restricted-zone tasks for the robot.',
  },
  {
    step: '04',
    title: 'Evidence-backed verification',
    detail: 'A rule-based environment labels finish, escalate, or refuse. The model never grades itself.',
  },
  {
    step: '05',
    title: 'Supervised run',
    detail: 'Labels, rewards, counterfactuals, and hard negatives become training and evaluation signal.',
  },
  {
    step: '06',
    title: 'Deployment evidence',
    detail: 'Teams get refuse recall, unsafe- / missed-action rates, trace proof, and a measured readiness boundary.',
  },
]

const VIDEO_ACCEPT =
  'video/mp4,video/quicktime,video/webm,video/x-msvideo,video/mpeg,image/*,application/pdf,text/plain,.mov,.mp4,.webm,.avi,.mpeg,.pdf,.txt,.md'

function formatSize(size: number | null): string {
  if (size == null) return 'linked'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatPhase(phase: string): string {
  return phase.replaceAll('_', ' ')
}

function hasCell(cells: readonly { x: number; y: number }[], x: number, y: number): boolean {
  return cells.some((cell) => cell.x === x && cell.y === y)
}

function mapCell(run: SiteToGymRun, x: number, y: number): { label: string; cls: string } {
  const map = run.siteMap
  if (map.start.x === x && map.start.y === y) return { label: 'S', cls: 'start' }
  if (map.item.x === x && map.item.y === y) return { label: 'I', cls: 'item' }
  if (map.drop.x === x && map.drop.y === y) return { label: 'D', cls: 'drop' }
  if (hasCell(map.hazards, x, y)) return { label: 'H', cls: 'hazard' }
  if (hasCell(map.humanOnly, x, y)) return { label: 'R', cls: 'restricted' }
  if (hasCell(map.obstacles, x, y)) return { label: '#', cls: 'obstacle' }
  if (hasCell(map.robots, x, y)) return { label: 'B', cls: 'robot' }
  if (run.siteRepresentation.uncertain_regions.length && x === Math.max(0, map.width - 3) && y === map.height - 2) {
    return { label: '?', cls: 'uncertain' }
  }
  return { label: '', cls: 'free' }
}

function deferStateUpdate(fn: () => void): void {
  if (typeof queueMicrotask === 'function') queueMicrotask(fn)
  else window.setTimeout(fn, 0)
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
  const [filesById, setFilesById] = useState<Record<string, File>>({})
  const [siteGymRun, setSiteGymRun] = useState<SiteToGymRun | null>(null)
  const [siteGymPhase, setSiteGymPhase] = useState<SiteGymStepStatus | 'idle' | 'blocked'>('idle')
  const [siteGymError, setSiteGymError] = useState<string | null>(null)
  const [reviewState, setReviewState] = useState(DRAFT_REVIEW_STATE)
  const [reviewNotes, setReviewNotes] = useState('')
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [customerDemoMode, setCustomerDemoMode] = useState(false)
  const fillTimer = useRef<number | null>(null)
  // Clear the highlight timer on unmount so a fast Back/route change can't setState
  // after the component is gone.
  useEffect(() => () => {
    if (fillTimer.current) window.clearTimeout(fillTimer.current)
  }, [])

  const theme = getDomainTheme(domain)
  const profile = getEmbodimentProfile(embodiment)
  const canContinue = outcome.trim().length >= 8
  const localFiles = items.filter((item) => item.kind === 'local_file').length
  const driveLinks = items.filter((item) => item.kind === 'google_drive_link').length
  const roleSummary = CAPTURE_ROLES
    .map((role) => ({ role, count: items.filter((item) => item.role === role).length }))
    .filter(({ count }) => count > 0)
  const notesCount = [outcome, description, rules].filter((value) => value.trim().length > 0).length
  const processingStatus = items.length > 0
    ? siteGymPhase === 'processing'
      ? 'Processing media into site context'
      : siteGymRun
        ? `Trace ${formatPhase(siteGymRun.trace.verdict)} · ${siteGymRun.metrics.taskCount} verified tasks`
        : 'Ready to generate a best-effort site representation'
    : 'Waiting for site evidence or notes'
  const nextAction = canContinue
    ? siteGymRun
      ? 'Review the generated map, tasks, metrics, and trace'
      : 'Review the summary, then generate the verification run'
    : 'Describe the job the robot must perform'

  useEffect(() => {
    let active = true
    if (items.length === 0) {
      deferStateUpdate(() => {
        if (!active) return
        setSiteGymRun(null)
        setSiteGymPhase('idle')
        setSiteGymError(null)
      })
      return () => {
        active = false
      }
    }

    const safetyRules = rules
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean)
    const manifest = createCaptureManifest({
      outcome: outcome.trim() || 'Customer site readiness run',
      domain,
      expectedEmbodiment: embodiment,
      expectedEmbodiments: embodiments,
      description,
      safetyRules,
      items,
      floorLayout,
    })

    deferStateUpdate(() => {
      if (!active) return
      setSiteGymPhase('processing')
      setSiteGymError(null)
    })
    runSiteToGymPipeline({ manifest, filesById, reviewState })
      .then((run) => {
        if (!active) return
        setSiteGymRun(run)
        setSiteGymPhase(run.trace.verdict === 'ready' ? 'complete' : run.trace.verdict)
      })
      .catch((error: unknown) => {
        if (!active) return
        setSiteGymRun(null)
        setSiteGymPhase('failed')
        setSiteGymError(error instanceof Error ? error.message : 'Site-to-Gym processing failed.')
      })

    return () => {
      active = false
    }
  }, [description, domain, embodiment, embodiments, filesById, floorLayout, items, outcome, reviewState, rules])

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
    const inputFiles = Array.from(files)
    const next = inputFiles.map((file, index) =>
      fileMetaToCaptureItem(
        { name: file.name, type: file.type, size: file.size },
        items.length + index,
      ),
    )
    setFilesById((prev) => {
      const copy = { ...prev }
      next.forEach((item, index) => {
        copy[item.id] = inputFiles[index]
      })
      return copy
    })
    setReviewState(DRAFT_REVIEW_STATE)
    setExportStatus(null)
    setCustomerDemoMode(false)
    setItems((prev) => [...prev, ...next])
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id))
    setFilesById((prev) => {
      const copy = { ...prev }
      delete copy[id]
      return copy
    })
    setReviewState(DRAFT_REVIEW_STATE)
    setExportStatus(null)
    setCustomerDemoMode(false)
  }

  function loadSamplePackage() {
    const sample = createDemoSitePackage()
    setOutcome(sample.notes.outcome)
    setDescription(sample.notes.description)
    setRules(sample.notes.rules)
    setDomain(sample.manifest.domain)
    setEmbodiments(sample.manifest.expectedEmbodiments ?? [sample.manifest.expectedEmbodiment])
    setItems(sample.items)
    setFilesById({})
    setSelectedFloorId(null)
    setFloorLayout(undefined)
    setReviewState(DRAFT_REVIEW_STATE)
    setReviewNotes('Loaded demo customer package.')
    setExportStatus(null)
    setCustomerDemoMode(true)
  }

  function markNeedsCorrection() {
    setReviewState(correctionReviewState(reviewNotes))
    setExportStatus('Map marked needs correction. Bundle remains draft-qualified.')
  }

  function approveMap() {
    setReviewState(approveReviewState(reviewNotes))
    setExportStatus(
      customerDemoMode
        ? 'Map approved. This is a synthetic demo bundle — it proves the review workflow, not real-customer or pilot readiness.'
        : 'Map approved. Bundle can be treated as a customer-reviewed draft — pilot readiness still requires an approved real-customer site and policy evaluation.',
    )
  }

  function regenerateWithNotes() {
    const note = reviewNotes.trim()
    if (note) setDescription((prev) => `${prev.trim()}\n\nReviewer note: ${note}`.trim())
    setReviewState(DRAFT_REVIEW_STATE)
    setExportStatus('Regenerated with reviewer notes as draft evidence.')
  }

  function exportBundle(markExported: boolean) {
    if (!siteGymRun) return
    downloadEvidenceBundle(siteGymRun.evidenceBundle)
    if (markExported) setReviewState(exportedReviewState(siteGymRun.reviewState))
    setExportStatus(markExported ? 'Evidence bundle exported.' : 'Draft evidence bundle downloaded.')
  }

  async function copyBundle() {
    if (!siteGymRun) return
    const text = bundleToClipboardText(siteGymRun.evidenceBundle)
    try {
      await navigator.clipboard?.writeText(text)
      setExportStatus('Evidence bundle JSON copied.')
    } catch {
      setExportStatus('Clipboard unavailable; use Download bundle instead.')
    }
  }

  function addDriveLink() {
    const item = driveLinkToCaptureItem(driveUrl, items.length)
    if (!item) return
    setItems((prev) => [...prev, item])
    setReviewState(DRAFT_REVIEW_STATE)
    setExportStatus(null)
    setCustomerDemoMode(false)
    setDriveUrl('')
  }

  function updateRole(id: string, role: CaptureRole) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, role } : item)))
    setReviewState(DRAFT_REVIEW_STATE)
    setExportStatus(null)
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
        <p className="pilot-banner" role="note" aria-label="Preview environment notice">
          <span className="pilot-dot" aria-hidden="true" />
          <span>
            <strong>Private-pilot preview · simulated data</strong> — this is step one: set up and
            verify your site. The live operator console runs it on your floor during a supervised pilot.
          </span>
        </p>
        <h1>Create your site before the robot ever steps on it.</h1>
        <p className="flow-sub">
          Give Origin the context a robotics team normally has to reconstruct by hand: floor plans,
          walkthrough videos, photos, SOPs, links, constraints, and the work the robot must perform.
          Origin turns that evidence into a site map, plans safe task steps, and verifies them against
          operator-grade telemetry before any live deployment.
        </p>

        <div className="site-thesis" aria-label="How Origin turns site context into robot readiness">
          <div>
            <span>Customer inputs</span>
            <strong>Plans, videos, docs, notes</strong>
          </div>
          <div>
            <span>Origin builds</span>
            <strong>2D map + task environment</strong>
          </div>
          <div>
            <span>Verification decides</span>
            <strong>Finish · escalate · refuse</strong>
          </div>
          <div>
            <span>Team receives</span>
            <strong>Verification metrics + trace proof</strong>
          </div>
        </div>

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
              <strong>Generate verification run</strong>.
            </p>
          </div>
        )}

        <div className="capture-divider">
          <span className="capture-divider-n">2</span>
          <div>
            <h2 className="capture-divider-title">Or build your own site</h2>
            <p className="capture-divider-sub">
              No template needed. Combine floor plans, walkthroughs, photos, cloud folders, SOPs,
              and notes; Origin compiles them into one reviewed site brief.
            </p>
          </div>
        </div>
        <div className="capture-modes" aria-label="Ways to describe your site">
          {INPUT_METHODS.map((method) => (
            <span key={method.title}>
              <strong>{method.title}</strong>
              {method.detail}
            </span>
          ))}
        </div>

        <VoiceInput onFields={applyVoice} />

        {voiceFilled && (
          <div className="voice-review" role="status">
            <span className="vr-check" aria-hidden="true">✓</span>
            <p>
              Filled from your voice — review fields <strong>1–3</strong> below, then press{' '}
              <strong>Generate verification run</strong>.
            </p>
          </div>
        )}

        <div className="capture-layout">
          <div className="site-intake-stack">
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
              <div className="upload-head">
                <div className="upload-orb">↥</div>
                <div>
                  <span className="panel-kicker">Site evidence intake</span>
                  <h2>Add anything that shows the site</h2>
                  <p>
                    Upload floor plans, walkthrough videos, photos, PDFs, SOPs, or notes. Origin
                    uses the available context to build the best possible site representation:
                    structured 2D now, richer 3D-aware reconstruction when the evidence supports it.
                  </p>
                </div>
              </div>
              <ul className="upload-types" aria-label="Examples of useful inputs">
                {UPLOAD_EXAMPLE_ROLES.map((role) => (
                  <li key={role} className="upload-type">
                    {ROLE_LABEL[role]}
                  </li>
                ))}
              </ul>
              <div className="site-output-grid" aria-label="What Origin can extract">
                {SITE_OUTPUTS.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              <input
                ref={inputRef}
                className="sr-only"
                type="file"
                aria-label="Upload floor plans, walkthrough videos, photos, PDFs, or site notes"
                multiple
                accept={VIDEO_ACCEPT}
                onChange={(e) => {
                  if (e.currentTarget.files) addFiles(e.currentTarget.files)
                  e.currentTarget.value = ''
                }}
              />
              <div className="upload-actions">
                <button className="btn primary" onClick={() => inputRef.current?.click()}>
                  Upload files
                </button>
                <button className="btn" onClick={loadSamplePackage}>
                  Run customer-owned readiness demo
                </button>
                <span>MP4, MOV, images, PDFs, TXT, or Markdown</span>
              </div>
              <div className="drive-row">
                <span className="drive-logo" aria-hidden="true">
                  <svg viewBox="0 0 87.3 78" width="20" height="20">
                    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
                    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
                    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
                    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
                    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
                    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
                  </svg>
                </span>
                <div className="drive-copy">
                  <strong>Add site reference</strong>
                  <span>Drive folder, safety SOP, CAD export, or deployment notes</span>
                </div>
                <input
                  className="field-input"
                  value={driveUrl}
                  placeholder="Paste Google Drive or documentation link"
                  onChange={(e) => setDriveUrl(e.target.value)}
                />
                <button className="btn" onClick={addDriveLink}>
                  Add reference
                </button>
              </div>
            </div>

            <div className="capture-items" aria-live="polite">
              <div className="capture-items-head">
                <span className="panel-kicker">Live input ledger</span>
                <h3>Your inputs · {items.length}</h3>
                <p>
                  Confirmation state for what Origin can use: files, links, notes, detected types,
                  processing status, and next action.
                </p>
              </div>
              <div className="input-ledger">
                <div>
                  <span>Uploaded files</span>
                  <strong>{localFiles}</strong>
                </div>
                <div>
                  <span>Added links</span>
                  <strong>{driveLinks}</strong>
                </div>
                <div>
                  <span>Text fields</span>
                  <strong>{notesCount}/3</strong>
                </div>
                <div>
                  <span>Processing</span>
                  <strong>{processingStatus}</strong>
                </div>
              </div>
              {roleSummary.length > 0 ? (
                <div className="detected-types">
                  {roleSummary.map(({ role, count }) => (
                    <span key={role}>
                      {count} {ROLE_LABEL[role]}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="empty-upload">
                  No files or links yet. You can still proceed from notes, or add a floor plan,
                  walkthrough video, photo set, or site reference to improve the generated map.
                </div>
              )}
              {items.map((item) => (
                <div className="capture-card" key={item.id}>
                  <div className="cc-main">
                    <strong className="cc-name">{item.name}</strong>
                    <span className="cc-meta">{item.type} · {formatSize(item.size)}</span>
                  </div>
                  <label className="cc-role">
                    <span className="cc-role-label">Detected input type</span>
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
                    onClick={() => removeItem(item.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <div className="next-action">
                <span>Next recommended action</span>
                <strong>{nextAction}</strong>
              </div>
            </div>

            <section className={`site-gym-proof ${siteGymPhase}`} aria-labelledby="site-gym-proof-title">
              <div className="site-gym-head">
                <div>
                  <span className="panel-kicker">Video-to-verification MVP</span>
                  <h3 id="site-gym-proof-title">Local pipeline proof</h3>
                  <p>
                    Uploaded media now produces a bounded site representation, robot tasks, verified
                    labels, verification metrics, and a replayable trace. Video contributes keyframes
                    and spatial hints; uncertainty stays visible.
                  </p>
                </div>
                <div className={`trace-verdict ${siteGymPhase}`}>
                  <span>Status</span>
                  <strong>{formatPhase(siteGymPhase)}</strong>
                </div>
              </div>

              {siteGymError ? (
                <div className="site-gym-empty failed">
                  {siteGymError}
                </div>
              ) : siteGymRun ? (
                <>
                  <div className="founder-demo-strip" aria-label="Founder demo mode">
                    {[
                      ['Upload evidence', 'complete'],
                      ['Generate draft map', 'complete'],
                      ['Approve map', siteGymRun.reviewState.status === 'approved' || siteGymRun.reviewState.status === 'exported' ? 'complete' : 'needs review'],
                      ['Compile verification run', 'complete'],
                      ['Run verification', 'complete'],
                      ['Export trace', siteGymRun.reviewState.status === 'exported' ? 'complete' : 'exportable'],
                    ].map(([label, state]) => (
                      <div className={`demo-step ${state.replace(' ', '-')}`} key={label}>
                        <span>{state}</span>
                        <strong>{label}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="site-gym-pipeline" aria-label="Generated pipeline status">
                    {siteGymRun.pipelineSteps.map((step) => (
                      <div className={`pipeline-chip ${step.status}`} key={step.id}>
                        <span>{formatPhase(step.status)}</span>
                        <strong>{step.label}</strong>
                        <p>{step.artifactPreview}</p>
                        <small>{formatPercent(step.confidence)} confidence{step.action ? ` · ${step.action}` : ''}</small>
                      </div>
                    ))}
                  </div>

                  <div className="review-export-grid">
                    <div className="review-card">
                      <span className="panel-kicker">Human review gate</span>
                      <strong>{formatPhase(siteGymRun.reviewState.status)}</strong>
                      <p>{reviewGateCopy(siteGymRun)}</p>
                      <div className="review-score-grid">
                        <div><span>Parser source</span><strong>{formatPhase(siteGymRun.siteRepresentation.parserSource)}</strong></div>
                        <div><span>Review needed</span><strong>{siteGymRun.siteRepresentation.requiresHumanReview ? 'Yes' : 'No'}</strong></div>
                        <div><span>Uncertain</span><strong>{siteGymRun.siteRepresentation.uncertain_regions.length}</strong></div>
                        <div><span>Provenance</span><strong>{siteGymRun.provenance.length}</strong></div>
                      </div>
                      <textarea
                        className="field-input review-notes"
                        rows={3}
                        value={reviewNotes}
                        placeholder="Reviewer notes, corrections, or approval context"
                        onChange={(e) => setReviewNotes(e.target.value)}
                      />
                      <div className="review-actions">
                        <button className="btn primary" onClick={approveMap}>Approve map</button>
                        <button className="btn" onClick={markNeedsCorrection}>Mark needs correction</button>
                        <button className="btn ghost" onClick={regenerateWithNotes}>Regenerate with notes</button>
                        <button className="btn ghost" onClick={() => exportBundle(false)}>Export draft anyway</button>
                      </div>
                    </div>

                    <div className="export-card">
                      <span className="panel-kicker">Portable evidence bundle</span>
                      <strong>{siteGymRun.evidenceBundle.bundleId}</strong>
                      <p>
                        Exports site representation, compiler-ready customer_floor.json, robot tasks,
                        verified labels, verification metrics, trace JSON, review state, and claim boundaries.
                      </p>
                      <div className="bundle-files">
                        {siteGymRun.evidenceBundle.files.map((file) => (
                          <span key={file.path}>{file.path.replace('origin-site-gym-bundle/', '')}</span>
                        ))}
                      </div>
                      <div className="review-actions">
                        <button className="btn primary" onClick={() => exportBundle(true)}>Download bundle</button>
                        <button className="btn" onClick={copyBundle}>Copy JSON</button>
                      </div>
                      {exportStatus && <p className="export-status">{exportStatus}</p>}
                    </div>
                  </div>

                  {customerDemoMode && (
                    <div className="customer-loop-stack">
                      <div className="customer-readiness-demo">
                        <div className="demo-verdict">
                          <span className="panel-kicker">Customer-owned readiness demo</span>
                          <strong>Verdict path: safe-conservative, needs calibration</strong>
                          <p>
                            This sample generates a compiler-ready <code>customer_floor.json</code> for
                            the Floor-design verification run. The current saved budget policy catches
                            restricted-zone refuse cases, but the customer holdout shows over-refusal on
                            valid finish/escalate tasks, so it must be calibrated before live authority.
                          </p>
                        </div>
                        <div className="demo-readiness-grid">
                          <div>
                            <span>Synthetic demo floor</span>
                            <strong>{siteGymRun.customerFloor.site_map.width}x{siteGymRun.customerFloor.site_map.height}</strong>
                            <small>{siteGymRun.customerFloor.site_map.restricted.length} declared restricted cell(s)</small>
                          </div>
                          <div>
                            <span>Verified tasks</span>
                            <strong>{siteGymRun.metrics.labelDistribution.finish} / {siteGymRun.metrics.labelDistribution.escalate} / {siteGymRun.metrics.labelDistribution.refuse}</strong>
                            <small>finish / escalate / refuse in this web bundle</small>
                          </div>
                          <div>
                            <span>Readiness verdict</span>
                            <strong>SAFE_CONSERVATIVE</strong>
                            <small>Floor-design customer holdout: unsafe-action 0, missed-action high</small>
                          </div>
                          <div>
                            <span>Calibration plan</span>
                            <strong>Add customer positives</strong>
                            <small>reachable finish + blocked-path escalate near restricted zones</small>
                          </div>
                        </div>
                      </div>

                      <div className="calibration-needed-demo">
                        <div className="calibration-head">
                          <div>
                            <span className="panel-kicker">Customer calibration loop</span>
                            <strong>{CUSTOMER_CALIBRATION_SUMMARY.status}: reduce false refusals without weakening refuse</strong>
                            <p>
                              Origin turns the failure into customer-owned calibration data:
                              {` ${CUSTOMER_CALIBRATION_SUMMARY.generatedRows} calibration rows `}
                              across finish, escalate, and refuse. Labels still come only from evidence-backed verification.
                              Training stays disabled until the customer approves use of this customer-owned slice.
                            </p>
                          </div>
                          <div className="auth-pill">
                            <span>Training authorization</span>
                            <strong>{CUSTOMER_CALIBRATION_SUMMARY.authorization.trainingAllowed ? 'allowed' : 'blocked'}</strong>
                            <small>{CUSTOMER_CALIBRATION_SUMMARY.authorization.mode} · approval required</small>
                          </div>
                        </div>
                        <div className="calibration-metric-grid">
                          <div>
                            <span>Generated rows</span>
                            <strong>{CUSTOMER_CALIBRATION_SUMMARY.generatedRows}</strong>
                            <small>
                              F {CUSTOMER_CALIBRATION_SUMMARY.labelMix.finish} / E {CUSTOMER_CALIBRATION_SUMMARY.labelMix.escalate} / R {CUSTOMER_CALIBRATION_SUMMARY.labelMix.refuse}
                            </small>
                          </div>
                          <div>
                            <span>Current learned policy</span>
                            <strong>{formatCalibrationPercent(CUSTOMER_CALIBRATION_SUMMARY.before.balancedAccuracy)}</strong>
                            <small>FRR {formatCalibrationPercent(CUSTOMER_CALIBRATION_SUMMARY.before.falseRefuseRate)} · FAR {formatCalibrationPercent(CUSTOMER_CALIBRATION_SUMMARY.before.falseAcceptRate)}</small>
                          </div>
                          <div>
                            <span>Refuse recall held</span>
                            <strong>{formatCalibrationPercent(CUSTOMER_CALIBRATION_SUMMARY.before.refuseRecall)}</strong>
                            <small>restricted-zone tasks remain refused</small>
                          </div>
                          <div>
                            <span>Candidate eval</span>
                            <strong>{formatCalibrationPercent(CUSTOMER_CALIBRATION_SUMMARY.candidate.balancedAccuracy)}</strong>
                            <small>not trained · rule candidate only</small>
                          </div>
                        </div>
                        <div className="calibration-split-row">
                          {Object.entries(CUSTOMER_CALIBRATION_SUMMARY.splitMix).map(([split, mix]) => (
                            <div key={split}>
                              <span>{split}</span>
                              <strong>{mix.rows} rows</strong>
                              <small>F {mix.finish} / E {mix.escalate} / R {mix.refuse}</small>
                            </div>
                          ))}
                          <div>
                            <span>Split overlap</span>
                            <strong>0</strong>
                            <small>source, topology, occupancy hashes</small>
                          </div>
                        </div>
                        <div className="calibration-drill-grid">
                          {CUSTOMER_CALIBRATION_TASKS.map((task) => (
                            <article key={task.title}>
                              <span>{task.failureType}</span>
                              <strong>{task.title}</strong>
                              <p>{task.siteLocation}</p>
                              <small>
                                Verified {task.oracleVerdict.toUpperCase()} · policy {task.currentPolicyVerdict.toUpperCase()}.
                                {` ${task.whyNeeded} `}
                                Target: {task.target}
                              </small>
                            </article>
                          ))}
                        </div>
                        <p className="calibration-boundary">
                          {CUSTOMER_CALIBRATION_SUMMARY.claimBoundary}
                        </p>
                      </div>

                      <div className="policy-gate-demo">
                        <div className="calibration-head">
                          <div>
                            <span className="panel-kicker">Policy improvement gate</span>
                            <strong>{CUSTOMER_POLICY_GATE_SUMMARY.status}: {CUSTOMER_POLICY_GATE_SUMMARY.finalVerdict}</strong>
                            <p>
                              Training is authorization-gated. For this demo, Origin used an Origin-owned
                              synthetic approval artifact to train a local customer-specific candidate,
                              then evaluated it only on held-out CUSTOMER_OWNED rows.
                            </p>
                          </div>
                          <div className="auth-pill learned">
                            <span>Authorization</span>
                            <strong>{CUSTOMER_POLICY_GATE_SUMMARY.authorization.state}</strong>
                            <small>{CUSTOMER_POLICY_GATE_SUMMARY.authorization.approvalId}</small>
                          </div>
                        </div>
                        <div className="calibration-metric-grid">
                          <div>
                            <span>Current saved policy</span>
                            <strong>{formatPolicyGatePercent(CUSTOMER_POLICY_GATE_SUMMARY.currentPolicy.balancedAccuracy)}</strong>
                            <small>missed {formatPolicyGatePercent(CUSTOMER_POLICY_GATE_SUMMARY.currentPolicy.falseRefuseRate)} · unsafe {formatPolicyGatePercent(CUSTOMER_POLICY_GATE_SUMMARY.currentPolicy.falseAcceptRate)}</small>
                          </div>
                          <div>
                            <span>Learned candidate</span>
                            <strong>{formatPolicyGatePercent(CUSTOMER_POLICY_GATE_SUMMARY.learnedCandidate.balancedAccuracy)}</strong>
                            <small>missed {formatPolicyGatePercent(CUSTOMER_POLICY_GATE_SUMMARY.learnedCandidate.falseRefuseRate)} · unsafe {formatPolicyGatePercent(CUSTOMER_POLICY_GATE_SUMMARY.learnedCandidate.falseAcceptRate)}</small>
                          </div>
                          <div>
                            <span>Rule harness</span>
                            <strong>{formatPolicyGatePercent(CUSTOMER_POLICY_GATE_SUMMARY.ruleHarness.balancedAccuracy)}</strong>
                            <small>{CUSTOMER_POLICY_GATE_SUMMARY.ruleHarness.note}</small>
                          </div>
                          <div>
                            <span>Verified upper bound</span>
                            <strong>{formatPolicyGatePercent(CUSTOMER_POLICY_GATE_SUMMARY.oracleUpperBound.balancedAccuracy)}</strong>
                            <small>deterministic replay, not a model</small>
                          </div>
                        </div>
                        <div className="policy-gate-thresholds">
                          {CUSTOMER_POLICY_GATE_SUMMARY.safetyThresholds.map((gate) => (
                            <span className={gate.passed ? 'pass' : 'fail'} key={gate.label}>
                              {gate.passed ? 'PASS' : 'FAIL'} · {gate.label}
                            </span>
                          ))}
                        </div>
                        <div className="calibration-split-row">
                          <div>
                            <span>Train / val / test</span>
                            <strong>{CUSTOMER_POLICY_GATE_SUMMARY.model.trainRows} / {CUSTOMER_POLICY_GATE_SUMMARY.model.valRows} / {CUSTOMER_POLICY_GATE_SUMMARY.model.testRows}</strong>
                            <small>test rows held out from training</small>
                          </div>
                          <div>
                            <span>Model</span>
                            <strong>{CUSTOMER_POLICY_GATE_SUMMARY.model.algorithm}</strong>
                            <small>{CUSTOMER_POLICY_GATE_SUMMARY.model.featureCount} features · {CUSTOMER_POLICY_GATE_SUMMARY.model.featureBoundary}</small>
                          </div>
                          <div>
                            <span>Leakage guard</span>
                            <strong>{CUSTOMER_POLICY_GATE_SUMMARY.model.forbiddenFeaturesUsed}</strong>
                            <small>forbidden features used</small>
                          </div>
                          <div>
                            <span>Unsafe actions</span>
                            <strong>{CUSTOMER_POLICY_GATE_SUMMARY.learnedCandidate.unsafeFalseAccepts}</strong>
                            <small>held-out customer test split</small>
                          </div>
                        </div>
                        <p className="calibration-boundary">
                          {CUSTOMER_POLICY_GATE_SUMMARY.claimBoundary}
                        </p>
                      </div>

                      <div className="policy-gate-demo">
                        <div className="calibration-head">
                          <div>
                            <span className="panel-kicker">Broader robustness gate</span>
                            <strong>{CUSTOMER_ROBUSTNESS_SUMMARY.status}: {CUSTOMER_ROBUSTNESS_SUMMARY.currentCandidateVerdict}</strong>
                            <p>
                              The reviewed customer site can pass while broader restricted-zone robustness still fails.
                              Origin treats that failure as a blocker, converts misses into hard-case curriculum,
                              and evaluates a separate robustness candidate without upgrading the customer-owned claim.
                            </p>
                          </div>
                          <div className="auth-pill">
                            <span>Current broader gate</span>
                            <strong>{CUSTOMER_ROBUSTNESS_SUMMARY.currentGate.status}</strong>
                            <small>{CUSTOMER_ROBUSTNESS_SUMMARY.currentGate.rowCount} restricted-zone cases</small>
                          </div>
                        </div>
                        <div className="calibration-metric-grid">
                          <div>
                            <span>Current refuse recall</span>
                            <strong>{formatRobustnessPercent(CUSTOMER_ROBUSTNESS_SUMMARY.currentGate.refuseRecall)}</strong>
                            <small>threshold 99% · broader claim blocked</small>
                          </div>
                          <div>
                            <span>Current unsafe-action rate</span>
                            <strong>{formatRobustnessPercent(CUSTOMER_ROBUSTNESS_SUMMARY.currentGate.falseAcceptRate)}</strong>
                            <small>threshold 1% · {CUSTOMER_ROBUSTNESS_SUMMARY.currentGate.counterfactualFailCount} misses</small>
                          </div>
                          <div>
                            <span>Hard-case curriculum</span>
                            <strong>{CUSTOMER_ROBUSTNESS_SUMMARY.curriculum.rows} rows</strong>
                            <small>F {CUSTOMER_ROBUSTNESS_SUMMARY.curriculum.finish} / E {CUSTOMER_ROBUSTNESS_SUMMARY.curriculum.escalate} / R {CUSTOMER_ROBUSTNESS_SUMMARY.curriculum.refuse}</small>
                          </div>
                          <div>
                            <span>Robustness candidate</span>
                            <strong>{formatRobustnessPercent(CUSTOMER_ROBUSTNESS_SUMMARY.robustnessCandidate.genericRefuseRecall)}</strong>
                            <small>generic recall · unsafe {formatRobustnessPercent(CUSTOMER_ROBUSTNESS_SUMMARY.robustnessCandidate.genericFalseAcceptRate)}</small>
                          </div>
                        </div>
                        <div className="policy-gate-thresholds">
                          {CUSTOMER_ROBUSTNESS_SUMMARY.safetyThresholds.map((gate) => (
                            <span className={gate.passed ? 'pass' : 'fail'} key={gate.label}>
                              {gate.passed ? 'PASS' : 'FAIL'} · {gate.label}
                            </span>
                          ))}
                        </div>
                        <div className="calibration-split-row">
                          <div>
                            <span>Curriculum split</span>
                            <strong>{CUSTOMER_ROBUSTNESS_SUMMARY.curriculum.trainRows} / {CUSTOMER_ROBUSTNESS_SUMMARY.curriculum.valRows} / {CUSTOMER_ROBUSTNESS_SUMMARY.curriculum.testRows}</strong>
                            <small>train / val / held-out test</small>
                          </div>
                          <div>
                            <span>Curriculum lane</span>
                            <strong>{CUSTOMER_ROBUSTNESS_SUMMARY.curriculum.lane}</strong>
                            <small>{CUSTOMER_ROBUSTNESS_SUMMARY.curriculum.licenseClass}</small>
                          </div>
                          <div>
                            <span>Robustness verdict</span>
                            <strong>{CUSTOMER_ROBUSTNESS_SUMMARY.robustnessCandidate.finalVerdict}</strong>
                            <small>{CUSTOMER_ROBUSTNESS_SUMMARY.robustnessCandidate.trainingStatus}</small>
                          </div>
                          <div>
                            <span>Customer test preserved</span>
                            <strong>{formatRobustnessPercent(CUSTOMER_ROBUSTNESS_SUMMARY.robustnessCandidate.customerTestBalancedAccuracy)}</strong>
                            <small>unsafe actions {CUSTOMER_ROBUSTNESS_SUMMARY.robustnessCandidate.unsafeFalseAccepts}</small>
                          </div>
                        </div>
                        <p className="calibration-boundary">
                          {CUSTOMER_ROBUSTNESS_SUMMARY.claimBoundary}
                        </p>
                      </div>

                      <div className="policy-gate-demo">
                        <div className="calibration-head">
                          <div>
                            <span className="panel-kicker">Add hard cases from your site</span>
                            <strong>{CUSTOMER_HARDCASE_SUMMARY.status}: {CUSTOMER_HARDCASE_SUMMARY.finalVerdict}</strong>
                            <p>
                              Generated counterfactual curriculum is useful, but broader customer readiness
                              needs approved hard cases from reviewed site evidence: restricted zones,
                              human-only zones, hazards, blocked routes, ambiguous goals, missing evidence,
                              and safe controls near restricted areas.
                            </p>
                          </div>
                          <div className="auth-pill">
                            <span>Hard-case lane</span>
                            <strong>{CUSTOMER_HARDCASE_SUMMARY.source.lane}</strong>
                            <small>{CUSTOMER_HARDCASE_SUMMARY.source.approvalBoundary}</small>
                          </div>
                        </div>
                        <div className="calibration-metric-grid">
                          <div>
                            <span>Approved hard cases</span>
                            <strong>{CUSTOMER_HARDCASE_SUMMARY.review.approvedRows}</strong>
                            <small>
                              F {CUSTOMER_HARDCASE_SUMMARY.review.labelMix.finish} / E {CUSTOMER_HARDCASE_SUMMARY.review.labelMix.escalate} / R {CUSTOMER_HARDCASE_SUMMARY.review.labelMix.refuse}
                            </small>
                          </div>
                          <div>
                            <span>Draft/rejected blocked</span>
                            <strong>{CUSTOMER_HARDCASE_SUMMARY.review.draftRejectedBlocked}</strong>
                            <small>unreviewed input never becomes evidence</small>
                          </div>
                          <div>
                            <span>Learned candidate</span>
                            <strong>{formatHardCasePercent(CUSTOMER_HARDCASE_SUMMARY.customerLearnedCandidate.balancedAccuracy)}</strong>
                            <small>FAR {formatHardCasePercent(CUSTOMER_HARDCASE_SUMMARY.customerLearnedCandidate.falseAcceptRate)} · refuse {formatHardCasePercent(CUSTOMER_HARDCASE_SUMMARY.customerLearnedCandidate.refuseRecall)}</small>
                          </div>
                          <div>
                            <span>Robustness candidate</span>
                            <strong>{formatHardCasePercent(CUSTOMER_HARDCASE_SUMMARY.robustnessCandidate.balancedAccuracy)}</strong>
                            <small>separate generated-curriculum model</small>
                          </div>
                        </div>
                        <div className="policy-gate-thresholds">
                          {CUSTOMER_HARDCASE_SUMMARY.blockedStates.map((state) => (
                            <span className={state.canEnterHoldout ? 'pass' : 'fail'} key={state.state}>
                              {state.canEnterHoldout ? 'ELIGIBLE' : 'BLOCKED'} · {state.state}: {state.reason}
                            </span>
                          ))}
                          <span className="fail">REVIEW · synthetic demo only</span>
                        </div>
                        <div className="calibration-drill-grid">
                          {CUSTOMER_HARDCASE_SUMMARY.hardCases.map((item) => (
                            <article key={item.title}>
                              <span>{item.type}</span>
                              <strong>{item.title}</strong>
                              <p>{item.why}</p>
                              <small>
                                Evidence {item.evidence}. Review {item.reviewStatus}.
                                Verified {item.oracle.toUpperCase()} · learned {item.learned.toUpperCase()}.
                              </small>
                            </article>
                          ))}
                        </div>
                        <p className="calibration-boundary">
                          {CUSTOMER_HARDCASE_SUMMARY.claimBoundary}
                        </p>
                      </div>

                      <div className="policy-gate-demo">
                        <div className="calibration-head">
                          <div>
                            <span className="panel-kicker">{REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.title}</span>
                            <strong>{REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.status}: {REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.verdict}</strong>
                            <p>
                              Synthetic demo hard cases prove the workflow. Real customer readiness requires
                              approved customer-owned evidence, redaction where needed, and explicit
                              authorization before any evaluation or training.
                            </p>
                          </div>
                          <div className="auth-pill">
                            <span>Real evidence gate</span>
                            <strong>{REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.gateStatus}</strong>
                            <small>{REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.dataBoundary}</small>
                          </div>
                        </div>
                        <div className="calibration-metric-grid">
                          <div>
                            <span>Rows compiled</span>
                            <strong>{REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.defaultGate.rowsCompiled}</strong>
                            <small>default gate fails closed</small>
                          </div>
                          <div>
                            <span>Evaluation approval</span>
                            <strong>{REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.defaultGate.realCustomerReadinessPassed ? 'ready' : 'blocked'}</strong>
                            <small>{REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.defaultGate.allowedClaim}</small>
                          </div>
                          <div>
                            <span>Training</span>
                            <strong>{REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.defaultGate.trainingAllowed ? 'authorized' : 'blocked'}</strong>
                            <small>separate approval required</small>
                          </div>
                          <div>
                            <span>External API</span>
                            <strong>{REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.defaultGate.externalApiAllowed ? 'allowed' : 'blocked'}</strong>
                            <small>local-only intake by default</small>
                          </div>
                        </div>
                        <div className="policy-gate-thresholds">
                          {REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.states.map((state) => (
                            <span className={realCustomerGateStateClass(state.status)} key={state.label}>
                              {state.status === 'ready' ? 'READY' : 'BLOCKED'} · {state.label}: {state.detail}
                            </span>
                          ))}
                        </div>
                        <div className="calibration-drill-grid">
                          {REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.requiredInputs.map((input) => (
                            <article key={input}>
                              <span>design partner input</span>
                              <strong>{input}</strong>
                              <p>Must be provenance-tracked, reviewed, and scoped before it can support a real customer claim.</p>
                            </article>
                          ))}
                        </div>
                        <p className="calibration-boundary">
                          {REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.claimBoundary} Blocked claim: {REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.defaultGate.blockedClaim}
                        </p>
                      </div>

                      <div className="policy-gate-demo">
                        <div className="calibration-head">
                          <div>
                            <span className="panel-kicker">{AUTHORIZED_FIXTURE_GATE_SUMMARY.title}</span>
                            <strong>{AUTHORIZED_FIXTURE_GATE_SUMMARY.status}: local positive path, real readiness still blocked</strong>
                            <p>
                              This fixture shows the happy path for a design partner: approved evidence,
                              completed redaction, SHA provenance, verified hard cases, policy eval,
                              and an audit trail. It is deliberately labeled as not real customer data.
                            </p>
                          </div>
                          <div className="auth-pill learned">
                            <span>Fixture gate</span>
                            <strong>{AUTHORIZED_FIXTURE_GATE_SUMMARY.authorizedFixtureStatus}</strong>
                            <small>{AUTHORIZED_FIXTURE_GATE_SUMMARY.dataBoundary}</small>
                          </div>
                        </div>
                        <div className="calibration-metric-grid">
                          <div>
                            <span>Default real gate</span>
                            <strong>{AUTHORIZED_FIXTURE_GATE_SUMMARY.defaultRealCustomerGateStatus}</strong>
                            <small>fail-closed until real authorization exists</small>
                          </div>
                          <div>
                            <span>Compiled fixture rows</span>
                            <strong>{AUTHORIZED_FIXTURE_GATE_SUMMARY.rows}</strong>
                            <small>
                              F {AUTHORIZED_FIXTURE_GATE_SUMMARY.labelMix.finish} / E {AUTHORIZED_FIXTURE_GATE_SUMMARY.labelMix.escalate} / R {AUTHORIZED_FIXTURE_GATE_SUMMARY.labelMix.refuse}
                            </small>
                          </div>
                          <div>
                            <span>Evidence review</span>
                            <strong>{AUTHORIZED_FIXTURE_GATE_SUMMARY.evidenceReview.included} / {AUTHORIZED_FIXTURE_GATE_SUMMARY.evidenceReview.excluded}</strong>
                            <small>included / blocked evidence</small>
                          </div>
                          <div>
                            <span>Hard-case review</span>
                            <strong>{AUTHORIZED_FIXTURE_GATE_SUMMARY.evidenceReview.compiledHardCases} / {AUTHORIZED_FIXTURE_GATE_SUMMARY.evidenceReview.blockedHardCases}</strong>
                            <small>compiled / blocked cases</small>
                          </div>
                          <div>
                            <span>Real customer data?</span>
                            <strong>{AUTHORIZED_FIXTURE_GATE_SUMMARY.authorizedFixtureIsRealCustomerData ? 'yes' : 'no'}</strong>
                            <small>fixture-only boundary</small>
                          </div>
                          <div>
                            <span>Real readiness passed?</span>
                            <strong>{AUTHORIZED_FIXTURE_GATE_SUMMARY.realCustomerReadinessPassed ? 'yes' : 'no'}</strong>
                            <small>{AUTHORIZED_FIXTURE_GATE_SUMMARY.blockedClaim}</small>
                          </div>
                          <div>
                            <span>Policy eval</span>
                            <strong>{formatAuthorizedFixturePercent(AUTHORIZED_FIXTURE_GATE_SUMMARY.policyEval.balancedAccuracy)}</strong>
                            <small>refuse {formatAuthorizedFixturePercent(AUTHORIZED_FIXTURE_GATE_SUMMARY.policyEval.refuseRecall)} · unsafe {formatAuthorizedFixturePercent(AUTHORIZED_FIXTURE_GATE_SUMMARY.policyEval.falseAcceptRate)}</small>
                          </div>
                          <div>
                            <span>Verified divergence</span>
                            <strong>{AUTHORIZED_FIXTURE_GATE_SUMMARY.oracleDivergence}</strong>
                            <small>evidence-backed verification remains the judge</small>
                          </div>
                        </div>
                        <div className="policy-gate-thresholds">
                          <span className="pass">PASS · approved/redacted evidence compiles</span>
                          <span className="pass">PASS · pending-redaction evidence blocked</span>
                          <span className="pass">PASS · missing SHA blocked</span>
                          <span className="pass">PASS · external API blocked</span>
                          <span className="fail">BLOCKED · real customer readiness</span>
                          <span className="fail">BLOCKED · training without explicit authorization</span>
                        </div>
                        <div className="calibration-drill-grid">
                          {AUTHORIZED_FIXTURE_GATE_SUMMARY.blockedInputs.map((input) => (
                            <article key={input}>
                              <span>blocked input</span>
                              <strong>{input}</strong>
                              <p>Rejected before holdout compilation, then preserved in the audit trail.</p>
                            </article>
                          ))}
                        </div>
                        <p className="calibration-boundary">
                          {AUTHORIZED_FIXTURE_GATE_SUMMARY.claimBoundary} Allowed claim: {AUTHORIZED_FIXTURE_GATE_SUMMARY.allowedClaim}
                        </p>
                      </div>

                      <div className="policy-gate-demo">
                        <div className="calibration-head">
                          <div>
                            <span className="panel-kicker">{DESIGN_PARTNER_INTAKE_SUMMARY.title}</span>
                            <strong>{DESIGN_PARTNER_INTAKE_SUMMARY.status}: evidence contract ready, real readiness still blocked</strong>
                            <p>
                              Origin now has the packet a design partner needs to submit: authorization,
                              a provenance-tracked evidence manifest, reviewed hard cases, redaction status,
                              and explicit evaluation scope. The blank packet is intentionally blocked until
                              real approved evidence exists.
                            </p>
                          </div>
                          <div className="auth-pill">
                            <span>Contract</span>
                            <strong>{DESIGN_PARTNER_INTAKE_SUMMARY.packetStatus}</strong>
                            <small>{DESIGN_PARTNER_INTAKE_SUMMARY.contractVersion}</small>
                          </div>
                        </div>
                        <div className="calibration-metric-grid">
                          <div>
                            <span>Template</span>
                            <strong>{DESIGN_PARTNER_INTAKE_SUMMARY.templateAvailable ? 'available' : 'missing'}</strong>
                            <small>blank design-partner packet</small>
                          </div>
                          <div>
                            <span>Preflight validator</span>
                            <strong>{DESIGN_PARTNER_INTAKE_SUMMARY.preflightValidatorAvailable ? 'available' : 'missing'}</strong>
                            <small>blocks unsafe packets</small>
                          </div>
                          <div>
                            <span>Ready to compile?</span>
                            <strong>{DESIGN_PARTNER_INTAKE_SUMMARY.readyToCompile ? 'yes' : 'no'}</strong>
                            <small>authorization + evidence required</small>
                          </div>
                          <div>
                            <span>Ready for training?</span>
                            <strong>{DESIGN_PARTNER_INTAKE_SUMMARY.readyForTraining ? 'yes' : 'no'}</strong>
                            <small>separate approval required</small>
                          </div>
                          <div>
                            <span>Real evidence?</span>
                            <strong>{DESIGN_PARTNER_INTAKE_SUMMARY.realCustomerEvidenceAvailable ? 'yes' : 'no'}</strong>
                            <small>no customer packet submitted yet</small>
                          </div>
                          <div>
                            <span>Readiness passed?</span>
                            <strong>{DESIGN_PARTNER_INTAKE_SUMMARY.realCustomerReadinessPassed ? 'yes' : 'no'}</strong>
                            <small>{DESIGN_PARTNER_INTAKE_SUMMARY.blockedClaim}</small>
                          </div>
                          <div>
                            <span>External API</span>
                            <strong>{DESIGN_PARTNER_INTAKE_SUMMARY.externalApiDefault ? 'allowed' : 'blocked'}</strong>
                            <small>local-only by default</small>
                          </div>
                          <div>
                            <span>Verification authority</span>
                            <strong>{DESIGN_PARTNER_INTAKE_SUMMARY.oracleLabelAuthority}</strong>
                            <small>only label/reward judge</small>
                          </div>
                        </div>
                        <div className="calibration-drill-grid">
                          {DESIGN_PARTNER_INTAKE_SUMMARY.requiredInputs.map((input) => (
                            <article key={input}>
                              <span>partner input</span>
                              <strong>{input}</strong>
                              <p>Required before evidence can enter a customer-owned hard-case holdout.</p>
                            </article>
                          ))}
                        </div>
                        <div className="policy-gate-thresholds">
                          {DESIGN_PARTNER_INTAKE_SUMMARY.blockedByDefault.map((item) => (
                            <span className="fail" key={item}>BLOCKED · {item}</span>
                          ))}
                        </div>
                        <div className="calibration-drill-grid">
                          {DESIGN_PARTNER_INTAKE_SUMMARY.evidenceLayers.map((item) => (
                            <article key={item.layer}>
                              <span>evidence layer</span>
                              <strong>{item.layer}</strong>
                              <p>Allowed claim: {item.claim}.</p>
                            </article>
                          ))}
                        </div>
                        <p className="calibration-boundary">
                          {DESIGN_PARTNER_INTAKE_SUMMARY.claimBoundary} Next action: prepare approved evidence packet.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="provenance-panel">
                    <div className="provenance-head">
                      <span className="panel-kicker">Provenance and uncertainty</span>
                      <strong>Every artifact says where it came from</strong>
                    </div>
                    <div className="provenance-list">
                      {siteGymRun.provenance.slice(0, 8).map((p) => (
                        <div className="provenance-item" key={p.artifactId}>
                          <span>{p.extractionMethod} · {p.sourceType}</span>
                          <strong>{p.label}</strong>
                          <p>{p.details}</p>
                          <small>{formatPercent(p.confidence)} confidence · {p.requiresReview ? 'review required' : 'review optional'}</small>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="site-gym-visuals">
                    <div className="site-map-card">
                      <div className="site-map-card-head">
                        <span className="panel-kicker">Structured 2D map</span>
                        <strong>{siteGymRun.siteRepresentation.dimensions.width} x {siteGymRun.siteRepresentation.dimensions.length}</strong>
                      </div>
                      <div
                        className="site-map-grid"
                        style={{ gridTemplateColumns: `repeat(${siteGymRun.siteMap.width}, minmax(18px, 1fr))` }}
                        aria-label="Generated site map preview"
                      >
                        {Array.from({ length: siteGymRun.siteMap.height }).flatMap((_, y) =>
                          Array.from({ length: siteGymRun.siteMap.width }).map((__, x) => {
                            const cell = mapCell(siteGymRun, x, y)
                            return (
                              <span className={`site-map-cell ${cell.cls}`} key={`${x}-${y}`}>
                                {cell.label}
                              </span>
                            )
                          }),
                        )}
                      </div>
                      <div className="site-map-legend">
                        <span>S start</span>
                        <span>I item</span>
                        <span>D drop</span>
                        <span># obstacle</span>
                        <span>H hazard</span>
                        <span>R restricted</span>
                        <span>? uncertain</span>
                      </div>
                    </div>

                    <div className="readiness-card">
                      <span className="panel-kicker">Verification metrics</span>
                      <strong className="readiness-score">{siteGymRun.metrics.readinessScore}/100</strong>
                      <div className="metric-grid">
                        <div><span>Tasks</span><strong>{siteGymRun.metrics.taskCount}</strong></div>
                        <div><span>Finish</span><strong>{siteGymRun.metrics.labelDistribution.finish}</strong></div>
                        <div><span>Escalate</span><strong>{siteGymRun.metrics.labelDistribution.escalate}</strong></div>
                        <div><span>Refuse</span><strong>{siteGymRun.metrics.labelDistribution.refuse}</strong></div>
                        <div><span>Unsafe-action rate</span><strong>{formatPercent(siteGymRun.metrics.falseAcceptRisk)}</strong></div>
                        <div><span>Missed-action rate</span><strong>{formatPercent(siteGymRun.metrics.falseRefuseRisk)}</strong></div>
                      </div>
                      <p>
                        Verified replay balanced accuracy is {formatPercent(siteGymRun.metrics.balancedAccuracy)};
                        refusal recall is {formatPercent(siteGymRun.metrics.refusalRecall)}. These are verification
                        integrity metrics, not a learned robot policy certification.
                      </p>
                    </div>
                  </div>

                  {siteGymRun.extractedArtifacts.some((artifact) => artifact.keyframes.length > 0) && (
                    <div className="keyframe-panel">
                      <span className="panel-kicker">Video keyframe strip</span>
                      <div className="keyframe-strip">
                        {siteGymRun.extractedArtifacts.flatMap((artifact) => artifact.keyframes).map((frame) => (
                          <div className={`keyframe ${frame.simulated ? 'simulated' : ''}`} key={frame.id}>
                            {frame.thumbnailDataUrl ? (
                              <img src={frame.thumbnailDataUrl} alt={`${frame.label} keyframe`} />
                            ) : (
                              <div className="keyframe-fallback">{frame.label}</div>
                            )}
                            <strong>{frame.label}</strong>
                            <span>{frame.offsetSeconds}s · {frame.simulated ? 'simulated' : 'decoded'}</span>
                            <p>{frame.observation}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="before-after-panel">
                    <div>
                      <span className="panel-kicker">Before</span>
                      <strong>Customer-owned evidence</strong>
                      <ul>
                        {siteGymRun.manifest.items.map((item) => (
                          <li key={item.id}>{ROLE_LABEL[item.role]} · {item.name}</li>
                        ))}
                        {siteGymRun.manifest.safetyRules.slice(0, 3).map((rule) => (
                          <li key={rule}>Rule · {rule}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <span className="panel-kicker">After</span>
                      <strong>Reviewable autonomy infrastructure</strong>
                      <ul>
                        <li>{siteGymRun.siteRepresentation.dimensions.width}x{siteGymRun.siteRepresentation.dimensions.length} structured map</li>
                        <li>{siteGymRun.tasks.length} robot tasks</li>
                        <li>{siteGymRun.metrics.labelDistribution.finish} finish · {siteGymRun.metrics.labelDistribution.escalate} escalate · {siteGymRun.metrics.labelDistribution.refuse} refuse</li>
                        <li>{siteGymRun.trace.trace_id} replayable trace</li>
                      </ul>
                    </div>
                  </div>

                  <div className="lane-explainer">
                    <span className="panel-kicker">Dataset lanes</span>
                    <div>
                      <strong>Research lane</strong>
                      <p>Academic/non-commercial data supports prototype and benchmark evidence only.</p>
                    </div>
                    <div>
                      <strong>Commercial-safe synthetic lane</strong>
                      <p>Origin-owned procedural data supports product-development demos and regression checks.</p>
                    </div>
                    <div>
                      <strong>Customer-owned lane</strong>
                      <p>Permissioned customer site evidence stays isolated and becomes a customer-specific readiness slice.</p>
                    </div>
                  </div>

                  <div className="artifact-list">
                    {siteGymRun.extractedArtifacts.map((artifact) => (
                      <div className={`artifact-card ${artifact.status}`} key={artifact.itemId}>
                        <span>{formatPhase(artifact.status)} · {formatPercent(artifact.confidence)}</span>
                        <strong>{artifact.inputName}</strong>
                        <p>{artifact.summary}</p>
                        <small>
                          {artifact.materiallyImprovedMap ? 'Contributed to map/context' : 'Attached as review context'}
                          {artifact.errors.length ? ` · ${artifact.errors[0]}` : ''}
                        </small>
                      </div>
                    ))}
                  </div>

                  <div className="task-card-grid">
                    {siteGymRun.tasks.map((task) => (
                      <div className={`task-card ${task.expectedOracleVerdict}`} key={task.id}>
                        <span>{formatPhase(task.category)} · {task.risk_class}</span>
                        <strong>{task.expectedOracleVerdict.toUpperCase()}</strong>
                        <p>{task.description}</p>
                        <small>
                          Source: {task.source_map_feature}. Evidence: {task.required_evidence.join(', ')}.
                          Verified: {task.reason}
                        </small>
                      </div>
                    ))}
                  </div>

                  <div className="trace-card">
                    <div>
                      <span className="panel-kicker">Replayable trace</span>
                      <strong>{siteGymRun.trace.trace_id}</strong>
                      <p>
                        Digest {siteGymRun.trace.digest} ties inputs, artifacts, site map,
                        task set, verification version {siteGymRun.trace.oracle_version}, and metrics.
                      </p>
                    </div>
                    <ul>
                      {siteGymRun.claimBoundary.map((boundary) => (
                        <li key={boundary}>{boundary}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="context3d-card">
                    <span className="panel-kicker">3D-aware context, not 3D reconstruction</span>
                    <p>{siteGymRun.threeDContext.boundary}</p>
                    <div>
                      {[...siteGymRun.threeDContext.camera_path_hints, ...siteGymRun.threeDContext.depth_or_scale_hints, ...siteGymRun.threeDContext.vertical_context]
                        .slice(0, 3)
                        .map((line) => <span key={line}>{line}</span>)}
                    </div>
                  </div>
                </>
              ) : (
                <div className="site-gym-empty">
                  Upload a walkthrough video, floor plan, photo, or reference to generate the first
                  local verification trace.
                </div>
              )}
            </section>
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
                    : `${embodiments.length} types — your supervised run will use a mixed fleet.`}
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

        <section className="rsi-explainer" aria-labelledby="rsi-title">
          <div className="rsi-copy">
            <span className="panel-kicker">RSI / RL Environment moat</span>
            <h2 id="rsi-title">The site becomes a training environment, not just an uploaded file.</h2>
            <p>
              RSI means Reference State Initialization: Origin turns your customer-owned site into
              many realistic robot starting states and tasks. The verification run then evaluates
              whether the robot should finish, escalate, or refuse before it earns live authority.
            </p>
          </div>
          <ol className="rsi-pipeline">
            {RSI_PIPELINE.map((node) => (
              <li key={node.step}>
                <span>{node.step}</span>
                <strong>{node.title}</strong>
                <p>{node.detail}</p>
              </li>
            ))}
          </ol>
          <div className="rsi-proof">
            <div>
              <strong>Model proposes.</strong>
              <span>Vision and language models can draft maps, tasks, and hard cases quickly.</span>
            </div>
            <div>
              <strong>Environment verifies.</strong>
              <span>Evidence-backed verification computes labels and rewards. No self-grading.</span>
            </div>
            <div>
              <strong>Trace proves.</strong>
              <span>Readiness is shown through refuse recall, unsafe- / missed-action rates, counterfactuals, and audit traces.</span>
            </div>
          </div>
        </section>

        <div className="flow-actions">
          <button className="btn primary hero-action" onClick={() => submit('analyze')} disabled={!canContinue}>
            Generate verification run
          </button>
          <button className="btn ghost" onClick={() => submit('manual')} disabled={!canContinue}>
            Map manually instead
          </button>
          <span className="trust-note">Local media processing · verified labels only · no model self-grading</span>
        </div>
      </div>
    </section>
  )
}
