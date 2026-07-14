import { useState, useEffect } from 'react';
// @ts-ignore
import './RequestsScreen.css';
import { api } from '../api';
import { getTechName, initialsOf } from '../auth';

interface RequestsScreenProps {
  refreshKey?: number;
  onCountChange?: (count: number) => void;
  onComposerOpen: () => void;
  onTimeOffOpen: () => void;
  onNegotiationOpen: (request: { requestId: string; jobName: string; age: string }, mode?: 'respond' | 'manage') => void;
}

// Needs a reply or is still waiting on the office -- not yet resolved.
export const isOpen = (status: string) => status === 'Requested' || status === 'Countered';

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

function RequestsScreen({ refreshKey, onCountChange, onComposerOpen, onTimeOffOpen, onNegotiationOpen }: RequestsScreenProps) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = async () => {
    try {
      const res = await api('/api/requests?mine=1');
      const data = await res.json();
      setRequests(data.requests);
      onCountChange?.(data.requests.filter((r: any) => isOpen(r.Status__c)).length);
    } catch (err) {
      console.error('Failed to fetch requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [refreshKey]);

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

      <div className="reqs">
        {!loading && requests.length === 0 && (
          <div className="empty">No current requests</div>
        )}
        {requests.map((req) => {
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
