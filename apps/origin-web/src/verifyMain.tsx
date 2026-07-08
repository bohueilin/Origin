import React from 'react'
import { createRoot } from 'react-dom/client'
import { VerifyPage } from './verify/VerifyPage'

createRoot(document.getElementById('verify-root')!).render(
  <React.StrictMode>
    <VerifyPage />
  </React.StrictMode>,
)
