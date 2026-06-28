import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/passport.css'
import { App } from './ui/App'
import { AuthProvider } from '../auth/AuthProvider'

createRoot(document.getElementById('passport-root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
