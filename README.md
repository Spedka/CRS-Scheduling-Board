# CRS Tech Chalkboard

A mobile-first scheduling app for CRS's field technicians: see the company job backlog and the board (your own schedule or the whole crew's), and request time slots for open jobs or time off. Requests go through an office approval/counter-offer loop backed by Salesforce.

Installable as a PWA on both iOS and Android, works offline for the last-loaded schedule, and is served as a single origin off the Cloudflare Worker (no separate frontend host, no CORS).

- `worker/` — Cloudflare Worker (Hono) API. In production it also serves the built frontend. See `worker/README.md`.
- `frontend/` — Vite + React SPA, PWA-enabled via `vite-plugin-pwa`.
- `CHALKBOARD-BRIEF.md` — the original design brief (data model, invariants, cut list); source of truth for design decisions, with an amendments note where the actual build diverged.
- `CLAUDE.md` — architecture and command reference for working in this repo.

## Quick start (local, mock data, zero setup)

\`\`\`bash
cd worker && npm install && npm run dev:node    # API on :8787
cd frontend && npm install && npm run dev       # app on :3000
\`\`\`

Open `http://localhost:3000`. See `worker/README.md` for Salesforce mode, auth, and deployment.

## Deploying

\`\`\`bash
cd worker
npm run deploy
\`\`\`

This builds the frontend (`vite build`, which also generates the PWA manifest and service worker into `frontend/dist/`) and runs `wrangler deploy`, pushing both the Worker and the static bundle to `chalkboard.crsbas.workers.dev` as one origin.

After deploying, verify the PWA is intact before testing on a phone: open the deployed URL in Chrome, DevTools → Application tab → check Manifest (no errors, icons resolve) and Service Workers (registered, activated). A Lighthouse PWA audit (DevTools → Lighthouse tab, Mobile, category "Progressive Web App") will flag anything broken with more detail.

## Installing on a phone

**iOS:** must be opened in Safari (Chrome on iOS can't install PWAs, that's an Apple platform restriction). Share icon → "Add to Home Screen."

**Android:** open in Chrome. Either an install prompt appears automatically, or use the three-dot menu → "Install app."

### iOS storage gotcha

A standalone home-screen web app on iOS runs in its own storage context, separate from regular Safari tabs, even though it's the same origin. Auth works by redeeming a magic link (`?token=...`) into `localStorage`; if that redemption happened in a regular Safari tab before the icon was added, the home-screen app launches with empty storage and shows "No access yet."

Fix: the "No access yet" screen has a paste-link fallback (`redeemTokenFromPastedInput` in `frontend/src/auth.ts`). Get the magic link resent, open the app from the home-screen icon, paste the link into the box, and it redeems in the correct storage context without needing to remove and re-add the icon.

## PWA assets

Icons live in `frontend/public/`:

| File | Size | Used for |
|---|---|---|
| `apple-touch-icon.png` | 180x180 | iOS home screen |
| `icon-192.png` | 192x192 | Android/manifest |
| `icon-512.png` | 512x512 | Android/manifest, splash |
| `icon-512-maskable.png` | 512x512 | Android adaptive icon (padded to the manifest's safe zone, background matches `--bg` from `frontend/src/index.css`) |

Manifest config (`theme_color`, `background_color`, icon list) lives in `frontend/vite.config.ts` under the `VitePWA` plugin options.