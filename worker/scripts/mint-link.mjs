#!/usr/bin/env node
// Mints a magic link for a technician: npm run link -- "Full Tech Name"

const techName = process.argv.slice(2).join(' ').trim();
if (!techName) {
  console.error('Usage: npm run link -- "Full Tech Name"');
  process.exit(1);
}

const workerUrl = (process.env.WORKER_URL ?? 'http://localhost:8787').replace(/\/+$/, '');

try {
  const res = await fetch(`${workerUrl}/auth/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ techName }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`Error (${res.status}): ${data.error ?? 'unknown error'}`);
    process.exit(1);
  }
  console.log(`\n${data.link}\n`);
  console.log(`Expires in ${data.expiresInMinutes} minutes.`);
} catch (err) {
  console.error(`Failed to reach worker at ${workerUrl} -- is dev:node (or wrangler dev) running?`);
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
