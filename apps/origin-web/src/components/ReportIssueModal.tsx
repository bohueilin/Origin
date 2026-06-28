// "Report an issue" popup for the proving ground — shows the same support form as the
// account Support tab, in an accessible modal (focus trap + Escape via useDialog).
import { SupportForm } from './SupportForm'
import { useDialog } from '../auth/useDialog'

export function ReportIssueModal({ onClose }: { onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(onClose)
  return (
    <div className="report-overlay" role="dialog" aria-modal="true" aria-label="Report an issue" onClick={onClose}>
      <div className="report-modal" ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <button className="report-x" aria-label="Close" onClick={onClose}>×</button>
        <h3 className="report-title"><span className="report-flag" aria-hidden="true">⚑</span> Report an issue</h3>
        <p className="report-sub">Tell us what went wrong and we’ll look into it. Your report is private to your account.</p>
        <SupportForm defaultCategory="bug" />
      </div>
    </div>
  )
}
