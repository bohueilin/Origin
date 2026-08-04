// Entry for /admin — mounts the operator portal. Kept as a pure entry (no component
// definitions) to match authMain.tsx; AdminPortal itself lives in src/auth/.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './auth/AuthProvider'
import { AdminPortal } from './auth/AdminPortal'
import './auth/authPage.css'

createRoot(document.getElementById('admin-root')!).render(
  <StrictMode>
    <AuthProvider>
      <AdminPortal />
    </AuthProvider>
  </StrictMode>,
)
