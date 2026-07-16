import { useState, useEffect } from 'react';
// @ts-ignore
import './RequestsScreen.css';
// @ts-ignore
import '../Skeleton.css';
import { api } from '../api';
import { getTechName, initialsOf } from '../auth';
import { isOpen } from '../requestStatus';

interface RequestsScreenProps {
  refreshKey?: number;
  onCountChange?: (count: number) => void;
  onComposerOpen: () => void;
  onTimeOffOpen: () => void;
  onNegotiationOpen: (request: { requestId: string; jobName: string; age: string }, mode?: 'respond' | 'manage') => void;
  // Ids accepted optimistically (see App.tsx's onAccepted) -- the real
  // accept is fire-and-forget from the negotiation sheet, so this is what
  // makes the row flip to "Approved" immediately instead of waiting for
  // the next server refetch to catch up.
  optimisticApprovals?: Set<string>;
}

// Matches the server's own age format (see store.ts's ageOf) -- there's no
// server-provided age for an arbitrary request in this list, only for the
// board's countered banner, so it's computed the same way here.
const ageOf = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

const today = () => new Date().toISOString().slice(0, 10);

function RequestsScreen({ refreshKey, onCountChange, onComposerOpen, onTimeOffOpen, onNegotiationOpen, optimisticApprovals }: RequestsScreenProps) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchRequests = async () => {
    try {
      const res = await api('/api/requests?mine=1');
      const data = await res.json();
      setRequests(data.requests);
      setLoadError(false);
    } catch (err) {
      console.error('Failed to fetch requests:', err);
      // Deliberately don't clear requests here -- if we already had a list
      // loaded, keep showing it (stale but useful) rather than blanking the
      // screen on a transient failure. Mirrors BoardScreen's same handling.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();

    // Without this, a tech who loses signal (or reopens the app after iOS
    // silently reloaded it while offline) is stuck forever -- nothing
    // re-triggers a fetch once connectivity actually comes back.
    window.addEventListener('online', fetchRequests);
    return () => window.removeEventListener('online', fetchRequests);
  }, [refreshKey]);

  // Merges in the optimistic override (if any) so the rest of a row --
  // badge, label, which action buttons show -- just reads Status__c /
  // Last_Offer_By__c normally without a special case.
  const withOptimisticStatus = (req: any) =>
    optimisticApprovals?.has(req.Id) ? { ...req, Status__c: 'Approved' as const } : req;

  // Recomputed (not just done inline in fetchRequests) so an optimistic
  // approval updates the tab badge immediately too, without waiting on the
  // next real fetch.
  useEffect(() => {
    onCountChange?.(requests.filter((r) => isOpen(withOptimisticStatus(r).Status__c)).length);
  }, [requests, optimisticApprovals]);

  // A "Countered" request is waiting on whichever side did NOT make the last
  // offer -- Last_Offer_By__c flips every counter (see store.ts's
  // counterOffer), so a tech-sent counter looks identical to an office-sent
  // one unless this is checked. Getting this wrong shows a "Respond" button
  // the backend would reject with "it is not your turn".
  const isTechsTurn = (req: any) => req.Last_Offer_By__c === 'Office';

  const getStatusBadgeClass = (req: any) => {
    switch (req.Status__c) {
      case 'Countered':
        return req.Last_Offer_By__c === 'Office' ? 'c' : 'p';
      case 'Requested':
        return 'p';
      case 'Approved':
        return 'a';
      case 'Withdrawn':
        return 'w';
      case 'Denied':
        return 'd';
      default:
        return 'p';
    }
  };

  const getStatusLabel = (req: any) => {
    switch (req.Status__c) {
      case 'Countered':
        return req.Last_Offer_By__c === 'Office' ? 'Waiting on you' : 'Waiting on office';
      case 'Requested':
        return 'Waiting on office';
      case 'Approved':
        return 'Approved';
      case 'Withdrawn':
        return 'Withdrawn';
      case 'Denied':
        return 'Denied';
      default:
        return req.Status__c;
    }
  };

  return (
    <div className="requests-screen">
      <div className="apphead">
        <div className="row1">
          <div className="head-text">
            <h1>My requests</h1>
            <div className="sub">Previous and current requests</div>
          </div>
          <button className="timeoff-btn" onClick={onTimeOffOpen}>New Time Off Request</button>
          <button className="plus-btn" onClick={onComposerOpen}>+</button>
          <div className="avatar">{initialsOf(getTechName())}</div>
        </div>
      </div>

      {/* Offline / load failure banners -- never leave the tech looking at
          a silently blank screen with no explanation of what's happening. */}
      {loadError && requests.length > 0 && (
        <div className="alert offline-alert">
          <div className="alert-content">
            <div className="tx">Showing your last loaded requests. Will refresh automatically once you're back online.</div>
          </div>
        </div>
      )}

      <div className="reqs">
        {loadError && requests.length === 0 && !loading && (
          <div className="requests-empty-state">
            Couldn't load your requests. Check your connection — this will retry automatically once you're back online.
          </div>
        )}
        {loading && [0, 1, 2].map((i) => (
          <div key={i} className="reqcard">
            <div className="top">
              <span className="skel-block" style={{ width: 90, height: 14 }} />
              <span className="skel-block" style={{ width: 50, height: 11 }} />
            </div>
            <div className="sub">
              <span className="skel-block" style={{ width: '70%', height: 13, display: 'inline-block' }} />
            </div>
            <div className="foot">
              <span className="skel-block" style={{ width: 76, height: 20, borderRadius: 6 }} />
            </div>
          </div>
        ))}
        {!loading && !loadError && requests.length === 0 && (
          <div className="empty">No current requests</div>
        )}
        {requests.map((rawReq) => {
          const req = withOptimisticStatus(rawReq);
          const jobName = req.Type__c === 'Time off' ? 'Time off' : req.Job__c ?? '';
          const isExpired = isOpen(req.Status__c) && req.Proposed_Date__c < today();
          return (
            <div key={req.Id} className="reqcard">
              <div className="top">
                <span>
                  {req.Type__c === 'Time off' ? (
                    'Time off'
                  ) : (
                    <>
                      <span className="mono">{req.Job__c}</span>
                    </>
                  )}
                </span>
                <span className="age">
                  {new Date(req.CreatedDate).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
              <div className="sub">
                {req.Proposed_Date__c}, {req.Proposed_Start__c} to {req.Proposed_End__c}
              </div>
              {req.Status__c === 'Denied' && req.Office_Note__c && (
                <p className="office-note">{req.Office_Note__c}</p>
              )}
              <div className="foot">
                <span className={`st ${isExpired ? 'w' : getStatusBadgeClass(req)}`}>
                  {isExpired ? 'Expired' : getStatusLabel(req)}
                </span>
                {req.Status__c === 'Countered' && isTechsTurn(req) && !isExpired && (
                  <button
                    className="linkbtn"
                    onClick={() => onNegotiationOpen({ requestId: req.Id, jobName, age: ageOf(req.CreatedDate) }, 'respond')}
                  >
                    Respond
                  </button>
                )}
                {isOpen(req.Status__c) && !isTechsTurn(req) && !isExpired && (
                  <button
                    className="linkbtn"
                    onClick={() => onNegotiationOpen({ requestId: req.Id, jobName, age: ageOf(req.CreatedDate) }, 'manage')}
                  >
                    Manage
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default RequestsScreen;
