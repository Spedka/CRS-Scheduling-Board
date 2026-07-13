import { useState, useEffect } from 'react';
import { api } from '../api';
// @ts-ignore
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss';
// TypeScript may complain about side-effect CSS imports if no declaration is present.
// Suppress the error for this import here.
// @ts-ignore
import './NegotiationSheet.css';

interface CounteredRequest {
  requestId: string;
  jobName: string;
  age: string;
}

interface NegotiationSheetProps {
  request: CounteredRequest;
  onClose: () => void;
  onResolved: () => void;
}

const formatOffer = (date: string, start: string, end: string) =>
  `${new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })}, ${start} to ${end}`;

function NegotiationSheet({ request, onClose, onResolved }: NegotiationSheetProps) {
  const { sheetRef, onTouchStart, onTouchMove, onTouchEnd } = useSwipeToDismiss<HTMLDivElement>(onClose);
  const [action, setAction] = useState<'accept' | 'counter' | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [counterDate, setCounterDate] = useState('');
  const [counterStart, setCounterStart] = useState('08:00');
  const [counterEnd, setCounterEnd] = useState('12:00');

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const res = await api('/api/requests?mine=1');
        const data = await res.json();
        const req = data.requests.find((r: any) => r.Id === request.requestId);
        setDetail(req);
        if (req) {
          setCounterDate(req.Proposed_Date__c);
          setCounterStart(req.Proposed_Start__c);
          setCounterEnd(req.Proposed_End__c);
        }
      } catch (err) {
        console.error('Failed to fetch request detail:', err);
      }
    };

    fetchDetail();
  }, [request.requestId]);

  const handleAccept = async () => {
    try {
      await api(`/api/requests/${request.requestId}/accept`, { method: 'POST', body: JSON.stringify({}) });
      onResolved();
      onClose();
    } catch (err) {
      console.error('Failed to accept:', err);
    }
  };

  const handleCounter = async () => {
    try {
      await api(`/api/requests/${request.requestId}/counter`, {
        method: 'POST',
        body: JSON.stringify({ date: counterDate, start: counterStart, end: counterEnd }),
      });
      onResolved();
      onClose();
    } catch (err) {
      console.error('Failed to counter:', err);
    }
  };

  const handleWithdraw = async () => {
    try {
      await api(`/api/requests/${request.requestId}/withdraw`, { method: 'POST' });
      onResolved();
      onClose();
    } catch (err) {
      console.error('Failed to withdraw:', err);
    }
  };

  const handleCounterTimeStep = (field: string, direction: number) => {
    const time = field === 'start' ? counterStart : counterEnd;
    const [h, m] = time.split(':').map(Number);
    let minutes = h * 60 + m + direction * 30;
    minutes = Math.max(5 * 60, Math.min(20 * 60, minutes));
    const newH = Math.floor(minutes / 60);
    const newM = minutes % 60;
    const newTime = `${newH}:${String(newM).padStart(2, '0')}`;
    if (field === 'start') {
      setCounterStart(newTime);
    } else {
      setCounterEnd(newTime);
    }
  };

  const jobNumber = request.jobName.split(' ')[0];
  const jobRest = request.jobName.split(' ').slice(1).join(' ');
  const officeCountered = detail
    ? formatOffer(detail.Proposed_Date__c, detail.Proposed_Start__c, detail.Proposed_End__c)
    : '…';

  return (
    <div className="sheet nego-sheet" ref={sheetRef}>
      <div className="grab" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} />
      <h3>
        <span className="mono">{jobNumber}</span> {jobRest}
      </h3>
      {detail?.Note__c && <p className="sub">{detail.Note__c}</p>}
      {detail?.Office_Note__c && (
        <p className="office-note-nego">{detail.Office_Note__c}</p>
      )}

      <div className="offers">
        <div className="offer">
          <span className="k">Office countered</span>
          <span className="v hot">{officeCountered}</span>
        </div>
        <div className="offer" style={{ border: 'none' }}>
          <span className="k">Waiting on</span>
          <span className="v">You, {request.age}</span>
        </div>
      </div>

      {action === null && (
        <>
          <button className="bigbtn" onClick={handleAccept} disabled={!detail}>
            Accept {detail ? formatOffer(detail.Proposed_Date__c, detail.Proposed_Start__c, detail.Proposed_End__c).split(', ')[0] : ''}
          </button>
          <button
            className="bigbtn ghost"
            onClick={() => setAction('counter')}
            style={{ marginTop: '9px' }}
          >
            Offer another time
          </button>
          <button
            className="bigbtn ghost warn"
            onClick={handleWithdraw}
            style={{ marginTop: '9px' }}
          >
            Cancel request
          </button>
        </>
      )}

      {action === 'counter' && (
        <>
          <div className="field">
            <label>Your counter offer</label>
            <input
              type="date"
              value={counterDate}
              onChange={(e) => setCounterDate(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Time window</label>
            <div className="times">
              <div className="stepper">
                <button onClick={() => handleCounterTimeStep('start', -1)}>−</button>
                <span>{counterStart}</span>
                <button onClick={() => handleCounterTimeStep('start', 1)}>+</button>
              </div>
              <div className="stepper">
                <button onClick={() => handleCounterTimeStep('end', -1)}>−</button>
                <span>{counterEnd}</span>
                <button onClick={() => handleCounterTimeStep('end', 1)}>+</button>
              </div>
            </div>
          </div>

          <button className="bigbtn" onClick={handleCounter}>
            Send counter
          </button>
          <button
            className="bigbtn ghost"
            onClick={() => setAction(null)}
            style={{ marginTop: '9px' }}
          >
            Back
          </button>
        </>
      )}
    </div>
  );
}

export default NegotiationSheet;