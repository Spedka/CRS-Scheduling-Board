import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
// @ts-ignore: allow side-effect CSS import without type declarations
import './index.css'
// @ts-ignore: virtual module provided by vite-plugin-pwa at build time
import { registerSW } from 'virtual:pwa-register'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// injectRegister is off in vite.config.ts so we control this ourselves --
// a tech can leave this open on their home screen for days, and the
// browser's own SW update check basically never fires for a standalone
// PWA that never navigates. We poll manually, and only reload once the
// tech isn't actively looking at the screen (backgrounded / just
// reopened), so an update never yanks the rug out from under someone
// mid-composer.
let updateReady = false

const updateSW = registerSW({
  onNeedRefresh() {
    updateReady = true
  },
  onRegisteredSW(_url: string, registration: ServiceWorkerRegistration | undefined) {
    if (!registration) return
    setInterval(() => {
      registration.update()
    }, 60 * 1000) // check every minute
  },
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && updateReady) {
    updateSW(true)
    updateReady = false
  }
})