import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './index.css'
import './styles/responsive.css'
import './i18n'
import App from './App'
import { purgeLegacyCaches } from './services/storage/legacyCaches'

purgeLegacyCaches()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
