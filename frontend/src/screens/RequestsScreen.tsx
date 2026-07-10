import { useState, useEffect } from 'react';
// @ts-ignore
import './RequestsScreen.css';
import { api } from '../api';
import { getTechName, initialsOf } from '../auth';

interface RequestsScreenProps {
  onCountChange?: (count: number) => void;
}

// Needs a reply or is still waiting on the office -- not yet resolved.
export const isOpen = (status: string) => status === 'Requested' || status === 'Countered';

function RequestsScreen({ onCountChange }: RequestsScreenProps) {
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
  }, []);

  const handleWithdraw = async (id: string) => {
    try {
      await api(`/api/requests/${id}/withdraw`, { method: 'POST' });
      fetchRequests();
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
        {requests.map((req) => (
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
            <div className="foot">
              <span className={`st ${getStatusBadgeClass(req.Status__c)}`}>
                {getStatusLabel(req.Status__c)}
              </span>
              {req.Status__c === 'Countered' && (
                <button className="linkbtn">Respond</button>
              )}
              {req.Status__c === 'Requested' && (
                <button className="linkbtn warn" onClick={() => handleWithdraw(req.Id)}>
                  Withdraw
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RequestsScreen;
