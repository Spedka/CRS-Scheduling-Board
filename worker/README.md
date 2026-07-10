# Chalkboard Worker

The API half of CRS Tech Chalkboard, plus (in production) the static host for the frontend build. See the root `CLAUDE.md` for architecture notes and `../CHALKBOARD-BRIEF.md` for the original design brief.

## Run locally

```bash
npm install
npm run dev:node   # plain Node (tsx), no wrangler -- easiest for local iteration
```

`dev:node` loads `.env` (copy `.env.example`) and picks `SalesforceStore` automatically if `SF_CLIENT_ID`/`SF_CLIENT_SECRET` are set, otherwise `MockStore` with seeded data. **It does not hot-reload** — restart it after every backend code change.

Use `npm run dev` instead (`wrangler dev`) when you need the real `workerd` runtime rather than plain Node.

In a second terminal: `cd ../frontend && npm run dev` (Vite, port 3000, proxies `/api`/`/auth`/`/calendar` to `:8787`).

## Auth

Techs are identified by their exact Salesforce `Technician__c.Name`. There's no self-serve signup: an admin mints a link per tech and sends it to them manually.

```bash
npm run link -- "Full Tech Name"
# or against a deployed worker:
WORKER_URL=https://chalkboard.crsbas.workers.dev npm run link -- "Full Tech Name"
```

That link is good for 15 minutes and, once opened, exchanges for a long-lived device token stored on that device. Both tokens are self-verifying (HMAC-signed, no server-side session storage) — see `src/auth.ts` for why (short version: a Cloudflare Worker runs as many isolate instances across the network, so an in-memory session store doesn't reliably survive between a mint and a redeem, let alone a redeploy).

For curl/dev convenience, the auth middleware also accepts a bare tech name as the bearer token directly: `Authorization: Bearer Mike Ellenburg` works without ever redeeming a link.

## Office actions (dev-only stand-in)

There's no real office-side panel yet, so counter/approve are exposed as plain endpoints:

```bash
curl -X POST localhost:8787/dev/office/requests/{id}/counter \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-07-16","start":"13:00","end":"16:00"}'

curl -X POST localhost:8787/dev/office/requests/{id}/approve
```

Approve converts the request into a real assignment (`Job_Assignment__c` in SF mode) that then renders as a scheduled slot on the board.

## Routes

- `POST /auth/magic-link`, `GET /auth/redeem` — see Auth above.
- `GET /api/board?start=YYYY-MM-DD&view=me|crew` — merged schedule for the day.
- `GET /api/jobs?query=&area=` — open-jobs picker, searches job name, account/customer name, city, and address.
- `GET /api/requests?mine=1` — the calling tech's own requests.
- `POST /api/requests` — create (job, time off, or "New WO Required" via the sentinel job id).
- `POST /api/requests/:id/accept` / `/counter` / `/withdraw`.
- `POST /dev/office/requests/:id/counter` / `/approve` — see above.
- `GET /health`.

## Deploy

```bash
npm run deploy
```

Builds the frontend and runs `wrangler deploy`. The worker serves the built frontend directly via the `[assets]` binding in `wrangler.toml` (same origin as the API, no CORS needed) — see root `CLAUDE.md` for the secrets you need to set on a fresh deploy.

## Salesforce mode

Set `SF_CLIENT_ID` / `SF_CLIENT_SECRET` (Connected App, Client Credentials flow) to switch from `MockStore` to `SalesforceStore` — same shape locally (`.env`, via `dev-node`) and deployed (`wrangler secret put`).

Every Salesforce field name this app touches lives in the `CFG` object at the top of `src/store/salesforce.ts` — that's the one place to look when a field or picklist value needs to change. Notable mappings:

- `Schedule_Request__c` — `Proposed_Date__c`/`Proposed_Start__c`/`Proposed_End__c`, `Status__c`, `Last_Offer_By__c`, `Note__c`, `Time_Off__c`; `Job__c` looks up an Opportunity, `Technician__c`/`Requested_By__c` look up `Technician__c`.
- `Opportunity` (the "job") — `Job_Street_Address2__c`/`Job_City__c`/`Job_State__c`/`Job_Zip_Code__c` for the address, `Project_Status__c` gates which Opportunities count as open/requestable (`CFG.opp.openStatuses`, deliberately broad), `CloseDate` within `CFG.opp.closeDateRangeDays` of today. No due-date field exists in the org today (`CFG.opp.dueDate` is `null`); set an API name there if one gets added and due-sorting/the `due_soon` flag light up automatically.
- `Job_Assignment__c` — `Opportunity__c`, `Technician__c`, `Start_Time__c`, `Work_Date__c`; no end-time field.
- `Technician__c` — resolved by unique `Name` with `Active__c = true`; techs allowed to write to any board are an exact-name list, `CFG.technician.anyBoardNames`.
- `NEW_WO_OPPORTUNITY_ID` / `TIME_OFF_OPPORTUNITY_ID` — real placeholder Opportunities the composer's "New WO Required" and time-off requests attach to when there's no real job yet. Both should have a `Project_Status__c` outside `CFG.opp.openStatuses` so they never show up as a selectable job themselves.

## Contract test

```bash
node test/contract-test.mjs
```

Self-contained: starts an SF stub (`test/sf-stub.mjs`) and the API together, runs a full request lifecycle (create, counter, accept/approve, withdraw, permission and turn invariants) through it, and prints the exact bodies sent to "Salesforce."
