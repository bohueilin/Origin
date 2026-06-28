import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { RunProvider } from './store/RunProvider'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <RunProvider>
        <App />
      </RunProvider>
    </BrowserRouter>
  </StrictMode>,
)
