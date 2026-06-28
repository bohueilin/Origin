import { clsx } from 'clsx'
import { Check, X, AlertTriangle, Loader2, Copy } from './icons'
import type { ReactNode } from 'react'
import type { BranchStatus } from '../lib/types'

/* ------------------------------------------------------------------ */
/* Status chip (the little uppercase tag, e.g. PROMISING / WITNESS)    */
/* ------------------------------------------------------------------ */

const CHIP: Record<string, string> = {
  root: 'bg-green-50 text-accent-text',
  witness: 'bg-green-50 text-accent-text',
  rewarded: 'bg-green-50 text-accent-text',
  'control-pass': 'bg-green-50 text-accent-text',
  promising: 'bg-warn-soft text-warn-text',
  verifying: 'bg-warn-soft text-warn-text',
  'qa-review': 'bg-warn-soft text-warn-text',
  control: 'bg-state-gray-soft text-ink-secondary-strong',
  snapshot: 'bg-tint-blue text-ink-secondary-strong',
  duplicate: 'bg-state-gray-soft text-ink-secondary-strong',
  'dead-end': 'bg-state-red-soft text-ink-danger',
  plain: 'bg-state-gray-soft text-ink-secondary-strong',
}

export function Chip({ children, status = 'plain', className }: { children: ReactNode; status?: BranchStatus | string; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-sm px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide',
        CHIP[status] ?? CHIP.plain,
        className,
      )}
    >
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Verdict icon                                                        */
/* ------------------------------------------------------------------ */

export function VerdictIcon({ verdict, className }: { verdict: 'ok' | 'warn' | 'fail' | 'running' | 'none'; className?: string }) {
  const base = clsx('flex h-5 w-5 items-center justify-center rounded-full', className)
  switch (verdict) {
    case 'ok':
      return (
        <span className={clsx(base, 'bg-fill-accent text-ink-inverse')}>
          <Check size={12} strokeWidth={3} />
        </span>
      )
    case 'fail':
      return (
        <span className={clsx(base, 'bg-fill-danger text-ink-inverse')}>
          <X size={12} strokeWidth={3} />
        </span>
      )
    case 'warn':
      return (
        <span className={clsx(base, 'border border-warn-border bg-warn-soft text-warn-text')}>
          <AlertTriangle size={11} strokeWidth={2.5} />
        </span>
      )
    case 'running':
      return (
        <span className={clsx(base, 'text-warn-text')}>
          <Loader2 size={14} className="animate-spin" strokeWidth={2.5} />
        </span>
      )
    default:
      return null
  }
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type BtnProps = {
  children: ReactNode
  variant?: 'primary' | 'dark' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  className?: string
  icon?: ReactNode
  onClick?: () => void
  disabled?: boolean
}

export function Button({ children, variant = 'secondary', size = 'md', className, icon, onClick, disabled }: BtnProps) {
  const variants: Record<string, string> = {
    primary: 'bg-fill-accent text-ink-inverse hover:bg-fill-accent-hover',
    dark: 'bg-fill-primary text-ink-inverse hover:bg-fill-primary-hover',
    secondary: 'bg-surface-raised text-ink-primary border border-stroke hover:bg-tint-green',
    ghost: 'text-ink-secondary hover:text-ink-primary hover:bg-tint-green',
    danger: 'bg-fill-danger text-ink-inverse hover:opacity-90',
  }
  const sizes: Record<string, string> = {
    sm: 'px-3 py-1.5 text-sm rounded-lg gap-1.5',
    md: 'px-4 py-2.5 text-sm rounded-lg gap-2',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center justify-center font-medium transition-[background-color,border-color,color,opacity,transform] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        !disabled && 'active:scale-[0.97]',
        variants[variant],
        sizes[size],
        disabled && 'cursor-not-allowed opacity-55 hover:bg-surface-raised hover:text-ink-primary active:scale-100',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}

export function IconButton({ children, onClick, className, label }: { children: ReactNode; onClick?: () => void; className?: string; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={clsx(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-secondary transition-[background-color,color,transform] duration-150 ease-out hover:bg-surface hover:text-ink-primary active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function LiveDot({ tone = 'green', label }: { tone?: 'green' | 'red'; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
      <span className={clsx('h-2 w-2 rounded-full', tone === 'green' ? 'bg-fill-accent' : 'bg-fill-danger')} />
      {label}
    </span>
  )
}

export function VersionPill({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-surface-sunken px-1.5 py-0.5 text-2xs font-medium text-ink-secondary">{children}</span>
}

export function MonoCopy({ value }: { value: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-sm text-ink-primary">
      <span className="min-w-0 truncate">{value}</span>
      <Copy size={12} className="text-ink-tertiary" />
    </span>
  )
}

export function Divider({ className }: { className?: string }) {
  return <div className={clsx('h-px w-full bg-hairline', className)} />
}
