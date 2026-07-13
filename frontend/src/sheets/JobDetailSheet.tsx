import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss';
import './JobDetailSheet.css';

interface TimePoint {
  hour: number;
  minute: number;
}

interface AssignedTech {
  techId: string;
  techName?: string;
  startTime: TimePoint;
  endTime: TimePoint;
}

interface DetailSlot {
  jobId?: string;
  jobName?: string;
  customerName?: string;
  scope?: string;
  city?: string;
  address?: string;
  dueDate?: string;
  techName?: string;
  assignedTechs?: AssignedTech[];
  startTime?: TimePoint;
  endTime?: TimePoint;
  status?: string;
  note?: string;
}

interface JobDetailSheetProps {
  slot: DetailSlot;
  date?: string;
  onClose: () => void;
  onRequest?: (jobId: string) => void;
}

const formatTime = (t: TimePoint) => `${t.hour}:${String(t.minute).padStart(2, '0')}`;

// date/dueDate are plain 'YYYY-MM-DD' strings -- parse as local time, not
// UTC, or the displayed date can drift by a day (see WeekStrip.tsx).
const formatDate = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

function JobDetailSheet({ slot, date, onClose, onRequest }: JobDetailSheetProps) {
  const { sheetRef, onTouchStart, onTouchMove, onTouchEnd } = useSwipeToDismiss<HTMLDivElement>(onClose);
  return (
    <div className="sheet job-detail-sheet" ref={sheetRef}>
      <div className="grab" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} />
      <h3>{slot.jobName || 'Time off'}</h3>
      {slot.customerName && <p className="sub">{slot.customerName}</p>}
      {slot.address && <p className="sub">{slot.address}</p>}

      <div className="detail-rows">
        {slot.scope && (
          <div className="detail-row">
            <span className="k">Scope</span>
            <span className="v">{slot.scope}</span>
          </div>
        )}
        {slot.city && (
          <div className="detail-row">
            <span className="k">City</span>
            <span className="v">{slot.city}</span>
          </div>
        )}
        {slot.dueDate && (
          <div className="detail-row">
            <span className="k">Due</span>
            <span className="v">{formatDate(slot.dueDate)}</span>
          </div>
        )}
        {slot.assignedTechs && slot.assignedTechs.length > 1 ? (
          <div className="detail-row assigned-group">
            <span className="k">Crew</span>
            <div className="v assigned-list">
              {slot.assignedTechs.map((t) => (
                <div key={t.techId} className="assigned-person">
                  <span>{t.techName}</span>
                  <span className="assigned-time">{formatTime(t.startTime)} – {formatTime(t.endTime)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : slot.techName && (
          <div className="detail-row">
            <span className="k">Assigned to</span>
            <span className="v">{slot.techName}</span>
          </div>
        )}
        {date && (
          <div className="detail-row">
            <span className="k">Date</span>
            <span className="v">{formatDate(date)}</span>
          </div>
        )}
        {slot.startTime && slot.endTime && (
          <div className="detail-row">
            <span className="k">Time</span>
            <span className="v">{formatTime(slot.startTime)} – {formatTime(slot.endTime)}</span>
          </div>
        )}
        {slot.status && (
          <div className="detail-row">
            <span className="k">Status</span>
            <span className="v status-chip">{slot.status}</span>
          </div>
        )}
        {slot.note && (
          <div className="detail-row">
            <span className="k">Note</span>
            <span className="v">{slot.note}</span>
          </div>
        )}
      </div>

      <div className="detail-actions">
        {onRequest && slot.jobId && (
          <button className="bigbtn" onClick={() => onRequest(slot.jobId!)}>Request</button>
        )}
        <button className="bigbtn ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export default JobDetailSheet;