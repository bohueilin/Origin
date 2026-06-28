import { Play, X, Database } from './icons'
import { Button, IconButton, LiveDot } from './primitives'

interface RunHeaderProps {
  title: string
  version?: string
  status?: { tone: 'green' | 'red'; label: string }
  subtitle?: string
  primaryLabel?: string
  primaryTone?: 'primary' | 'dark'
  onPrimary?: () => void
  onClose?: () => void
}

export function RunHeader({
  title,
  status,
  subtitle,
  primaryLabel = 'Resume run',
  primaryTone = 'primary',
  onPrimary,
  onClose,
}: RunHeaderProps) {
  return (
    <header className="flex items-start justify-between border-b border-hairline bg-background px-8 py-4">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="m-0 font-display text-3xl leading-none tracking-tight text-ink-primary">{title}</h1>
          {status && <LiveDot tone={status.tone} label={status.label} />}
        </div>
        {subtitle && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-secondary">
            <Database size={13} className="text-ink-tertiary" />
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {onPrimary && (
          <Button variant={primaryTone} size="sm" icon={<Play size={14} />} onClick={onPrimary}>
            {primaryLabel}
          </Button>
        )}
        {onClose && (
          <IconButton label="Close" onClick={onClose} className="ml-1">
            <X size={18} />
          </IconButton>
        )}
      </div>
    </header>
  )
}
