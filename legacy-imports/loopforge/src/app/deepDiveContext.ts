import { createContext, useContext, type ReactNode } from 'react'

export type DeepDivePayload = {
  title: string
  subtitle?: string
  /** Optional rendered detail above the raw JSON. */
  detail?: ReactNode
  /** Raw object shown as formatted JSON - the "what the model actually returned" view. */
  data?: unknown
}

export type DeepDiveContextValue = {
  open: (payload: DeepDivePayload) => void
  close: () => void
}

export const DeepDiveContext = createContext<DeepDiveContextValue | null>(null)

export function useDeepDive(): DeepDiveContextValue {
  const ctx = useContext(DeepDiveContext)
  if (!ctx) {
    return { open: () => {}, close: () => {} }
  }
  return ctx
}
