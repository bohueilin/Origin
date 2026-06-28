export interface Scene {
  path: string
  label: string
  group: string
}

export const SCENES: Scene[] = [
  { path: '/', label: 'QA ForkPoint (root)', group: 'Discover' },
  { path: '/witness', label: 'Exploit Witness — tree', group: 'Witness' },
  { path: '/proofset', label: 'Exploit Witness — proof set', group: 'Witness' },
  { path: '/patch', label: 'Verifier Patch v2', group: 'Fix' },
  { path: '/gate', label: 'Release Gate — running', group: 'Gate' },
  { path: '/gate/witness-failed', label: 'Release Gate — exploit survived', group: 'Gate' },
  { path: '/gate/control-failed', label: 'Release Gate — control broken', group: 'Gate' },
  { path: '/releaseproof', label: 'Release proof committed', group: 'Release' },
]
