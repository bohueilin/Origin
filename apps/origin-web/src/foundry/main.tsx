import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import FoundryApp from './ui/FoundryApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FoundryApp />
  </StrictMode>,
)
