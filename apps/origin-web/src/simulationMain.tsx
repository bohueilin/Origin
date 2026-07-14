import React from 'react'
import { createRoot } from 'react-dom/client'
import { SimulationPage } from './simulation/SimulationPage'

createRoot(document.getElementById('sim-root')!).render(
  <React.StrictMode>
    <SimulationPage />
  </React.StrictMode>,
)
