import { useEffect, useRef } from 'react'

// Stack of currently-open dialogs (mount order). Only the TOP dialog responds to Escape /
// Tab. Without this, a dialog rendered inside another dialog's DOM (e.g. the step-up modal
// inside Account Settings) makes both document-level handlers fire — Escape would close both,
// and the two Tab-traps would fight over focus.
const stack: HTMLElement[] = []

// Accessible modal-dialog plumbing for a role="dialog" aria-modal container:
//  • moves focus into the dialog on open (first focusable, else the container)
//  • traps Tab / Shift+Tab within the dialog (only while it's the topmost dialog)
//  • closes on Escape (only the topmost dialog)
//  • restores focus to the triggering element on unmount
// Returns a ref to attach to the dialog container (give it tabIndex={-1}).
export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null)
  const closeRef = useRef(onClose)
  // Keep the latest onClose without re-running the focus effect (which would steal focus
  // back on every parent render). Updated in an effect to avoid a ref write during render.
  useEffect(() => { closeRef.current = onClose })

  useEffect(() => {
    const node = ref.current
    const prev = document.activeElement as HTMLElement | null
    if (node) stack.push(node)
    const focusables = (): HTMLElement[] =>
      node
        ? Array.from(
            node.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null)
        : []
    ;(focusables()[0] ?? node)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (!node || stack[stack.length - 1] !== node) return // only the topmost dialog acts
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current() ; return }
      if (e.key !== 'Tab') return
      const f = focusables()
      if (f.length === 0) { e.preventDefault(); return }
      const first = f[0]
      const last = f[f.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === node)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      if (node) { const i = stack.lastIndexOf(node); if (i !== -1) stack.splice(i, 1) }
      prev?.focus?.()
    }
  }, [])

  return ref
}
