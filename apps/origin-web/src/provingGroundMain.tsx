import React from 'react'
import { createRoot } from 'react-dom/client'
import './App.css'
import { AuthProvider } from './auth/AuthProvider'
import { ProvingGroundPage } from './proving-ground/ProvingGroundPage'

createRoot(document.getElementById('pg-root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <ProvingGroundPage />
    </AuthProvider>
  </React.StrictMode>,
)
