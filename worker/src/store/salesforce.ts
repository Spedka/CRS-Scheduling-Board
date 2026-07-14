// SalesforceStore: implements the same Store interface as MockStore, against
// your org. Auth is client credentials against the external app you already
// use for the dispatch board.
//
// Env vars / bindings, same shape as the crs-dispatch worker:
//   SF_CLIENT_ID      external app consumer key
//   SF_CLIENT_SECRET  external app consumer secret
//   SF_LOGIN_URL      optional, defaults to https://login.salesforce.com;
//                     instance_url comes back in the token response
//   SF_TOKENS         optional Workers KV binding for the shared token cache
//                     (same two-layer mem+KV pattern as crs-dispatch)

import type {
  Store, BoardResponse, BoardSlot, JobRow, RequestRow, CreateRequestInput, TimePoint, DayActivity,
} from './store';
import { addDaysIso, findNextGap } from './store';

// ---------------------------------------------------------------------------
// CONFIG: every org-specific name lives here. If a picker field or stage
// value is wrong, this block is the only place to fix it.
// ---------------------------------------------------------------------------
const CFG = {
  apiVersion: 'v60.0',            // matches crs-dispatch

  // Opportunity fields for the job picker (names from crs-dispatch config.js)
  opp: {
    number: 'Name',
    customer: 'Account.Name',
    scope: 'Opportunity_Type__c',           // closest scope-line field in the org
    city: 'Account.ShippingCity',
    dueDate: null as string | null,         // no due-date field in the org today;
                                            // set the API name here if one is added
    // Job-level address fields (distinct from the Account's own address) --
    // what the detail popup shows in place of the customer name, and part
    // of what the picker searches against.
    address: {
      street: 'Job_Street_Address2__c',
      city: 'Job_City__c',
      state: 'Job_State__c',
      zip: 'Job_Zip_Code__c',
    },
    statusField: 'Project_Status__c',
    // Statuses that count as "open and requestable" in the picker. Broad on
    // purpose: the design lets techs chalk work whether it's entered, ready,
    // or already scheduled. Trim this list if Darryl wants it narrower.
    openStatuses: [
      'Pending Customer Approval', 'Quoted', 'Parts Ordered',
      'Ready to be scheduled', 'Scheduled', 'Installation Completed',
    ],
    // Keeps the picker from surfacing ancient or far-future Opportunities.
    closeDateRangeDays: 365,
  },

  // Job_Assignment__c (matches your other worker's mapping)
  assignment: {
    sobject: 'Job_Assignment__c',
    opp: 'Opportunity__c',        // lookup -> Opportunity
    tech: 'Technician__c',
    start: 'Start_Time__c',
    workDate: 'Work_Date__c',
    end: 'End_Time__c' as string | null,
  },

  // Schedule_Request__c
  request: {
    sobject: 'Schedule_Request__c',
    job: 'Job__c',                // lookup -> Opportunity (yes, different name
                                  // than the assignment's lookup; intentional)
    tech: 'Technician__c',        // lookup -> Technician__c
    requestedBy: 'Requested_By__c',
    timeOff: 'Time_Off__c',       // checkbox, true iff Type__c = 'Time off'
  },

  technician: {
    sobject: 'Technician__c',
    active: 'Active__c',
    // Techs allowed to chalk ANY board (exact Technician__c.Name values):
    anyBoardNames: ['Skip Cashion'],
  },
};
// ---------------------------------------------------------------------------

interface Env {
  SF_CLIENT_ID: string;
  SF_CLIENT_SECRET: string;
  SF_LOGIN_URL?: string;
  SF_TOKENS?: { get(k: string, t?: string): Promise<any>; put(k: string, v: string, o?: any): Promise<any>; delete(k: string): Promise<any> };
  // Real Opportunity Id that "New WO Required" picks in the composer attach
  // to -- a catch-all placeholder for work that isn't in the system yet.
  // Hidden from the picker itself by giving it a Project_Status__c outside
  // CFG.opp.openStatuses.
  NEW_WO_OPPORTUNITY_ID?: string;
  // Real Opportunity Id that approved Time off requests attach to, so they
  // become a real Job_Assignment__c (not just a Schedule_Request__c) like
  // any other approved request. Same hidden-from-picker treatment.
  TIME_OFF_OPPORTUNITY_ID?: string;
  // crs-dispatch service binding: the canonical assignment-creation path
  // (createAssignment), which also handles the Field Squared push. Absent
  // under dev-node (see dev-node.ts's DISPATCH_URL fallback for local dev).
  DISPATCH?: { fetch(req: Request): Promise<Response> };
}

// Sentinel the frontend sends as job_id for the "New WO Required" pick.
// Never a real Opportunity Id, so it can't collide with one.
const NEW_WO_SENTINEL = 'NEW_WO_REQUIRED';
const NEW_WO_LABEL = 'New WO Required';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// Traverse a dotted relationship path ("Account.ShippingCity") through a
// SOQL query result object.
const getPath = (obj: any, path: string): any => path.split('.').reduce((v, k) => v?.[k], obj);

const formatAddress = (street?: string, city?: string, state?: string, zip?: string): string => {
  const cityStateZip = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [street, cityStateZip].filter(Boolean).join(', ');
};

// SF Time fields: "08:00:00.000Z" <-> {hour,minute} <-> "8:00"
const sfTimeToPoint = (t: string | null): TimePoint => {
  if (!t) return { hour: 0, minute: 0 };
  const [h, m] = t.split(':');
  return { hour: Number(h), minute: Number(m) };
};
const sfTimeToLabel = (t: string | null): string => {
  const p = sfTimeToPoint(t);
  return `${p.hour}:${String(p.minute).padStart(2, '0')}`;
};
const labelToSfTime = (label: string): string => {
  const [h, m] = label.split(':').map(Number);
  return `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}:00.000Z`;
};

const httpError = (message: string, status: number) =>
  Object.assign(new Error(message), { status });

// --- SF REST client: same two-layer token cache (memory + optional KV) and
// login-URL flow as crs-dispatch's salesforce.js, ported to TS ---
interface TokenState { token: string | null; instanceUrl: string | null; expires: number }
let mem: TokenState = { token: null, instanceUrl: null, expires: 0 };

class SfClient {
  constructor(private env: Env) {}

  private async getToken(): Promise<{ token: string; instanceUrl: string }> {
    const now = Date.now();
    if (mem.token && mem.instanceUrl && now < mem.expires) {
      return { token: mem.token, instanceUrl: mem.instanceUrl };
    }

    const KV = this.env.SF_TOKENS;
    if (KV) {
      const hit = await KV.get('sf_token', 'json');
      if (hit?.token && hit?.instanceUrl && now < hit.expires) {
        mem = hit;
        return { token: mem.token!, instanceUrl: mem.instanceUrl! };
      }
    }

    const base = (this.env.SF_LOGIN_URL || 'https://login.salesforce.com').replace(/\/+$/, '');
    const res = await fetch(`${base}/services/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.env.SF_CLIENT_ID,
        client_secret: this.env.SF_CLIENT_SECRET,
      }),
    });
    if (!res.ok) throw httpError(`Salesforce auth failed: ${res.status} ${await res.text()}`, 502);
    const data = await res.json() as { access_token: string; instance_url: string };
    mem = {
      token: data.access_token,
      instanceUrl: data.instance_url,
      expires: Date.now() + 30 * 60_000,
    };
    if (KV) await KV.put('sf_token', JSON.stringify(mem), { expirationTtl: 1800 });
    return { token: mem.token!, instanceUrl: mem.instanceUrl! };
  }

  private async call(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
    const { token, instanceUrl } = await this.getToken();
    const res = await fetch(`${instanceUrl}/services/data/${CFG.apiVersion}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (res.status === 401 && !retried) {
      mem = { token: null, instanceUrl: null, expires: 0 };
      if (this.env.SF_TOKENS) await this.env.SF_TOKENS.delete('sf_token');
      return this.call(path, init, true);
    }
    return res;
  }

  async query<T = any>(soql: string): Promise<T[]> {
    const res = await this.call(`/query?q=${encodeURIComponent(soql)}`);
    if (!res.ok) throw httpError(`SOQL failed (${res.status}): ${await res.text()}`, 502);
    const data = await res.json() as { records: T[]; done: boolean; nextRecordsUrl?: string };
    // Board/picker volumes at CRS fit one page; guard anyway.
    let records = data.records;
    let next = data.nextRecordsUrl;
    while (next) {
      const { token: t, instanceUrl } = await this.getToken();
      const r = await fetch(`${instanceUrl}${next}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const d = await r.json() as { records: T[]; nextRecordsUrl?: string };
      records = records.concat(d.records);
      next = d.nextRecordsUrl;
    }
    return records;
  }

  async insert(sobject: string, body: Record<string, unknown>): Promise<string> {
    const res = await this.call(`/sobjects/${sobject}`, {
      method: 'POST', body: JSON.stringify(body),
    });
    if (!res.ok) throw httpError(`Insert ${sobject} failed (${res.status}): ${await res.text()}`, 502);
    const data = await res.json() as { id: string };
    return data.id;
  }

  async update(sobject: string, id: string, body: Record<string, unknown>): Promise<void> {
    const res = await this.call(`/sobjects/${sobject}/${id}`, {
      method: 'PATCH', body: JSON.stringify(body),
    });
    if (!res.ok) throw httpError(`Update ${sobject} failed (${res.status}): ${await res.text()}`, 502);
  }
}

// --- the store ---
export class SalesforceStore implements Store {
  private sf: SfClient;
  private env: Env;
  private techByName = new Map<string, string>(); // Name -> Technician__c Id
  private oppName = new Map<string, string>();    // Opp Id -> J-#### label

  constructor(env: Env) {
    this.sf = new SfClient(env);
    this.env = env;
  }

  // Techs are identified by unique Technician__c.Name. The bearer token
  // carries the name for now; swap for real device tokens later without
  // touching anything else.
  async resolveTech(name: string): Promise<string> {
    const cached = this.techByName.get(name);
    if (cached) return cached;
    const rows = await this.sf.query<{ Id: string }>(
      `SELECT Id FROM ${CFG.technician.sobject} ` +
      `WHERE Name = '${esc(name)}' AND ${CFG.technician.active} = true LIMIT 1`
    );
    if (!rows.length) throw httpError(`Unknown technician: ${name}`, 401);
    this.techByName.set(name, rows[0].Id);
    return rows[0].Id;
  }

  async verifyTech(name: string): Promise<boolean> {
    try {
      await this.resolveTech(name);
      return true;
    } catch {
      return false;
    }
  }

  async getJobs(query?: string, area?: string, limit = 200, offset = 0): Promise<JobRow[]> {
    const o = CFG.opp;
    const where: string[] = [
      `${o.statusField} IN (${o.openStatuses.map(s => `'${esc(s)}'`).join(',')})`,
      `CloseDate >= LAST_N_DAYS:${o.closeDateRangeDays} AND CloseDate <= NEXT_N_DAYS:${o.closeDateRangeDays}`,
    ];
    if (area) where.push(`${o.city} = '${esc(area)}'`);
    if (query) {
      const q = esc(query);
      where.push(
        `(${o.number} LIKE '%${q}%' OR ${o.customer} LIKE '%${q}%' OR ${o.city} LIKE '%${q}%' ` +
        `OR ${o.address.street} LIKE '%${q}%' OR ${o.address.city} LIKE '%${q}%' ` +
        `OR ${o.address.state} LIKE '%${q}%' OR ${o.address.zip} LIKE '%${q}%')`
      );
    }
    const fields = [
      'Id', o.number, o.customer, o.scope, o.city, o.statusField,
      o.address.street, o.address.city, o.address.state, o.address.zip,
    ];
    if (o.dueDate) fields.push(o.dueDate);
    const orderBy = o.dueDate ? `${o.dueDate} ASC NULLS LAST` : `${o.number} ASC`;
    const soql =
      `SELECT ${fields.join(', ')} FROM Opportunity ` +
      `WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`;
    const rows = await this.sf.query<any>(soql);
    const soon = Date.now() + 30 * 86_400_000;
    return rows.map(r => {
      this.oppName.set(r.Id, r[o.number]);
      const due = o.dueDate ? r[o.dueDate] : null;
      return {
        Id: r.Id,
        Name: r[o.number],
        Customer_Name__c: r.Account?.Name ?? '',
        Scope__c: r[o.scope] ?? '',
        City__c: r.Account?.ShippingCity ?? '',
        Address: formatAddress(r[o.address.street], r[o.address.city], r[o.address.state], r[o.address.zip]),
        Due_Date__c: due ?? '',
        due_soon: due ? new Date(due).getTime() < soon : false,
      };
    });
  }

  async getBoard(date: string, techName: string, view: 'me' | 'crew'): Promise<BoardResponse> {
    const techId = await this.resolveTech(techName);
    const a = CFG.assignment;
    const rq = CFG.request;
    const o = CFG.opp;
    const slots: BoardSlot[] = [];

    // Extra Opportunity fields for the job detail popup, riding along on the
    // same relationship traversal already used for jobName.
    const detailFields = [
      o.scope, o.city, o.address.street, o.address.city, o.address.state, o.address.zip,
      ...(o.dueDate ? [o.dueDate] : []),
    ];
    const detailOf = (rel: any) => ({
      scope: getPath(rel, o.scope),
      city: getPath(rel, o.city),
      address: formatAddress(
        getPath(rel, o.address.street), getPath(rel, o.address.city),
        getPath(rel, o.address.state), getPath(rel, o.address.zip)
      ),
      dueDate: o.dueDate ? getPath(rel, o.dueDate) : undefined,
    });

    // Mirrored schedule. NOTE: direct query for now; move behind the
    // crs-dispatch service binding when it exposes a board read, so both
    // boards render from one query shape.
    const assignments = await this.sf.query<any>(
      `SELECT Id, ${a.opp}, ${a.opp.replace('__c', '__r')}.Name, ` +
      `${a.opp.replace('__c', '__r')}.Account.Name, ` +
      detailFields.map(f => `${a.opp.replace('__c', '__r')}.${f}`).join(', ') + ', ' +
      `${a.tech}, ${a.start}` +
      (a.end ? `, ${a.end}` : '') +
      ` FROM ${a.sobject} WHERE ${a.workDate} = ${date}`
    );
    for (const r of assignments) {
      const isTimeOff = r[a.opp] === this.env.TIME_OFF_OPPORTUNITY_ID;
      const rel = r[a.opp.replace('__c', '__r')];
      const start = sfTimeToPoint(r[a.start]);
      const end: TimePoint = a.end && r[a.end]
        ? sfTimeToPoint(r[a.end])
        : { hour: Math.min(start.hour + 2, 20), minute: start.minute }; // no end field: render 2h block
      slots.push({
        id: r.Id, type: isTimeOff ? 'time-off' : 'scheduled',
        jobId: isTimeOff ? undefined : r[a.opp],
        jobName: isTimeOff ? 'Time off' : rel ? rel.Name : r[a.opp],
        customerName: isTimeOff ? undefined : rel?.Account?.Name,
        ...(isTimeOff ? {} : detailOf(rel)),
        techId: r[a.tech],
        startTime: start, endTime: end,
        status: isTimeOff ? 'Off' : 'Scheduled',
      });
    }

    const requests = await this.sf.query<any>(
      `SELECT Id, Type__c, ${rq.job}, ${rq.job.replace('__c', '__r')}.Name, ` +
      `${rq.job.replace('__c', '__r')}.Account.Name, ` +
      detailFields.map(f => `${rq.job.replace('__c', '__r')}.${f}`).join(', ') + ', ' +
      `${rq.tech}, ` +
      `Proposed_Start__c, Proposed_End__c, Status__c, Last_Offer_By__c, Note__c, CreatedDate ` +
      `FROM ${rq.sobject} WHERE Proposed_Date__c = ${date} ` +
      `AND Status__c IN ('Requested','Countered')`
    );
    for (const r of requests) {
      const isTimeOff = r.Type__c === 'Time off';
      const rel = r[rq.job.replace('__c', '__r')];
      slots.push({
        id: r.Id,
        type: isTimeOff ? 'time-off'
            : r.Status__c === 'Countered' ? 'countered' : 'pending',
        // Job__c now points at the time-off placeholder Opportunity from
        // the moment the request is written (so the office can see it
        // pre-approval too), but that placeholder's own account/scope/
        // address are irrelevant here -- a time-off slot isn't "at" a job.
        jobId: isTimeOff ? undefined : r[rq.job] ?? undefined,
        jobName: isTimeOff ? 'Time off' : rel ? rel.Name : '',
        customerName: isTimeOff ? undefined : rel?.Account?.Name,
        ...(isTimeOff || !rel ? {} : detailOf(rel)),
        techId: r[rq.tech],
        startTime: sfTimeToPoint(r.Proposed_Start__c),
        endTime: sfTimeToPoint(r.Proposed_End__c),
        note: r.Note__c ?? undefined,
        status: r.Status__c === 'Requested' ? 'Pending office' : 'Reply needed',
      });
    }

    // Approved time off no longer needs a separate query: acceptOffer now
    // creates a real Job_Assignment__c on the TIME_OFF_OPPORTUNITY_ID
    // sentinel (same as any other approved request), which the assignments
    // query above already picks up and types correctly. Querying approved
    // Schedule_Request__c rows here too would double-count the same day.

    // Countered banner: oldest countered request waiting on this tech.
    const countered = await this.sf.query<any>(
      `SELECT Id, ${rq.job.replace('__c', '__r')}.Name, ` +
      `${rq.job.replace('__c', '__r')}.Account.Name, Type__c, CreatedDate ` +
      `FROM ${rq.sobject} WHERE ${rq.tech} = '${esc(techId)}' ` +
      `AND Status__c = 'Countered' AND Last_Offer_By__c = 'Office' ` +
      `ORDER BY CreatedDate ASC LIMIT 1`
    );
    let banner: BoardResponse['countered'];
    if (countered.length) {
      const c = countered[0];
      const rel = c[rq.job.replace('__c', '__r')];
      const hrs = Math.floor((Date.now() - new Date(c.CreatedDate).getTime()) / 3_600_000);
      banner = {
        requestId: c.Id,
        jobName: c.Type__c === 'Time off' ? 'Time off'
               : rel ? rel.Name : '',
        age: hrs < 1 ? '<1h' : hrs < 24 ? `${hrs}h` : `${Math.floor(hrs / 24)}d`,
      };
    }

    const finalSlots = view === 'me' ? slots.filter(s => s.techId === techId) : slots;

    // Attach display names -- slots only carry the Technician__c Id from the
    // junction field, and Crew view needs to show whose job is whose.
    const distinctTechIds = [...new Set(finalSlots.map(s => s.techId).filter(Boolean))];
    if (distinctTechIds.length) {
      const names = await this.sf.query<{ Id: string; Name: string }>(
        `SELECT Id, Name FROM ${CFG.technician.sobject} ` +
        `WHERE Id IN (${distinctTechIds.map(id => `'${esc(id)}'`).join(',')})`
      );
      const nameById = new Map(names.map(n => [n.Id, n.Name]));
      for (const s of finalSlots) s.techName = nameById.get(s.techId) ?? s.techId;
    }

    return {
      slots: finalSlots,
      countered: banner,
    };
  }

  async getMyRequests(techName: string): Promise<RequestRow[]> {
    const techId = await this.resolveTech(techName);
    const rq = CFG.request;
    const rows = await this.sf.query<any>(
      `SELECT Id, Type__c, ${rq.job.replace('__c', '__r')}.Name, ${rq.tech}, ${rq.requestedBy}, ` +
      `CreatedDate, Proposed_Date__c, Proposed_Start__c, Proposed_End__c, Status__c, Last_Offer_By__c, ` +
      `Note__c, Office_Note__c, Resolved_At__c ` +
      `FROM ${rq.sobject} WHERE ${rq.tech} = '${esc(techId)}' ` +
      `AND (` +
      `Status__c IN ('Requested', 'Countered') ` +
      `OR (Status__c = 'Approved' AND Proposed_Date__c >= LAST_N_DAYS:7) ` +
      `OR (Status__c IN ('Denied', 'Withdrawn') AND Resolved_At__c >= LAST_N_DAYS:7)` +
      `) ` +
      `ORDER BY CreatedDate DESC LIMIT 100`
    );
    // Expired is not a stored status -- a row is expired when it's still
    // Requested/Countered but its proposed date has passed. That's already
    // covered by the open-status clause above; the frontend derives the
    // "Expired" label itself from Proposed_Date__c, so it must stay visible
    // here rather than being filtered out server-side.
    return rows.map(r => ({
      Id: r.Id,
      Type__c: r.Type__c,
      Job__c: r[rq.job.replace('__c', '__r')]?.Name ?? null, // human J-#### for the UI
      Tech__c: r[rq.tech],
      Requested_By__c: r[rq.requestedBy],
      CreatedDate: r.CreatedDate,
      Proposed_Date__c: r.Proposed_Date__c,
      Proposed_Start__c: sfTimeToLabel(r.Proposed_Start__c),
      Proposed_End__c: sfTimeToLabel(r.Proposed_End__c),
      Status__c: r.Status__c,
      Last_Offer_By__c: r.Last_Offer_By__c,
      Note__c: r.Note__c ?? undefined,
      Office_Note__c: r.Office_Note__c ?? undefined,
      Resolved_At__c: r.Resolved_At__c ?? undefined,
    }));
  }

  async createRequest(input: CreateRequestInput): Promise<RequestRow> {
    const rq = CFG.request;
    const techId = await this.resolveTech(input.techId);
    const requesterId = await this.resolveTech(input.requestedBy);

    // Invariant 2 lives server-side even though the UI also enforces it.
    // Any-board writers are configured by exact Technician__c.Name in
    // CFG.technician.anyBoardNames; move to a checkbox field when convenient.
    if (techId !== requesterId && !CFG.technician.anyBoardNames.includes(input.requestedBy)) {
      throw httpError('You can only chalk your own board', 403);
    }

    // "New WO Required": the job isn't in Salesforce yet. Attaches to a
    // fixed placeholder Opportunity instead of a real one -- the note is
    // the only thing telling the office what to actually open, so it's
    // mandatory here even though it's optional for a normal job request.
    let jobId = input.jobId;
    if (jobId === NEW_WO_SENTINEL) {
      if (!this.env.NEW_WO_OPPORTUNITY_ID) {
        throw httpError('New WO placeholder is not configured (NEW_WO_OPPORTUNITY_ID)', 500);
      }
      if (!input.note?.trim()) {
        throw httpError('A note is required for a new WO request', 400);
      }
      jobId = this.env.NEW_WO_OPPORTUNITY_ID;
      this.oppName.set(jobId, NEW_WO_LABEL);
    }

    // Time off: same placeholder-Opportunity treatment as New WO, but
    // applied from the moment the request is written rather than only at
    // approval. Job__c on the Schedule_Request__c itself now always points
    // at TIME_OFF_OPPORTUNITY_ID, not just the resulting Job_Assignment__c
    // -- so the office can see it's a time-off request against that
    // Opportunity even before it's approved, not just after.
    if (input.type === 'Time off') {
      if (!this.env.TIME_OFF_OPPORTUNITY_ID) {
        throw httpError('Time off placeholder is not configured (TIME_OFF_OPPORTUNITY_ID)', 500);
      }
      jobId = this.env.TIME_OFF_OPPORTUNITY_ID;
      this.oppName.set(jobId, 'Time off');
    }

    if (input.type === 'Job' && !jobId) {
      throw httpError('Job requests require a job', 400);
    }

    
    const body: Record<string, unknown> = {
      Name: `${input.techId} - ${input.date}`,
      Type__c: input.type,
      [rq.tech]: techId,
      [rq.requestedBy]: requesterId,
      Proposed_Date__c: input.date,
      Proposed_Start__c: labelToSfTime(input.start),
      Proposed_End__c: labelToSfTime(input.end),
      Status__c: 'Requested',
      Last_Offer_By__c: 'Tech',
      [rq.timeOff]: input.type === 'Time off',
    };
    if (jobId) body[rq.job] = jobId;
    if (input.note) body.Note__c = input.note;

    const id = await this.sf.insert(rq.sobject, body);
    return {
      Id: id, Type__c: input.type,
      Job__c: jobId ? this.oppName.get(jobId) ?? jobId : null,
      Tech__c: techId, Requested_By__c: requesterId,
      CreatedDate: new Date().toISOString(),
      Proposed_Date__c: input.date,
      Proposed_Start__c: input.start, Proposed_End__c: input.end,
      Status__c: 'Requested', Last_Offer_By__c: 'Tech',
      Note__c: input.note,
    };
  }

  private async fetchRequest(id: string) {
    const rq = CFG.request;
    const rows = await this.sf.query<any>(
      `SELECT Id, Type__c, ${rq.job}, ${rq.job.replace('__c', '__r')}.Name, ${rq.tech}, ${rq.requestedBy}, ` +
      `CreatedDate, Proposed_Date__c, Proposed_Start__c, Proposed_End__c, Status__c, Last_Offer_By__c, ` +
      `Note__c, Office_Note__c, Resolved_At__c ` +
      `FROM ${rq.sobject} WHERE Id = '${esc(id)}' LIMIT 1`
    );
    if (!rows.length) throw httpError('Request not found', 404);
    return rows[0];
  }

  // Single-row lookup for NegotiationSheet -- avoids fetching+filtering the
  // whole getMyRequests list just to find one row by id.
  async getRequest(id: string, techName: string): Promise<RequestRow> {
    const rq = CFG.request;
    const r = await this.fetchRequest(id);
    const techId = await this.resolveTech(techName);
    if (r[rq.tech] !== techId) throw httpError('Not your request', 403);
    return this.toRow(r);
  }

  // WeekStrip's dots: one lean pair of range queries instead of 7 full
  // /api/board fetches. Only the 3 dot categories matter here -- time off
  // is deliberately excluded, matching the dots WeekStrip has always shown
  // (a time-off day renders no dot, same as before this endpoint existed).
  async getWeekActivity(techName: string, start: string, end: string): Promise<DayActivity[]> {
    const techId = await this.resolveTech(techName);
    const a = CFG.assignment;
    const rq = CFG.request;

    const assignments = await this.sf.query<any>(
      `SELECT ${a.workDate}, ${a.opp} FROM ${a.sobject} ` +
      `WHERE ${a.tech} = '${esc(techId)}' AND ${a.workDate} >= ${start} AND ${a.workDate} <= ${end}`
    );
    const requests = await this.sf.query<any>(
      `SELECT Proposed_Date__c, Type__c, Status__c FROM ${rq.sobject} ` +
      `WHERE ${rq.tech} = '${esc(techId)}' AND Proposed_Date__c >= ${start} AND Proposed_Date__c <= ${end} ` +
      `AND Status__c IN ('Requested','Countered')`
    );

    const byDate = new Map<string, DayActivity>();
    const entry = (date: string) => {
      let e = byDate.get(date);
      if (!e) { e = { date, scheduled: false, pending: false, countered: false }; byDate.set(date, e); }
      return e;
    };
    for (const r of assignments) {
      if (r[a.opp] === this.env.TIME_OFF_OPPORTUNITY_ID) continue;
      entry(r[a.workDate]).scheduled = true;
    }
    for (const r of requests) {
      if (r.Type__c === 'Time off') continue;
      const e = entry(r.Proposed_Date__c);
      if (r.Status__c === 'Countered') e.countered = true; else e.pending = true;
    }
    return [...byDate.values()];
  }

  // ComposerSheet's "next open 2h gap" default window: one range query per
  // object instead of up to 15 sequential per-day /api/board fetches. Time
  // off DOES count as occupied here (unlike getWeekActivity's dots) --
  // matches the original client-side logic, which merged every slot type
  // returned by /api/board without filtering any out.
  async getNextOpenGap(techName: string, fromDate: string, maxDaysAhead: number): Promise<{ date: string; start: string; end: string } | null> {
    const techId = await this.resolveTech(techName);
    const a = CFG.assignment;
    const rq = CFG.request;
    const toDate = addDaysIso(fromDate, maxDaysAhead);

    const assignments = await this.sf.query<any>(
      `SELECT ${a.workDate}, ${a.start}${a.end ? `, ${a.end}` : ''} FROM ${a.sobject} ` +
      `WHERE ${a.tech} = '${esc(techId)}' AND ${a.workDate} >= ${fromDate} AND ${a.workDate} <= ${toDate}`
    );
    const requests = await this.sf.query<any>(
      `SELECT Proposed_Date__c, Proposed_Start__c, Proposed_End__c FROM ${rq.sobject} ` +
      `WHERE ${rq.tech} = '${esc(techId)}' AND Proposed_Date__c >= ${fromDate} AND Proposed_Date__c <= ${toDate} ` +
      `AND Status__c IN ('Requested','Countered')`
    );

    const occupiedByDate = new Map<string, { startTime: TimePoint; endTime: TimePoint }[]>();
    const push = (d: string, s: TimePoint, e: TimePoint) => {
      const arr = occupiedByDate.get(d) ?? [];
      arr.push({ startTime: s, endTime: e });
      occupiedByDate.set(d, arr);
    };
    for (const r of assignments) {
      const start = sfTimeToPoint(r[a.start]);
      const end: TimePoint = a.end && r[a.end]
        ? sfTimeToPoint(r[a.end])
        : { hour: Math.min(start.hour + 2, 20), minute: start.minute };
      push(r[a.workDate], start, end);
    }
    for (const r of requests) {
      push(r.Proposed_Date__c, sfTimeToPoint(r.Proposed_Start__c), sfTimeToPoint(r.Proposed_End__c));
    }
    return findNextGap(occupiedByDate, fromDate, maxDaysAhead);
  }

  private toRow(r: any): RequestRow {
    const rq = CFG.request;
    return {
      Id: r.Id, Type__c: r.Type__c,
      Job__c: r[rq.job.replace('__c', '__r')]?.Name ?? null,
      Tech__c: r[rq.tech], Requested_By__c: r[rq.requestedBy],
      CreatedDate: r.CreatedDate,
      Proposed_Date__c: r.Proposed_Date__c,
      Proposed_Start__c: sfTimeToLabel(r.Proposed_Start__c),
      Proposed_End__c: sfTimeToLabel(r.Proposed_End__c),
      Status__c: r.Status__c, Last_Offer_By__c: r.Last_Offer_By__c,
      Note__c: r.Note__c ?? undefined,
      Office_Note__c: r.Office_Note__c ?? undefined,
      Resolved_At__c: r.Resolved_At__c ?? undefined,
    };
  }

  async acceptOffer(id: string, actor: 'Tech' | 'Office', actorTechName?: string): Promise<RequestRow> {
    const rq = CFG.request;
    const r = await this.fetchRequest(id);

    if (r.Status__c !== 'Requested' && r.Status__c !== 'Countered')
      throw httpError(`Cannot accept a ${r.Status__c} request`, 409);
    if (r.Last_Offer_By__c === actor)
      throw httpError('The current offer is yours; the other side must accept', 409);
    if (actor === 'Tech') {
      const techId = await this.resolveTech(actorTechName!);
      if (r[rq.tech] !== techId) throw httpError('Not your request', 403);
    }

    const patch: Record<string, unknown> = { Status__c: 'Approved' };

    // Invariant 1: the assignment is born here, and only here -- via the
    // crs-dispatch service binding, which is the SAME assignment-creation
    // path (createAssignment) normal dispatch uses, so the Field Squared
    // push actually happens. A direct Job_Assignment__c insert bypasses
    // that push entirely and gets silently deleted on dispatch's next FS
    // reconcile tick. Job requests attach to their own Opportunity; time
    // off attaches to the fixed placeholder Opportunity so it still becomes
    // a real assignment (blocks the day on the board) rather than a request
    // with no footprint. createAssignment's own sentinel guard nulls
    // status/scheduledDate when the Opportunity is the time-off placeholder,
    // so status: 'Scheduled' is safe to send unconditionally here.
    const assignmentOpp = r.Type__c === 'Job' ? r[rq.job]
      : r.Type__c === 'Time off' ? this.env.TIME_OFF_OPPORTUNITY_ID
      : undefined;
    if (r.Type__c === 'Time off' && !assignmentOpp) {
      throw httpError('Time off placeholder is not configured (TIME_OFF_OPPORTUNITY_ID)', 500);
    }
    if (assignmentOpp) {
      if (!this.env.DISPATCH) throw httpError('DISPATCH service binding is not configured', 500);
      const dispatchRes = await this.env.DISPATCH.fetch(new Request(
        `https://dispatch/api/jobs/${assignmentOpp}/assignments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            technicianId: r[rq.tech],
            workDate: r.Proposed_Date__c,
            startTime: r.Proposed_Start__c.slice(0, 5), // 'HH:mm:ss.000Z' -> 'HH:mm'
            status: 'Scheduled',
            deriveScheduledDate: true,
          }),
        }
      ));
      if (!dispatchRes.ok) {
        throw httpError(`Assignment creation failed: ${dispatchRes.status} ${await dispatchRes.text()}`, 502);
      }
      const { assignmentId } = await dispatchRes.json() as { assignmentId: string };
      patch.Resulting_Assignment__c = assignmentId;
    }

    await this.sf.update(rq.sobject, r.Id, patch);
    return this.toRow({ ...r, Status__c: 'Approved' });
  }

  async counterOffer(id: string, actor: 'Tech' | 'Office', date: string, start: string, end: string, actorTechName?: string): Promise<RequestRow> {
    const rq = CFG.request;
    const r = await this.fetchRequest(id);

    if (r.Status__c !== 'Requested' && r.Status__c !== 'Countered')
      throw httpError(`Cannot counter a ${r.Status__c} request`, 409);
    if (r.Last_Offer_By__c === actor)
      throw httpError('It is not your turn; the current offer is yours', 409);
    if (actor === 'Tech') {
      const techId = await this.resolveTech(actorTechName!);
      if (r[rq.tech] !== techId) throw httpError('Not your request', 403);
    }

    await this.sf.update(rq.sobject, r.Id, {
      Proposed_Date__c: date,
      Proposed_Start__c: labelToSfTime(start),
      Proposed_End__c: labelToSfTime(end),
      Status__c: 'Countered',
      Last_Offer_By__c: actor,
    });
    return this.toRow({
      ...r, Proposed_Date__c: date,
      Proposed_Start__c: labelToSfTime(start), Proposed_End__c: labelToSfTime(end),
      Status__c: 'Countered', Last_Offer_By__c: actor,
    });
  }

  async updateRequest(id: string, techName: string, date: string, start: string, end: string): Promise<RequestRow> {
    const rq = CFG.request;
    const r = await this.fetchRequest(id);
    const techId = await this.resolveTech(techName);

    if (r[rq.tech] !== techId) throw httpError('Not your request', 403);
    if (r.Status__c !== 'Requested' && r.Status__c !== 'Countered')
      throw httpError(`Cannot update a ${r.Status__c} request`, 409);
    if (r.Last_Offer_By__c !== 'Tech')
      throw httpError('The office has already countered; respond to their offer instead', 409);

    await this.sf.update(rq.sobject, r.Id, {
      Proposed_Date__c: date,
      Proposed_Start__c: labelToSfTime(start),
      Proposed_End__c: labelToSfTime(end),
    });
    return this.toRow({
      ...r, Proposed_Date__c: date,
      Proposed_Start__c: labelToSfTime(start), Proposed_End__c: labelToSfTime(end),
    });
  }

  async withdraw(id: string, techName: string): Promise<RequestRow> {
    const rq = CFG.request;
    const r = await this.fetchRequest(id);
    const techId = await this.resolveTech(techName);
    if (r[rq.tech] !== techId) throw httpError('Not your request', 403);
    if (r.Status__c !== 'Requested' && r.Status__c !== 'Countered')
      throw httpError(`Cannot withdraw a ${r.Status__c} request`, 409);
    const resolvedAt = new Date().toISOString();
    await this.sf.update(rq.sobject, r.Id, { Status__c: 'Withdrawn', Resolved_At__c: resolvedAt });
    return this.toRow({ ...r, Status__c: 'Withdrawn', Resolved_At__c: resolvedAt });
  }
}
