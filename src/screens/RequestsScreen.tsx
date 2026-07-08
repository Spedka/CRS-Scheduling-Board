import { useState, useEffect } from 'react';
// @ts-ignore
import './RequestsScreen.css';

function RequestsScreen() {
  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const res = await fetch('/api/requests?mine=1');
        const data = await res.json();
        setRequests(data.requests);
      } catch (err) {
        console.error('Failed to fetch requests:', err);
      }
    };

    fetchRequests();
  }, []);

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
            <div className="sub">Everything you have chalked</div>
          </div>
          <div className="avatar">LS</div>
        </div>
      </div>

      <div className="reqs">
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
                <button className="linkbtn warn">Withdraw</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RequestsScreen;
