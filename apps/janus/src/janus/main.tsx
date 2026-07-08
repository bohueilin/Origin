import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/janus.css'
import { App } from './ui/App'

createRoot(document.getElementById('janus-root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
