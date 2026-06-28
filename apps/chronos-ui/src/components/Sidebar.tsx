import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import { Activity, FileCheck2, FolderOpen, GitFork, Home, Play, Settings, ShieldCheck, Tree02 } from './icons'
import type { ComponentType, ReactNode } from 'react'
import type { IconProps } from './icons'

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/runs', label: 'Runs', icon: Play },
  { to: '/witness?focus=confirmed', label: 'Witness', icon: GitFork },
  { to: '/proofset', label: 'Proofset', icon: FileCheck2 },
  { to: '/releaseproof', label: 'Release', icon: ShieldCheck },
  { to: '/artifacts', label: 'Artifacts', icon: FolderOpen },
  { to: '/benchmark', label: 'Benchmark', icon: Activity },
]

const UTILITY_NAV = [
  { to: '/settings', label: 'Settings', icon: Settings },
]

function Item({ to, label, icon: Icon, end }: { to: string; label: string; icon: ComponentType<IconProps>; end?: boolean }) {
  return (
    <NavLink to={to} end={end} aria-label={label} className="group flex flex-col items-center gap-1.5 rounded-lg px-1 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {({ isActive }) => (
        <>
          <span
            className={clsx(
              'flex h-11 w-11 items-center justify-center rounded-lg transition-[background-color,color,transform] duration-150 ease-out group-active:scale-[0.96]',
              isActive ? 'bg-surface text-ink-primary' : 'text-ink-tertiary group-hover:bg-tint-green group-hover:text-ink-secondary',
            )}
          >
            <Icon size={21} strokeWidth={1.75} />
          </span>
          <span className={clsx('text-xs leading-none', isActive ? 'text-ink-secondary-strong' : 'text-ink-tertiary')}>{label}</span>
        </>
      )}
    </NavLink>
  )
}

export function Sidebar(): ReactNode {
  return (
    <aside className="flex w-24 shrink-0 flex-col items-center border-r border-hairline bg-background py-4">
      <NavLink
        to="/"
        aria-label="Traceback home"
        className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-fill-accent text-ink-inverse transition-[background-color,transform] duration-150 ease-out hover:bg-fill-accent-hover active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Tree02 size={22} strokeWidth={2} />
      </NavLink>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((n) => (
          <Item key={n.to} {...n} />
        ))}
      </nav>
      <nav className="flex flex-col gap-1">
        {UTILITY_NAV.map((n) => (
          <Item key={n.to} {...n} />
        ))}
      </nav>
    </aside>
  )
}
