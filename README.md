# CRS Tech Chalkboard

A mobile-first scheduling app for CRS's field technicians: see the company job backlog and the board (your own schedule or the whole crew's), and request time slots for open jobs or time off. Requests go through an office approval/counter-offer loop backed by Salesforce.

- `worker/` — Cloudflare Worker (Hono) API. In production it also serves the built frontend. See `worker/README.md`.
- `frontend/` — Vite + React SPA.
- `CHALKBOARD-BRIEF.md` — the original design brief (data model, invariants, cut list); source of truth for design decisions, with an amendments note where the actual build diverged.
- `CLAUDE.md` — architecture and command reference for working in this repo.

## Quick start (local, mock data, zero setup)

```bash
cd worker && npm install && npm run dev:node    # API on :8787
cd frontend && npm install && npm run dev       # app on :3000
```

Open `http://localhost:3000`. See `worker/README.md` for Salesforce mode, auth, and deployment.

