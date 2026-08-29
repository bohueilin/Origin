import React from 'react'
import { createRoot } from 'react-dom/client'
import { OverGrantPage } from './overgrant/OverGrantPage'

createRoot(document.getElementById('overgrant-root')!).render(
  <React.StrictMode>
    <OverGrantPage />
  </React.StrictMode>,
)
