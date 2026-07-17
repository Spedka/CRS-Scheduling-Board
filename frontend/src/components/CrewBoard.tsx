import { useMemo, useState } from 'react';
import './CrewBoard.css';

interface TimeSlot { hour: number; minute: number }

interface BoardSlot {
  id: string;
  type: 'scheduled' | 'pending' | 'countered' | 'time-off';
  jobId?: string;
  jobName?: string;
  techId: string;
  techName?: string;
  startTime: TimeSlot;
  endTime: TimeSlot;
  note?: string;
  status: string;
}

interface CrewBoardProps {
  slots: BoardSlot[];
  onSlotSelect?: (slot: BoardSlot) => void;
}

const toMinutes = (t: TimeSlot) => t.hour * 60 + t.minute;
const fmtTime = (t: TimeSlot) => `${t.hour}:${String(t.minute).padStart(2, '0')}`;

const getSlotColor = (slot: BoardSlot) => {
  switch (slot.type) {
    case 'scheduled': return 'scheduled';
    case 'pending': return 'pending';
    case 'countered': return 'countered';
    case 'time-off': return 'time-off';
    default: return 'pending';
  }
};

// Crew view, reimagined: one card per tech instead of a shared timeline.
// The old approach (see TimelineBoard's assignLanes) had no concept of
// "tech" -- it just laned any overlapping slots together, and since untimed
// jobs mostly default to the same shop-standard ~7am start (a Salesforce
// data fact this app doesn't control), everyone routinely landed in one
// giant overlap cluster, squeezed into unreadably thin columns. Grouping by
// tech instead gives an at-a-glance "who's busy when" view (collapsed) with
// full detail a tap away (expanded), with no lane-packing at all.
function CrewBoard({ slots, onSlotSelect }: CrewBoardProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const byTech = useMemo(() => {
    const groups = new Map<string, { techId: string; techName: string; slots: BoardSlot[] }>();
    for (const slot of slots) {
      let g = groups.get(slot.techId);
      if (!g) {
        g = { techId: slot.techId, techName: slot.techName ?? slot.techId, slots: [] };
        groups.set(slot.techId, g);
      }
      g.slots.push(slot);
    }
    for (const g of groups.values()) {
      g.slots.sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
    }
    return [...groups.values()].sort((a, b) => a.techName.localeCompare(b.techName));
  }, [slots]);

  const toggle = (techId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(techId)) next.delete(techId);
      else next.add(techId);
      return next;
    });
  };

  if (byTech.length === 0) {
    return <div className="crew-empty">Nobody's on the board today</div>;
  }

  return (
    <div className="crew-board">
      {byTech.map((tech) => {
        const isOpen = expanded.has(tech.techId);
        const hasScheduled = tech.slots.some((s) => s.type === 'scheduled');
        const hasPending = tech.slots.some((s) => s.type === 'pending');
        const hasCountered = tech.slots.some((s) => s.type === 'countered');
        const first = tech.slots[0];
        const last = tech.slots[tech.slots.length - 1];

        return (
          <div key={tech.techId} className="crew-card">
            <button type="button" className="crew-card-head" onClick={() => toggle(tech.techId)}>
              <div className="crew-tech-name">{tech.techName}</div>
              <div className="crew-summary">
                <span className="crew-count">{tech.slots.length} job{tech.slots.length === 1 ? '' : 's'}</span>
                {first && last && (
                  <span className="crew-time-range">{fmtTime(first.startTime)}–{fmtTime(last.endTime)}</span>
                )}
                <div className="crew-dots">
                  {hasScheduled && <i className="dot-0" />}
                  {hasPending && <i className="dot-1" />}
                  {hasCountered && <i className="dot-2" />}
                </div>
              </div>
              <span className={`crew-chevron ${isOpen ? 'open' : ''}`}>›</span>
            </button>
            <div className={`crew-card-body-wrap ${isOpen ? 'open' : ''}`}>
              <div className="crew-card-body">
                {tech.slots.map((slot) => (
                  <button
                    type="button"
                    key={slot.id}
                    className={`crew-slot-row ${getSlotColor(slot)}`}
                    onClick={() => onSlotSelect?.(slot)}
                  >
                    <span className="crew-slot-time">{fmtTime(slot.startTime)}</span>
                    <span className="crew-slot-info">
                      <span className="crew-slot-job">{slot.type === 'time-off' ? 'Time off' : slot.jobName}</span>
                      {slot.note && <span className="crew-slot-note">{slot.note}</span>}
                    </span>
                    <span className="crew-slot-status">{slot.status}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CrewBoard;
