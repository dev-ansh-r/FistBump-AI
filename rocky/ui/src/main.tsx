import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// Spinner keyframe — injected globally since we can't use @keyframes in inline styles
const style = document.createElement('style')
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`
document.head.appendChild(style)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
