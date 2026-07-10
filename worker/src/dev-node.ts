// Node dev server: identical app, no wrangler needed. Passes process.env as
// the worker env so SF_* variables select the SalesforceStore locally.
import 'dotenv/config';
import { serve } from '@hono/node-server';
import app from './index';
serve({ fetch: (req) => app.fetch(req, process.env as any), port: Number(process.env.PORT ?? 8787) }, (i) =>
  console.log(`chalkboard dev api on http://localhost:${i.port}`));
