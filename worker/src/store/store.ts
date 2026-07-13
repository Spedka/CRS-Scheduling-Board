// Data layer for the chalkboard Worker.
// The frontend contract (shapes below) was extracted from the existing React
// components. The MockStore implements it in memory so the app runs end to end
// today. SalesforceStore (salesforce.ts) implements the same interface against
// Schedule_Request__c / Job__c / Job_Assignment__c when ready. Nothing in the
// routes changes when you swap stores.

// ---------- shapes the frontend consumes (do not change casually) ----------

export interface TimePoint { hour: number; minute: number }

// BoardScreen / TimelineBoard
export interface BoardSlot {
  id: string;
  type: 'scheduled' | 'pending' | 'countered' | 'time-off';
  jobId?: string;
  jobName?: string;
  customerName?: string;
  scope?: string;
  city?: string;
  address?: string;
  dueDate?: string;
  techId: string;
  techName?: string;
  startTime: TimePoint;
  endTime: TimePoint;
  note?: string;
  status: string;
}
export interface BoardResponse {
  slots: BoardSlot[];
  countered?: { requestId: string; jobName: string; age: string };
}

// JobsScreen / ComposerSheet
export interface JobRow {
  Id: string;
  Name: string;            // J-1063
  Customer_Name__c: string;
  Scope__c: string;
  City__c: string;
  Address: string;         // formatted from the job's own address fields
  Due_Date__c: string;     // ISO date
  due_soon: boolean;       // due within 30 days, computed server-side
}

// RequestsScreen. Note: Job__c carries the human job name (J-1077), not an
// SF record Id. The Worker resolves Ids to names; the raw SF Id never
// reaches the frontend.
export interface RequestRow {
  Id: string;
  Type__c: 'Job' | 'Time off';
  Job__c: string | null;
  Tech__c: string;
  Requested_By__c: string;
  CreatedDate: string;
  Proposed_Date__c: string;
  Proposed_Start__c: string; // "8:00"
  Proposed_End__c: string;
  Status__c: 'Requested' | 'Countered' | 'Approved' | 'Expired' | 'Withdrawn' | 'Denied';
  Last_Offer_By__c: 'Tech' | 'Office';
  Note__c?: string;
  Office_Note__c?: string;
  Resolved_At__c?: string;
}

export interface CreateRequestInput {
  techId: string;          // from auth
  requestedBy: string;     // differs when Skip chalks someone else's board
  jobId?: string;
  type: 'Job' | 'Time off';
  date: string;
  start: string;
  end: string;
  note?: string;
}

// ---------- store interface ----------

export interface Store {
  verifyTech(name: string): Promise<boolean>;
  getBoard(date: string, techId: string, view: 'me' | 'crew'): Promise<BoardResponse>;
  // limit/offset are optional so existing callers (the composer's own job
  // picker) that just want one reasonable batch keep working unchanged;
  // JobsScreen's infinite scroll is the only caller that pages through them.
  getJobs(query?: string, area?: string, limit?: number, offset?: number): Promise<JobRow[]>;
  getMyRequests(techId: string): Promise<RequestRow[]>;
  createRequest(input: CreateRequestInput): Promise<RequestRow>;
  acceptOffer(requestId: string, actor: 'Tech' | 'Office', actorTechId?: string): Promise<RequestRow>;
  counterOffer(requestId: string, actor: 'Tech' | 'Office', date: string, start: string, end: string, actorTechId?: string): Promise<RequestRow>;
  withdraw(requestId: string, techId: string): Promise<RequestRow>;
}

// ---------- helpers ----------

const toPoint = (t: string): TimePoint => {
  const [h, m] = t.split(':').map(Number);
  return { hour: h, minute: m || 0 };
};

const ageOf = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

const isoDaysFromNow = (d: number) =>
  new Date(Date.now() + d * 86_400_000).toISOString().split('T')[0];

// ---------- mock store ----------

interface Assignment {
  id: string; jobId: string; techId: string;
  date: string; start: string; end: string;
}

let seq = 100;
const nextId = (p: string) => `${p}${String(seq++).padStart(3, '0')}`;

// Sentinel job_id the frontend sends for the "New WO Required" pick --
// matches the one salesforce.ts recognizes. Mirrors that store's mechanism
// with a fixed in-memory placeholder job instead of a real Opportunity Id.
const NEW_WO_SENTINEL = 'NEW_WO_REQUIRED';

export class MockStore implements Store {
  users: Record<string, { name: string; initials: string; canWriteAnyBoard: boolean }> = {
    u001: { name: 'Leo',    initials: 'LS', canWriteAnyBoard: false },
    u002: { name: 'Marcus', initials: 'MJ', canWriteAnyBoard: false },
    u003: { name: 'Dre',    initials: 'DW', canWriteAnyBoard: false },
    u004: { name: 'Tony',   initials: 'TC', canWriteAnyBoard: false },
    u005: { name: 'Skip',   initials: 'SK', canWriteAnyBoard: true  },
  };

  jobs: (Omit<JobRow, 'due_soon'> & { status: string })[] = [
    { Id: 'j1', Name: 'J-1063', Customer_Name__c: 'Harris Teeter',   Scope__c: 'Sprinkler repair, ticket 4471', City__c: 'Matthews',  Address: '1801 Matthews Township Pkwy, Matthews, NC 28105',  Due_Date__c: isoDaysFromNow(14), status: 'Ready' },
    { Id: 'j2', Name: 'J-1082', Customer_Name__c: 'Ballantyne Corp', Scope__c: 'Annual inspection, bldg 4',     City__c: 'Charlotte', Address: '13429 Ballantyne Corporate Pl, Charlotte, NC 28277', Due_Date__c: isoDaysFromNow(38), status: 'Ready' },
    { Id: 'j3', Name: 'J-1071', Customer_Name__c: 'SouthPark Mall',  Scope__c: 'Alarm panel replacement',       City__c: 'Charlotte', Address: '4400 Sharon Rd, Charlotte, NC 28211',                Due_Date__c: isoDaysFromNow(56), status: 'Entered' },
    { Id: 'j4', Name: 'J-1077', Customer_Name__c: 'Atrium Health',   Scope__c: 'Fire panel inspection, bldg C', City__c: 'Charlotte', Address: '1000 Blythe Blvd, Charlotte, NC 28203',              Due_Date__c: isoDaysFromNow(9),  status: 'Ready' },
    { Id: 'j5', Name: 'J-1090', Customer_Name__c: 'Raleigh Medical', Scope__c: 'Quarterly inspection',          City__c: 'Raleigh',   Address: '3480 Wake Forest Rd, Raleigh, NC 27609',             Due_Date__c: isoDaysFromNow(21), status: 'Ready' },
  ];

  // Mirrored schedule. In production this comes from the crs-dispatch service
  // binding, read-only by construction. The mock seeds a couple of entries.
  assignments: Assignment[] = [
    { id: nextId('a'), jobId: 'j2', techId: 'u001', date: isoDaysFromNow(0), start: '13:00', end: '16:00' },
    { id: nextId('a'), jobId: 'j5', techId: 'u002', date: isoDaysFromNow(0), start: '8:00',  end: '12:00' },
  ];

  requests: (RequestRow & { JobId?: string })[] = [
    {
      Id: nextId('r'), Type__c: 'Job', JobId: 'j4', Job__c: 'J-1077',
      Tech__c: 'u001', Requested_By__c: 'u001',
      CreatedDate: new Date(Date.now() - 4 * 3_600_000).toISOString(),
      Proposed_Date__c: isoDaysFromNow(2), Proposed_Start__c: '8:00', Proposed_End__c: '12:00',
      Status__c: 'Countered', Last_Offer_By__c: 'Office',
      Note__c: 'Customer prefers mornings',
    },
    {
      Id: nextId('r'), Type__c: 'Job', JobId: 'j1', Job__c: 'J-1063',
      Tech__c: 'u001', Requested_By__c: 'u001',
      CreatedDate: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      Proposed_Date__c: isoDaysFromNow(0), Proposed_Start__c: '8:00', Proposed_End__c: '12:00',
      Status__c: 'Requested', Last_Offer_By__c: 'Tech',
    },
  ];

  // Hidden placeholders: never in `jobs`, so they never appear in getJobs()
  // results, but resolvable when a request explicitly targets them.
  private newWoJob = { Id: 'placeholder-new-wo', Name: 'New WO Required', Customer_Name__c: '', Scope__c: '', City__c: '', Address: '', Due_Date__c: '', status: 'Ready' };
  private timeOffJob = { Id: 'placeholder-time-off', Name: 'Time off', Customer_Name__c: '', Scope__c: '', City__c: '', Address: '', Due_Date__c: '', status: 'Ready' };

  private jobById(id?: string) {
    if (id === this.newWoJob.Id) return this.newWoJob;
    if (id === this.timeOffJob.Id) return this.timeOffJob;
    return this.jobs.find(j => j.Id === id);
  }

  // Mock trusts any identity, matching its zero-setup design -- no admin
  // list to keep in sync with SF's real Technician__c records.
  async verifyTech(_name: string): Promise<boolean> { return true; }

  private nameOf(techId: string): string { return this.users[techId]?.name ?? techId; }

  async getBoard(date: string, techId: string, view: 'me' | 'crew'): Promise<BoardResponse> {
    const slots: BoardSlot[] = [];

    for (const a of this.assignments.filter(a => a.date === date)) {
      const isTimeOff = a.jobId === this.timeOffJob.Id;
      const job = this.jobById(a.jobId);
      slots.push({
        id: a.id, type: isTimeOff ? 'time-off' : 'scheduled',
        jobId: isTimeOff ? undefined : a.jobId,
        jobName: isTimeOff ? 'Time off' : job ? job.Name : a.jobId,
        customerName: isTimeOff ? undefined : job?.Customer_Name__c,
        scope: isTimeOff ? undefined : job?.Scope__c,
        city: isTimeOff ? undefined : job?.City__c,
        address: isTimeOff ? undefined : job?.Address,
        dueDate: isTimeOff ? undefined : job?.Due_Date__c,
        techId: a.techId, techName: this.nameOf(a.techId),
        startTime: toPoint(a.start), endTime: toPoint(a.end),
        status: isTimeOff ? 'Off' : 'Scheduled',
      });
    }

    for (const r of this.requests) {
      if (r.Proposed_Date__c !== date) continue;
      if (r.Status__c === 'Withdrawn' || r.Status__c === 'Expired') continue;
      if (r.Status__c === 'Approved') continue; // approved = the resulting assignment covers it now, for both types
      const isTimeOff = r.Type__c === 'Time off';
      const job = this.jobById(r.JobId);
      slots.push({
        id: r.Id,
        type: isTimeOff ? 'time-off'
            : r.Status__c === 'Countered' ? 'countered' : 'pending',
        // JobId now points at the time-off placeholder from request
        // creation (so the office can see it pre-approval too), but the
        // frontend-facing slot keeps jobId undefined for time off so it
        // doesn't render a "Request" action against the placeholder itself.
        jobId: isTimeOff ? undefined : r.JobId,
        jobName: isTimeOff ? 'Time off' : job ? job.Name : r.Job__c ?? '',
        customerName: isTimeOff ? undefined : job?.Customer_Name__c,
        scope: isTimeOff ? undefined : job?.Scope__c,
        city: isTimeOff ? undefined : job?.City__c,
        address: isTimeOff ? undefined : job?.Address,
        dueDate: isTimeOff ? undefined : job?.Due_Date__c,
        techId: r.Tech__c, techName: this.nameOf(r.Tech__c),
        startTime: toPoint(r.Proposed_Start__c), endTime: toPoint(r.Proposed_End__c),
        note: r.Note__c,
        status: r.Status__c === 'Requested' ? 'Pending office'
              : r.Status__c === 'Countered' ? 'Reply needed'
              : r.Status__c,
      });
    }

    // The banner: oldest countered request where it is the tech's turn.
    const countered = this.requests
      .filter(r => r.Tech__c === techId && r.Status__c === 'Countered' && r.Last_Offer_By__c === 'Office')
      .sort((a, b) => a.CreatedDate.localeCompare(b.CreatedDate))[0];

    return {
      slots: view === 'me' ? slots.filter(s => s.techId === techId) : slots,
      countered: countered ? {
        requestId: countered.Id,
        jobName: this.jobById(countered.JobId)?.Name ?? countered.Job__c ?? 'Time off',
        age: ageOf(countered.CreatedDate),
      } : undefined,
    };
  }

  async getJobs(query?: string, area?: string, limit?: number, offset = 0): Promise<JobRow[]> {
    const q = query?.toLowerCase();
    const soon = Date.now() + 30 * 86_400_000;
    const matched = this.jobs
      .filter(j => !area || j.City__c === area)
      .filter(j => !q || j.Name.toLowerCase().includes(q)
        || j.Customer_Name__c.toLowerCase().includes(q)
        || j.City__c.toLowerCase().includes(q)
        || j.Address.toLowerCase().includes(q))
      .sort((a, b) => a.Due_Date__c.localeCompare(b.Due_Date__c));
    const page = limit != null ? matched.slice(offset, offset + limit) : matched;
    return page.map(({ status: _s, ...j }) => ({
      ...j, due_soon: new Date(j.Due_Date__c).getTime() < soon,
    }));
  }

  async getMyRequests(techId: string): Promise<RequestRow[]> {
    const withinLast7Days = (iso?: string) =>
      !!iso && Date.now() - new Date(iso).getTime() <= 7 * 86_400_000;
    return this.requests
      .filter(r => r.Tech__c === techId)
      // Mirrors the 7-day window SalesforceStore applies in SOQL. Expired
      // is not a stored status -- a still-open (Requested/Countered) row
      // with a past Proposed_Date__c stays visible here; the frontend
      // derives the "Expired" label itself from that date.
      .filter(r =>
        r.Status__c === 'Requested' || r.Status__c === 'Countered' ||
        (r.Status__c === 'Approved' && r.Proposed_Date__c >= isoDaysFromNow(-7)) ||
        ((r.Status__c === 'Denied' || r.Status__c === 'Withdrawn') && withinLast7Days(r.Resolved_At__c))
      )
      .sort((a, b) => b.CreatedDate.localeCompare(a.CreatedDate))
      .map(({ JobId: _j, ...r }) => r);
  }

  async createRequest(input: CreateRequestInput): Promise<RequestRow> {
    // Invariant 2: techs write only to their own board; Skip writes anywhere.
    if (input.techId !== input.requestedBy && !this.users[input.requestedBy]?.canWriteAnyBoard) {
      throw Object.assign(new Error('You can only chalk your own board'), { status: 403 });
    }
    // "New WO Required": job isn't in the system yet, attaches to a fixed
    // placeholder instead of a real job. The note is the only thing telling
    // the office what to open, so it's mandatory here specifically.
    let jobId = input.jobId;
    if (jobId === NEW_WO_SENTINEL) {
      if (!input.note?.trim()) {
        throw Object.assign(new Error('A note is required for a new WO request'), { status: 400 });
      }
      jobId = this.newWoJob.Id;
    }
    // Time off: same placeholder treatment as New WO, applied from request
    // creation rather than only at approval -- mirrors SalesforceStore.
    if (input.type === 'Time off') {
      jobId = this.timeOffJob.Id;
    }

    // Invariant 4: job requests carry a real job record from birth.
    const job = this.jobById(jobId);
    if (input.type === 'Job' && !job) {
      throw Object.assign(new Error('Unknown job'), { status: 400 });
    }
    const row: RequestRow & { JobId?: string } = {
      Id: nextId('r'),
      Type__c: input.type,
      JobId: job?.Id,
      Job__c: job?.Name ?? null,
      Tech__c: input.techId,
      Requested_By__c: input.requestedBy,
      CreatedDate: new Date().toISOString(),
      Proposed_Date__c: input.date,
      Proposed_Start__c: input.start,
      Proposed_End__c: input.end,
      Status__c: 'Requested',
      Last_Offer_By__c: 'Tech',
      Note__c: input.note,
    };
    this.requests.push(row);
    // Production: notify office here (immediate + 4pm digest backstop).
    const { JobId: _j, ...clean } = row;
    return clean;
  }

  private mustGet(id: string) {
    const r = this.requests.find(r => r.Id === id);
    if (!r) throw Object.assign(new Error('Request not found'), { status: 404 });
    return r;
  }

  async acceptOffer(id: string, actor: 'Tech' | 'Office', actorTechId?: string): Promise<RequestRow> {
    const r = this.mustGet(id);
    if (r.Status__c !== 'Requested' && r.Status__c !== 'Countered') {
      throw Object.assign(new Error(`Cannot accept a ${r.Status__c} request`), { status: 409 });
    }
    // You accept the OTHER side's offer: the turn pointer must not be yours.
    if (r.Last_Offer_By__c === actor) {
      throw Object.assign(new Error('The current offer is yours; the other side must accept'), { status: 409 });
    }
    if (actor === 'Tech' && r.Tech__c !== actorTechId) {
      throw Object.assign(new Error('Not your request'), { status: 403 });
    }
    r.Status__c = 'Approved';
    // Invariant 1: the assignment is born HERE and only here. Time off
    // attaches to the fixed placeholder job so it becomes a real assignment
    // (blocks the day on the board) same as any other approved request.
    const assignmentJobId = r.Type__c === 'Job' ? r.JobId
      : r.Type__c === 'Time off' ? this.timeOffJob.Id
      : undefined;
    if (assignmentJobId) {
      // MockStore only: SalesforceStore routes this through the DISPATCH
      // service binding instead (crs-dispatch's createAssignment, which
      // also handles the Field Squared push) -- there's no such binding to
      // call here, so the mock just inserts directly.
      this.assignments.push({
        id: nextId('a'), jobId: assignmentJobId, techId: r.Tech__c,
        date: r.Proposed_Date__c, start: r.Proposed_Start__c, end: r.Proposed_End__c,
      });
    }
    const { JobId: _j, ...clean } = r;
    return clean;
  }

  async counterOffer(id: string, actor: 'Tech' | 'Office', date: string, start: string, end: string, actorTechId?: string): Promise<RequestRow> {
    const r = this.mustGet(id);
    if (r.Status__c !== 'Requested' && r.Status__c !== 'Countered') {
      throw Object.assign(new Error(`Cannot counter a ${r.Status__c} request`), { status: 409 });
    }
    if (r.Last_Offer_By__c === actor) {
      throw Object.assign(new Error('It is not your turn; the current offer is yours'), { status: 409 });
    }
    if (actor === 'Tech' && r.Tech__c !== actorTechId) {
      throw Object.assign(new Error('Not your request'), { status: 403 });
    }
    // Volleyball: overwrite the live offer, flip the turn. History tracking
    // (SF field history in production) is the audit trail, not a thread.
    r.Proposed_Date__c = date;
    r.Proposed_Start__c = start;
    r.Proposed_End__c = end;
    r.Status__c = 'Countered';
    r.Last_Offer_By__c = actor;
    const { JobId: _j, ...clean } = r;
    return clean;
  }

  async withdraw(id: string, techId: string): Promise<RequestRow> {
    const r = this.mustGet(id);
    if (r.Tech__c !== techId) {
      throw Object.assign(new Error('Not your request'), { status: 403 });
    }
    if (r.Status__c !== 'Requested' && r.Status__c !== 'Countered') {
      throw Object.assign(new Error(`Cannot withdraw a ${r.Status__c} request`), { status: 409 });
    }
    r.Status__c = 'Withdrawn';
    r.Resolved_At__c = new Date().toISOString();
    const { JobId: _j, ...clean } = r;
    return clean;
  }
}
