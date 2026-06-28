import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './factorydad.css'
import { Dashboard } from './Dashboard'
import { AuthProvider } from '../auth/AuthProvider'

createRoot(document.getElementById('factorydad-root')!).render(
  <StrictMode>
    <AuthProvider>
      <Dashboard />
    </AuthProvider>
  </StrictMode>,
)
