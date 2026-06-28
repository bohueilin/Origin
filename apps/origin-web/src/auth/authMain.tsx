import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './AuthProvider'
import { AuthPage } from './AuthPage'
import './authPage.css'

createRoot(document.getElementById('auth-root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthPage />
    </AuthProvider>
  </StrictMode>,
)
