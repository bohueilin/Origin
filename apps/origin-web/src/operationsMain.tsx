import React from 'react'
import { createRoot } from 'react-dom/client'
import { OperationsPage } from './simulation/OperationsPage'

createRoot(document.getElementById('ops-root')!).render(
  <React.StrictMode>
    <OperationsPage />
  </React.StrictMode>,
)
