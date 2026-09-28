import { useDialog } from '../auth/useDialog'

export function FloorPlanViewer({
  title,
  detail,
  scene,
  plan,
  onClose,
}: {
  title: string
  detail?: string
  scene: string
  plan?: string
  onClose: () => void
}) {
  // aria-modal="true" tells assistive tech that everything outside this node is inert.
  // Without focus management, Tab walked the user straight into that hidden content and
  // close dropped focus on <body> — a keyboard dead-end (fails 2.4.3 / 4.1.2). useDialog
  // moves focus in, traps Tab, closes on Escape, and restores focus to the trigger.
  const ref = useDialog<HTMLDivElement>(onClose)

  return (
    <div className="fpv-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="fpv-modal" ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="fpv-head">
          <div>
            <div className="fpv-title">{title}</div>
            {detail && <div className="fpv-detail">{detail}</div>}
          </div>
          <button className="fpv-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={`fpv-body ${plan ? 'fpv-body-2' : ''}`}>
          <figure className="fpv-fig">
            <img className="fpv-img" src={scene} alt={`${title} — AI-generated warehouse illustration`} />
            <figcaption className="fpv-cap">
              <span className="fpv-cap-label">AI-generated illustration</span>
              <span className="fpv-cap-meta">Fictional warehouse · not a photograph of this floor, sensor data, or an evaluation result.</span>
            </figcaption>
          </figure>

          {/* RIGHT: schematic layout plan, static */}
          {plan && (
            <figure className="fpv-fig">
              <img className="fpv-img" src={plan} alt={`${title} — schematic layout`} />
              <figcaption className="fpv-cap">
                <span className="fpv-cap-label">Schematic layout</span>
                <span className="fpv-cap-meta">Separate schematic template · the illustration does not reconstruct this plan</span>
              </figcaption>
            </figure>
          )}
        </div>
      </div>
    </div>
  )
}
