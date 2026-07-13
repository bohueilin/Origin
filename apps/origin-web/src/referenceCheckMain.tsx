import React from 'react'
import { createRoot } from 'react-dom/client'
import { ReferenceCheckPage } from './reference-check/ReferenceCheckPage'

createRoot(document.getElementById('refcheck-root')!).render(
  <React.StrictMode>
    <ReferenceCheckPage />
  </React.StrictMode>,
)
