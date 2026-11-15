import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/index.css'
import { App } from './App'
import { AuthProvider } from './stores/AuthContext'
import { ToastProvider } from './stores/ToastContext'
import { SoundProvider } from './stores/SoundContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SoundProvider>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </SoundProvider>
    </BrowserRouter>
  </StrictMode>,
)
