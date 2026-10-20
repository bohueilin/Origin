import React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { OverGrantPage } from './overgrant/OverGrantPage'
import { DelegationPanel } from './security/DelegationPanel'

hydrateRoot(document.getElementById('delegation-root')!, <DelegationPanel hydrate />)

createRoot(document.getElementById('overgrant-root')!).render(
  <React.StrictMode>
    <OverGrantPage />
  </React.StrictMode>,
)
