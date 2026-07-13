// Chalkboard Worker. Routes match exactly what the existing frontend fetches.
// Runs identically under wrangler dev (Cloudflare) and the node dev server
// (dev-node.ts); the app itself is runtime-agnostic Hono.

import { Hono } from 'hono';
import { MockStore, type Store } from './store/store';
import { SalesforceStore } from './store/salesforce';
import { createMagicLink, redeemMagicLink, resolveDeviceToken, signDeviceToken, getAuthSecret } from './auth';

// Store selection: if SF secrets are configured, use Salesforce; otherwise
// fall back to the in-memory mock so local dev works with zero setup.
// One instance per isolate; the token cache lives inside it.
let store: Store | null = null;
const getStore = (env: any): Store => {
  if (!store) {
    store = env?.SF_CLIENT_ID && env?.SF_CLIENT_SECRET
      ? new SalesforceStore(env)
      : new MockStore();
  }
  return store;
};

type Vars = { techId: string; store: Store };
const app = new Hono<{ Variables: Vars }>();

// --- auth ---
// Bearer token is first tried as a redeemed device token (see auth.ts); if
// that doesn't resolve, it falls back to being treated as the tech identity
// directly (dev/curl convenience -- "Bearer u001" or "Bearer <Technician
// Name>"), defaulting to u001 so the frontend works before a link is redeemed.
app.use('*', async (c, next) => {
  const auth = c.req.header('Authorization') ?? '';
  const bearer = auth.replace(/^Bearer\s+/i, '').trim();
  const secret = getAuthSecret((c as any).env);
  const deviceName = bearer ? await resolveDeviceToken(bearer, secret) : undefined;
  c.set('techId', deviceName || bearer || 'u001');
  c.set('store', getStore((c as any).env));
  await next();
});

const fail = (c: any, err: any) =>
  c.json({ error: err?.message ?? 'Server error' }, err?.status ?? 500);

// --- auth: magic link issuance + redemption ---
// Dev convenience: no admin gate yet (matches /dev/office/* below). Add one
// before this goes anywhere near the public internet.
app.post('/auth/magic-link', async (c) => {
  try {
    const { techName } = await c.req.json();
    if (!techName) return c.json({ error: 'techName required' }, 400);
    const ok = await c.get('store').verifyTech(techName);
    if (!ok) return c.json({ error: `Unknown technician: ${techName}` }, 404);
    const token = await createMagicLink(techName, getAuthSecret((c as any).env));
    const appUrl = ((c as any).env?.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
    return c.json({ link: `${appUrl}/?token=${token}`, expiresInMinutes: 15 });
  } catch (e) { return fail(c, e); }
});

app.get('/auth/redeem', async (c) => {
  const token = c.req.query('token') ?? '';
  const result = await redeemMagicLink(token, getAuthSecret((c as any).env));
  if (!result) return c.json({ error: 'Link is invalid or expired' }, 401);
  const deviceToken = await signDeviceToken(result.techName, getAuthSecret((c as any).env));
  return c.json({ deviceToken, techName: result.techName });
});

// --- board ---
app.get('/api/board', async (c) => {
  const date = c.req.query('start') ?? new Date().toISOString().split('T')[0];
  const view = c.req.query('view') === 'crew' ? 'crew' : 'me';
  try {
    return c.json(await c.get('store').getBoard(date, c.get('techId'), view));
  } catch (e) { return fail(c, e); }
});

// --- jobs picker ---
app.get('/api/jobs', async (c) => {
  try {
    const limit = c.req.query('limit');
    const offset = c.req.query('offset');
    const jobs = await c.get('store').getJobs(
      c.req.query('query'),
      c.req.query('area'),
      limit ? Number(limit) : undefined,
      offset ? Number(offset) : undefined
    );
    return c.json({ jobs });
  } catch (e) { return fail(c, e); }
});

// --- requests ---
app.get('/api/requests', async (c) => {
  try {
    const requests = await c.get('store').getMyRequests(c.get('techId'));
    return c.json({ requests });
  } catch (e) { return fail(c, e); }
});

app.post('/api/requests', async (c) => {
  try {
    const b = await c.req.json();
    const techId = c.get('techId');
    const row = await c.get('store').createRequest({
      techId: b.tech_id ?? techId,   // Skip can chalk another board via tech_id
      requestedBy: techId,
      jobId: b.job_id,
      type: b.type === 'Time off' ? 'Time off' : 'Job',
      date: b.date,
      start: b.start,
      end: b.end,
      note: b.note,
    });
    return c.json({ request: row }, 201);
  } catch (e) { return fail(c, e); }
});

// Tech accepts the office's current offer. (The office-side accept lives in
// the crs-dispatch requests panel and calls the same store method with
// actor = 'Office'.)
app.post('/api/requests/:id/accept', async (c) => {
  try {
    const row = await c.get('store').acceptOffer(c.req.param('id'), 'Tech', c.get('techId'));
    return c.json({ request: row });
  } catch (e) { return fail(c, e); }
});

app.post('/api/requests/:id/counter', async (c) => {
  try {
    const b = await c.req.json();
    const row = await c.get('store').counterOffer(c.req.param('id'), 'Tech', b.date, b.start, b.end, c.get('techId'));
    return c.json({ request: row });
  } catch (e) { return fail(c, e); }
});

app.post('/api/requests/:id/withdraw', async (c) => {
  try {
    const row = await c.get('store').withdraw(c.req.param('id'), c.get('techId'));
    return c.json({ request: row });
  } catch (e) { return fail(c, e); }
});

// --- office-side dev endpoints ---
// These exist so you can play the office role while the crs-dispatch panel
// does not exist yet: counter or approve from curl / a REST client.
// They are dev conveniences; the real office UI lives in crs-dispatch.
app.post('/dev/office/requests/:id/counter', async (c) => {
  try {
    const b = await c.req.json();
    const row = await c.get('store').counterOffer(c.req.param('id'), 'Office', b.date, b.start, b.end);
    return c.json({ request: row });
  } catch (e) { return fail(c, e); }
});

app.post('/dev/office/requests/:id/approve', async (c) => {
  try {
    const row = await c.get('store').acceptOffer(c.req.param('id'), 'Office');
    return c.json({ request: row });
  } catch (e) { return fail(c, e); }
});

app.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }));

export default app;
