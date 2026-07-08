import { useState, useEffect } from 'react';
import './ComposerSheet.css';

interface ComposerSheetProps {
  onClose: () => void;
  selectedDate: string;
}

function ComposerSheet({ onClose, selectedDate }: ComposerSheetProps) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState('');
  const [date, setDate] = useState(selectedDate);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('12:00');
  const [note, setNote] = useState('');
  const [isTimeOff, setIsTimeOff] = useState(false);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const res = await fetch('/api/jobs');
        const data = await res.json();
        setJobs(data.jobs);
        if (data.jobs.length > 0) {
          setSelectedJob(data.jobs[0].Id);
        }
      } catch (err) {
        console.error('Failed to fetch jobs:', err);
      }
    };

    fetchJobs();
  }, []);

  const handleTimeStep = (field: string, direction: number) => {
    const time = field === 'start' ? startTime : endTime;
    const [h, m] = time.split(':').map(Number);
    let minutes = h * 60 + m + direction * 30;
    minutes = Math.max(5 * 60, Math.min(20 * 60, minutes));
    const newH = Math.floor(minutes / 60);
    const newM = minutes % 60;
    const newTime = `${newH}:${String(newM).padStart(2, '0')}`;
    if (field === 'start') {
      setStartTime(newTime);
    } else {
      setEndTime(newTime);
    }
  };

  const handleSubmit = async () => {
    const payload = {
      job_id: !isTimeOff ? selectedJob : undefined,
      type: isTimeOff ? 'Time off' : 'Job',
      date,
      start: startTime,
      end: endTime,
      note,
    };

    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        onClose();
      }
    } catch (err) {
      console.error('Failed to create request:', err);
    }
  };

  return (
    <div className="sheet composer-sheet">
      <div className="grab" />
      <h3>Chalk a job</h3>
      <p className="sub">Sends a request to the office. Not on the schedule until approved.</p>

      <div className="field">
        <label>What</label>
        <select
          value={isTimeOff ? 'time-off' : selectedJob}
          onChange={(e) => {
            if (e.target.value === 'time-off') {
              setIsTimeOff(true);
            } else {
              setIsTimeOff(false);
              setSelectedJob(e.target.value);
            }
          }}
        >
          {!isTimeOff && (
            <>
              {jobs.map((job) => (
                <option key={job.Id} value={job.Id}>
                  {job.Name} · {job.Customer_Name__c} · {job.Scope__c}
                </option>
              ))}
            </>
          )}
          <option value="time-off">Time off (no job)</option>
        </select>
      </div>

      <div className="field">
        <label>Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {!isTimeOff && (
        <div className="field">
          <label>Window</label>
          <div className="times">
            <div className="stepper">
              <button onClick={() => handleTimeStep('start', -1)}>−</button>
              <span>{startTime}</span>
              <button onClick={() => handleTimeStep('start', 1)}>+</button>
            </div>
            <div className="stepper">
              <button onClick={() => handleTimeStep('end', -1)}>−</button>
              <span>{endTime}</span>
              <button onClick={() => handleTimeStep('end', 1)}>+</button>
            </div>
          </div>
        </div>
      )}

      <div className="field">
        <label>Note for the office (optional)</label>
        <input
          type="text"
          placeholder="Customer prefers mornings"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <button className="bigbtn" onClick={handleSubmit}>
        Send request
      </button>
    </div>
  );
}

export default ComposerSheet;
