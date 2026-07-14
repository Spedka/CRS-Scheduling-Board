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

// TEMP DEBUG OVERLAY -- remove once the bottom-gap issue is diagnosed.
function mountDebugOverlay() {
  const box = document.createElement('div')
  box.style.cssText =
    'position:fixed;top:0;left:0;z-index:99999;background:rgba(0,0,0,0.85);color:#0f0;' +
    'font:11px monospace;padding:6px 8px;white-space:pre;pointer-events:none;'
  document.body.appendChild(box)

  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;bottom:0;height:0;padding-bottom:env(safe-area-inset-bottom);'
  document.body.appendChild(probe)

  const update = () => {
    const tabbar = document.querySelector('.tabbar')
    const tabbarRect = tabbar?.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const truePhysicalHeight = screen.height / dpr
    const safeAreaBottom = getComputedStyle(probe).paddingBottom
    box.textContent = [
      `window.innerHeight: ${window.innerHeight}`,
      `screen.height: ${screen.height}  dpr: ${dpr}`,
      `true CSS px height: ${truePhysicalHeight.toFixed(1)}`,
      `SHORTFALL (true - innerHeight): ${(truePhysicalHeight - window.innerHeight).toFixed(1)}`,
      `.tabbar bottom: ${tabbarRect?.bottom}`,
      `env(safe-area-inset-bottom): ${safeAreaBottom}`,
    ].join('\n')
  }

  update()
  window.addEventListener('resize', update)
  ;(window as any).visualViewport?.addEventListener('resize', update)
  setInterval(update, 500)
}
mountDebugOverlay()