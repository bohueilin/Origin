import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/passport.css'
import { App } from './ui/App'

createRoot(document.getElementById('passport-root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
