import { useState, useEffect } from 'react';
// @ts-ignore
import './RequestsScreen.css';
import { api } from '../api';
import { getTechName, initialsOf } from '../auth';

interface RequestsScreenProps {
  refreshKey?: number;
  onCountChange?: (count: number) => void;
  onNegotiationOpen: (request: { requestId: string; jobName: string; age: string }) => void;
  // Bumps App's shared refresh signal so a withdraw initiated from here is
  // also picked up by the board (and anything else keyed on it), not just
  // this screen's own list.
  onMutated?: () => void;
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

function RequestsScreen({ refreshKey, onCountChange, onNegotiationOpen, onMutated }: RequestsScreenProps) {
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

  const handleWithdraw = async (id: string) => {
    try {
      await api(`/api/requests/${id}/withdraw`, { method: 'POST' });
      fetchRequests();
      onMutated?.();
    } catch (err) {
      console.error('Failed to withdraw request:', err);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Countered':
        return 'c';
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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'Countered':
        return 'Countered';
      case 'Requested':
        return 'Pending office';
      case 'Approved':
        return 'Approved, on schedule';
      case 'Withdrawn':
        return 'Withdrawn';
      case 'Denied':
        return 'Denied';
      default:
        return status;
    }
  };

  return (
    <div className="requests-screen">
      <div className="apphead">
        <div className="row1">
          <div>
            <h1>My requests</h1>
            <div className="sub">Everything you have requested</div>
          </div>
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
                <span className={`st ${isExpired ? 'w' : getStatusBadgeClass(req.Status__c)}`}>
                  {isExpired ? 'Expired' : getStatusLabel(req.Status__c)}
                </span>
                {req.Status__c === 'Countered' && !isExpired && (
                  <button
                    className="linkbtn"
                    onClick={() => onNegotiationOpen({ requestId: req.Id, jobName, age: ageOf(req.CreatedDate) })}
                  >
                    Respond
                  </button>
                )}
                {req.Status__c === 'Requested' && !isExpired && (
                  <button className="linkbtn warn" onClick={() => handleWithdraw(req.Id)}>
                    Withdraw
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
