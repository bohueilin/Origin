import React from 'react'
import { createRoot } from 'react-dom/client'
import './App.css'
import { CaptureConsole } from './components/CaptureConsole'

function captureNoop(): void {
  // The standalone public capture page owns the Site-to-Gym proof flow locally.
  // The legacy analyze/manual callbacks belong to the older multi-step app shell.
}

createRoot(document.getElementById('capture-root')!).render(
  <React.StrictMode>
    <CaptureConsole
      onAnalyze={captureNoop}
      onManual={captureNoop}
      onBack={() => {
        window.location.assign('/')
      }}
    />
  </React.StrictMode>,
)
