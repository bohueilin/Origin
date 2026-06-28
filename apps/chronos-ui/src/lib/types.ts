export type BranchStatus =
  | 'root'
  | 'trace'
  | 'qa'
  | 'snapshot'
  | 'promising'
  | 'verifying'
  | 'witness'
  | 'rewarded'
  | 'control'
  | 'control-pass'
  | 'qa-review'
  | 'dead-end'
  | 'duplicate'
  | 'plain'

export type NodeKind = 'trace' | 'qa' | 'forkpoint' | 'snapshot' | 'branch' | 'stopped'

export interface MetaRow {
  label: string
  value: string
  mono?: boolean
}

export interface BranchNodeData {
  kind: NodeKind
  title: string
  status: BranchStatus
  /** small label chip on the right of the title, e.g. CANDIDATE, CONFIRMED, CONTROL */
  tag?: string
  /** sub line, e.g. "reward 0.6", "step 18" */
  meta?: string
  reward?: number
  rows?: MetaRow[]
  /** show a verdict icon: ok | warn | fail | running | none */
  verdict?: 'ok' | 'warn' | 'fail' | 'running' | 'none'
  selected?: boolean
  hasChevron?: boolean
  [key: string]: unknown
}

export interface GateItem {
  id: string
  name: string
  sub: string
  status: 'passed' | 'failed' | 'running' | 'pending' | 'killed' | 'survived' | 'preserved' | 'broken'
  reward?: number
}

export interface ProofSetEntry {
  id: string
  name: string
  badge: string
  tone: 'fail' | 'pass' | 'variant'
}
