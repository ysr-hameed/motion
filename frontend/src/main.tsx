import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/unbounded'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from '@/components/theme-provider'
import { AppErrorBoundary, GlobalErrorTrap } from '@/components/error-modal'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AppErrorBoundary>
        <GlobalErrorTrap />
        <App />
      </AppErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
)
