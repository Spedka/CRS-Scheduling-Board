import { useState } from 'react';
import './NegotiationSheet.css';

interface NegotiationSheetProps {
  onClose: () => void;
}

function NegotiationSheet({ onClose }: NegotiationSheetProps) {
  const [action, setAction] = useState<'accept' | 'counter' | null>(null);
  const [counterDate, setCounterDate] = useState('2026-07-16');
  const [counterStart, setCounterStart] = useState('08:00');
  const [counterEnd, setCounterEnd] = useState('11:00');

  // Mock data from the negotiation context
  const jobName = 'J-1077 Atrium Health';
  const scope = 'Fire panel inspection, building C';
  const yourProposed = 'Tue Jul 14, 8:00 am';
  const officeCountered = 'Thu Jul 16, 8:00 am';

  const handleAccept = async () => {
    try {
      await fetch('/api/requests/r001/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      onClose();
    } catch (err) {
      console.error('Failed to accept:', err);
    }
  };

  const handleCounter = async () => {
    try {
      await fetch('/api/requests/r001/counter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: counterDate,
          start: counterStart,
          end: counterEnd,
        }),
      });
      onClose();
    } catch (err) {
      console.error('Failed to counter:', err);
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

  return (
    <div className="sheet nego-sheet">
      <div className="grab" />
      <h3>
        <span className="mono">{jobName.split(' ')[0]}</span> {jobName.split(' ').slice(1).join(' ')}
      </h3>
      <p className="sub">{scope}</p>

      <div className="offers">
        <div className="offer">
          <span className="k">You proposed</span>
          <span className="v">{yourProposed}</span>
        </div>
        <div className="offer">
          <span className="k">Office countered</span>
          <span className="v hot">{officeCountered}</span>
        </div>
        <div className="offer" style={{ border: 'none' }}>
          <span className="k">Waiting on</span>
          <span className="v">You, 4 hours</span>
        </div>
      </div>

      {action === null && (
        <>
          <button className="bigbtn" onClick={handleAccept}>
            Accept {officeCountered.split(', ')[0]}
          </button>
          <button
            className="bigbtn ghost"
            onClick={() => setAction('counter')}
            style={{ marginTop: '9px' }}
          >
            Offer another time
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
