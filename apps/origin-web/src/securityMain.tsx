import React from 'react'
import { createRoot } from 'react-dom/client'
import { SecurityPage } from './security/SecurityPage'

createRoot(document.getElementById('security-root')!).render(
  <React.StrictMode>
    <SecurityPage />
  </React.StrictMode>,
)
