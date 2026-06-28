import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import SocConsole from './SocConsole.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SocConsole />
  </StrictMode>,
)
