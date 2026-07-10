// Local Salesforce stub for contract-testing SalesforceStore without an org.
// Imitates: /services/oauth2/token, /services/data/v61.0/query,
// /services/data/v61.0/sobjects/{type} (POST) and /{id} (PATCH).
// Records every call so the test can assert on SOQL strings and write bodies.
import { createServer } from 'node:http';

const PORT = 9999;
export const log = [];

// tiny seeded org
const TECHS = { Leo: 'a0T000000000001', Marcus: 'a0T000000000002', Skip: 'a0T000000000005' };
const OPPS = [
  { Id: '006000000000J77', Name: 'WO 1077 Atrium fire panel', Account: { Name: 'Atrium Health', ShippingCity: 'Charlotte' }, Opportunity_Type__c: 'Inspection', Project_Status__c: 'Ready to be scheduled' },
  { Id: '006000000000J63', Name: 'WO 1063 Harris Teeter sprinkler', Account: { Name: 'Harris Teeter', ShippingCity: 'Matthews' }, Opportunity_Type__c: 'Service', Project_Status__c: 'Quoted' },
];
let requests = [
  {
    Id: 'a0R000000000001', Type__c: 'Job',
    Job__c: '006000000000J77', Job__r: { Name: 'J-1077', Account: { Name: 'Atrium Health' } },
    Technician__c: TECHS.Leo, Requested_By__c: TECHS.Leo,
    CreatedDate: new Date(Date.now() - 4 * 3600_000).toISOString(),
    Proposed_Date__c: '2026-07-10',
    Proposed_Start__c: '08:00:00.000Z', Proposed_End__c: '12:00:00.000Z',
    Status__c: 'Countered', Last_Offer_By__c: 'Office', Note__c: null,
  },
];
let assignments = [
  { Id: 'a0A000000000001', Opportunity__c: '006000000000J63',
    Opportunity__r: { Name: 'J-1063', Account: { Name: 'Harris Teeter' } },
    Technician__c: TECHS.Marcus, Start_Time__c: '08:00:00.000Z', Work_Date__c: '2026-07-10' },
];
let idSeq = 100;

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => resolve(b));
});

const answerQuery = (soql) => {
  const s = soql.replace(/\s+/g, ' ');
  if (s.includes('FROM Technician__c')) {
    const m = s.match(/Name = '([^']+)'/);
    const id = TECHS[m?.[1]];
    return { records: id ? [{ Id: id }] : [], done: true };
  }
  if (s.includes('FROM Opportunity')) {
    return { records: OPPS, done: true };
  }
  if (s.includes('FROM Job_Assignment__c')) {
    return { records: assignments, done: true };
  }
  if (s.includes('FROM Schedule_Request__c')) {
    const idm = s.match(/Id = '([^']+)'/);
    if (idm) return { records: requests.filter(r => r.Id === idm[1]), done: true };
    if (s.includes("Status__c = 'Countered'") && s.includes("Last_Offer_By__c = 'Office'")) {
      const tm = s.match(/Technician__c = '([^']+)'/);
      return { records: requests.filter(r => r.Technician__c === tm?.[1] && r.Status__c === 'Countered' && r.Last_Offer_By__c === 'Office'), done: true };
    }
    if (s.includes("Type__c = 'Time off'") && s.includes("Status__c = 'Approved'")) {
      return { records: [], done: true };
    }
    if (s.includes('Proposed_Date__c =')) {
      return { records: requests.filter(r => ['Requested','Countered'].includes(r.Status__c)), done: true };
    }
    const tm = s.match(/Technician__c = '([^']+)'/);
    if (tm) return { records: requests.filter(r => r.Technician__c === tm[1]), done: true };
  }
  return { records: [], done: true };
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/__log') return json(res, 200, log);
  const entry = { method: req.method, path: url.pathname, auth: req.headers.authorization ?? null };

  if (url.pathname === '/services/oauth2/token') {
    const body = await readBody(req);
    const p = new URLSearchParams(body);
    entry.body = Object.fromEntries(p);
    log.push(entry);
    if (p.get('grant_type') !== 'client_credentials') return json(res, 400, { error: 'unsupported_grant_type' });
    if (p.get('client_id') !== 'test-id' || p.get('client_secret') !== 'test-secret')
      return json(res, 401, { error: 'invalid_client' });
    return json(res, 200, { access_token: 'STUB_TOKEN_abc123', token_type: 'Bearer', instance_url: `http://localhost:${PORT}` });
  }

  // everything below requires the bearer
  if (req.headers.authorization !== 'Bearer STUB_TOKEN_abc123') {
    log.push({ ...entry, note: 'rejected 401' });
    return json(res, 401, [{ errorCode: 'INVALID_SESSION_ID' }]);
  }

  if (url.pathname.endsWith('/query')) {
    entry.soql = url.searchParams.get('q');
    log.push(entry);
    return json(res, 200, answerQuery(entry.soql));
  }

  const insertMatch = url.pathname.match(/\/sobjects\/(\w+)$/);
  if (insertMatch && req.method === 'POST') {
    const body = JSON.parse(await readBody(req));
    entry.sobject = insertMatch[1]; entry.body = body;
    log.push(entry);
    const newId = `NEW${insertMatch[1].slice(0, 3).toUpperCase()}${String(idSeq++)}`;
    if (insertMatch[1] === 'Schedule_Request__c') {
      requests.push({ Id: newId, ...body,
        Job__r: OPPS.find(o => o.Id === body.Job__c) ? { Name: OPPS.find(o => o.Id === body.Job__c).Name, Account: OPPS.find(o => o.Id === body.Job__c).Account } : null,
        CreatedDate: new Date().toISOString() });
    }
    if (insertMatch[1] === 'Job_Assignment__c') assignments.push({ Id: newId, ...body });
    return json(res, 201, { id: newId, success: true });
  }

  const patchMatch = url.pathname.match(/\/sobjects\/(\w+)\/([\w]+)$/);
  if (patchMatch && req.method === 'PATCH') {
    const body = JSON.parse(await readBody(req));
    entry.sobject = patchMatch[1]; entry.id = patchMatch[2]; entry.body = body;
    log.push(entry);
    const r = requests.find(x => x.Id === patchMatch[2]);
    if (r) Object.assign(r, body);
    res.writeHead(204); return res.end();
  }

  log.push({ ...entry, note: 'unmatched' });
  json(res, 404, [{ errorCode: 'NOT_FOUND' }]);
}).listen(PORT, () => console.log(`SF stub on :${PORT}`));

// dump the call log on demand
process.on('SIGUSR2', () => console.log(JSON.stringify(log, null, 1)));
