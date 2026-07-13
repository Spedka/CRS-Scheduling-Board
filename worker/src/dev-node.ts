// Node dev server: identical app, no wrangler needed. Passes process.env as
// the worker env so SF_* variables select the SalesforceStore locally.
import 'dotenv/config';
import { serve } from '@hono/node-server';
import app from './index';

// dev-node is a plain Node process -- there's no such thing as a Workers
// service binding outside a real (or wrangler dev) Worker runtime, so
// SalesforceStore's DISPATCH.fetch(...) call has nothing to bind to here.
// If DISPATCH_URL is set (a real crs-dispatch instance running locally,
// e.g. its own `wrangler dev`), fake the binding with a plain HTTP call to
// it instead, rewriting the internal "https://dispatch/..." request URL
// dispatch calls are built against. Without DISPATCH_URL, DISPATCH stays
// undefined and any code path that needs it will fail loudly rather than
// silently no-op -- deploying is the real acceptance gate for that path.
const env = {
  ...process.env,
  DISPATCH: process.env.DISPATCH_URL
    ? { fetch: (req: Request) => fetch(new Request(req.url.replace('https://dispatch', process.env.DISPATCH_URL!), req)) }
    : undefined,
};

serve({ fetch: (req) => app.fetch(req, env as any), port: Number(process.env.PORT ?? 8787) }, (i) =>
  console.log(`chalkboard dev api on http://localhost:${i.port}`));
