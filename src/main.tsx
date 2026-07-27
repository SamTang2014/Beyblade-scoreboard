import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import './ui/styles/app.css'

const root = document.getElementById('root')
if (root === null) throw new Error('搵唔到 #root')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
