import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ClipView from './ClipView.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClipView />
  </StrictMode>,
)
