// Self-contained contract test: starts the SF stub and the API, runs the
// full request flow, prints the exact bodies sent to "Salesforce", exits.
// Usage: node test/contract-test.mjs
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const kids = [];
const die = (code) => { kids.forEach(k => { try { process.kill(-k.pid); } catch {} }); process.exit(code); };
process.on('SIGINT', () => die(1));

const start = (cmd, args, env = {}) => {
  const p = spawn(cmd, args, {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, ...env },
    detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', () => {});
  p.stderr.on('data', d => process.stderr.write(d));
  kids.push(p);
  return p;
};

const req = async (path, opts = {}) => {
  const res = await fetch(`http://localhost:8788${path}`, {
    headers: { Authorization: 'Bearer Leo', 'Content-Type': 'application/json' },
    ...opts,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  if (!cond) failures++;
};

// --- boot ---
start('node', ['test/sf-stub.mjs']);
await wait(800);
start('npx', ['tsx', 'src/dev-node.ts'], {
  PORT: '8788',
  SF_LOGIN_URL: 'http://localhost:9999',
  SF_CLIENT_ID: 'test-id',
  SF_CLIENT_SECRET: 'test-secret',
});
// poll for readiness
let up = false;
for (let i = 0; i < 20 && !up; i++) {
  await wait(500);
  up = await fetch('http://localhost:8788/health').then(r => r.ok).catch(() => false);
}
if (!up) { console.error('API never came up'); die(1); }

// --- tests ---
const jobs = await req('/api/jobs');
check('picker returns jobs', jobs.status === 200 && jobs.body.jobs.length === 2);
check('picker city from Account.ShippingCity', jobs.body.jobs[0]?.City__c === 'Charlotte' || jobs.body.jobs[1]?.City__c === 'Charlotte');
check('picker scope from Opportunity_Type__c', !!jobs.body.jobs[0]?.Scope__c);

const board = await req('/api/board?start=2026-07-10');
check('board merges assignment + request', board.status === 200 && board.body.slots.length === 2);
check('countered banner present with age', !!board.body.countered?.age);

const created = await req('/api/requests', {
  method: 'POST',
  body: JSON.stringify({ job_id: '006000000000J63', type: 'Job', date: '2026-07-13', start: '8:00', end: '11:30', note: 'morning run' }),
});
check('create request', created.status === 201, `-> ${created.body?.request?.Id}`);

const badTurn = await req(`/api/requests/${created.body.request.Id}/counter`, {
  method: 'POST', body: JSON.stringify({ date: '2026-07-14', start: '9:00', end: '12:00' }),
});
check('turn guard rejects countering own offer', badTurn.status === 409);

const accepted = await req('/api/requests/a0R000000000001/accept', { method: 'POST' });
check('tech accepts office counter -> Approved', accepted.status === 200 && accepted.body.request.Status__c === 'Approved');

const mine = await req('/api/requests?mine=1');
check('my requests lists rows with human job names', mine.status === 200 && mine.body.requests.some(r => (r.Job__c ?? '').startsWith('WO ')));

// --- dump exact SF-bound bodies from the stub ---
const dumpRes = await fetch('http://localhost:9999/__log').catch(() => null);
if (dumpRes?.ok) {
  const log = await dumpRes.json();
  console.log('\n--- exact bodies sent to Salesforce ---');
  for (const e of log) {
    if (e.path?.endsWith('/token')) console.log('TOKEN grant:', e.body?.grant_type);
    else if (e.soql?.includes('FROM Opportunity')) console.log('PICKER SOQL:', e.soql);
    else if (e.soql?.includes('FROM Technician__c')) console.log('TECH SOQL:', e.soql);
    else if (e.method === 'POST' && e.sobject) console.log(`INSERT ${e.sobject}:`, JSON.stringify(e.body));
    else if (e.method === 'PATCH') console.log(`PATCH ${e.sobject}/${e.id}:`, JSON.stringify(e.body));
  }
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
die(failures === 0 ? 0 : 1);
