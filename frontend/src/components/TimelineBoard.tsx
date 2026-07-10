import { useMemo, useRef, useEffect } from 'react';
import './TimelineBoard.css';

interface TimeSlot {
  hour: number;
  minute: number;
}

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

interface AssignedTech {
  id: string;
  techId: string;
  techName?: string;
  startTime: TimeSlot;
  endTime: TimeSlot;
}

// A rendered block: either one BoardSlot as-is, or several scheduled slots
// for the same job (different techs) merged into one, with the per-person
// breakdown kept in assignedTechs for the detail popup.
interface RenderSlot extends BoardSlot {
  assignedTechs?: AssignedTech[];
}

const toMinutes = (t: TimeSlot) => t.hour * 60 + t.minute;
const overlaps = (a: BoardSlot, b: BoardSlot) =>
  toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(b.startTime) < toMinutes(a.endTime);

// Crew view only: multiple techs scheduled on the same job (multiple
// Job_Assignment__c rows against one Opportunity) render as one block
// instead of competing lanes. Pending/countered/time-off slots always
// belong to exactly one person, so they never group.
const groupByJob = (slots: BoardSlot[], view: 'me' | 'crew'): RenderSlot[] => {
  if (view !== 'crew') return slots;

  const groups = new Map<string, BoardSlot[]>();
  const passthrough: RenderSlot[] = [];

  for (const slot of slots) {
    if (slot.type === 'scheduled' && slot.jobId) {
      const key = slot.jobId;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(slot);
    } else {
      passthrough.push(slot);
    }
  }

  const merged: RenderSlot[] = [];
  for (const [jobId, group] of groups) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }
    const start = group.reduce((min, s) => (toMinutes(s.startTime) < toMinutes(min) ? s.startTime : min), group[0].startTime);
    const end = group.reduce((max, s) => (toMinutes(s.endTime) > toMinutes(max) ? s.endTime : max), group[0].endTime);
    merged.push({
      ...group[0],
      id: `group:${jobId}`,
      startTime: start,
      endTime: end,
      techName: group.map((s) => s.techName).filter(Boolean).join(', '),
      assignedTechs: group.map((s) => ({
        id: s.id, techId: s.techId, techName: s.techName, startTime: s.startTime, endTime: s.endTime,
      })),
    });
  }

  return [...merged, ...passthrough];
};

// Side-by-side lane assignment for overlapping slots, same idea as a
// calendar day view: sweep by start time, merge transitively-overlapping
// slots into clusters, greedily pack each cluster into the fewest lanes.
interface LaneInfo { lane: number; lanes: number }
const assignLanes = (slots: BoardSlot[]): Map<string, LaneInfo> => {
  const layout = new Map<string, LaneInfo>();
  const sorted = [...slots].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

  let cluster: BoardSlot[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    const laneOf = new Map<string, number>();
    for (const slot of cluster) {
      const start = toMinutes(slot.startTime);
      let lane = laneEnds.findIndex((end) => end <= start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(toMinutes(slot.endTime));
      } else {
        laneEnds[lane] = toMinutes(slot.endTime);
      }
      laneOf.set(slot.id, lane);
    }
    const lanes = laneEnds.length;
    for (const slot of cluster) layout.set(slot.id, { lane: laneOf.get(slot.id)!, lanes });
  };

  for (const slot of sorted) {
    const start = toMinutes(slot.startTime);
    if (cluster.length === 0 || start < clusterEnd) {
      cluster.push(slot);
      clusterEnd = Math.max(clusterEnd, toMinutes(slot.endTime));
    } else {
      flush();
      cluster = [slot];
      clusterEnd = toMinutes(slot.endTime);
    }
  }
  flush();

  return layout;
};

interface TimelineBoardProps {
  slots: BoardSlot[];
  view: 'me' | 'crew';
  date: string;
  onSlotSelect?: (slot: BoardSlot) => void;
}

const START_HOUR = 3;
const END_HOUR = 22; // 10 PM
const TOTAL_HOURS = END_HOUR - START_HOUR;
const HOUR_HEIGHT = 60; // pixels
const DEFAULT_VISIBLE_HOUR = 6; // scrolled here on open, rest is a scroll away

function TimelineBoard(props: TimelineBoardProps) {
  const { slots, view, date, onSlotSelect } = props;
  const boardRef = useRef<HTMLDivElement>(null);

  // Open scrolled to 6am rather than the very top of the (wider) 3am-10pm
  // range -- everything's still there, just a scroll away in either
  // direction. Re-runs on date change so flipping days doesn't inherit
  // whatever scroll position was left on the previous day.
  useEffect(() => {
    boardRef.current?.scrollTo({ top: (DEFAULT_VISIBLE_HOUR - START_HOUR) * HOUR_HEIGHT });
  }, [date]);

  // Same-job scheduled slots for different techs merge into one block in
  // Crew view; everything else renders one slot per BoardSlot as before.
  const renderSlots = useMemo(() => groupByJob(slots, view), [slots, view]);

  // Side-by-side layout for any (post-merge) slots that overlap in time.
  const laneLayout = useMemo(() => assignLanes(renderSlots), [renderSlots]);

  // A conflict is two slots for the SAME technician overlapping in time --
  // an actual double-booking, not just two different people both busy then.
  // Computed on the raw slots (pre-merge) so a person's conflict still shows
  // even if one side of it got folded into a same-job group.
  //
  // Me view only: without a real end-time field on Job_Assignment__c in SF
  // mode, every job's displayed duration is a guessed 2h block from its
  // start time, so two of the same tech's genuinely sequential jobs in Crew
  // view routinely look like false-positive overlaps. Not worth flagging
  // until there's a real end time to compare.
  const conflictIds = useMemo(() => {
    const ids = new Set<string>();
    if (view !== 'me') return ids;
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i], b = slots[j];
        if (a.techId === b.techId && overlaps(a, b)) {
          ids.add(a.id);
          ids.add(b.id);
        }
      }
    }
    return ids;
  }, [slots, view]);

  const isSlotConflicted = (slot: RenderSlot) =>
    slot.assignedTechs
      ? slot.assignedTechs.some((t) => conflictIds.has(t.id))
      : conflictIds.has(slot.id);

  // Generate time axis
  const timeAxis = useMemo(() => {
    const times = [];
    for (let i = START_HOUR; i <= END_HOUR; i++) {
      const hour = i % 24;
      const ampm = hour < 12 ? 'am' : 'pm';
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      times.push({
        hour,
        display: `${displayHour}${ampm}`,
      });
    }
    return times;
  }, []);

  // Convert time to pixels from top
  const timeToPixels = (timeSlot: TimeSlot) => {
    const totalMinutes = timeSlot.hour * 60 + timeSlot.minute;
    const startMinutes = START_HOUR * 60;
    return (totalMinutes - startMinutes) * (HOUR_HEIGHT / 60);
  };

  // Get slot duration in pixels
  const getDurationPixels = (start: TimeSlot, end: TimeSlot) => {
    const startMinutes = start.hour * 60 + start.minute;
    const endMinutes = end.hour * 60 + end.minute;
    return (endMinutes - startMinutes) * (HOUR_HEIGHT / 60);
  };

  // Find gaps (available time) between slots
  const getAvailableSlots = () => {
    if (slots.length === 0) {
      return [
        {
          id: 'avail-all-day',
          start: { hour: START_HOUR, minute: 0 },
          end: { hour: END_HOUR, minute: 0 },
        },
      ];
    }

    const sorted = [...slots].sort(
      (a, b) => timeToPixels(a.startTime) - timeToPixels(b.startTime)
    );

    const available = [];

    // Before first slot
    if (sorted[0].startTime.hour > START_HOUR ||
        (sorted[0].startTime.hour === START_HOUR && sorted[0].startTime.minute > 0)) {
      available.push({
        id: 'avail-start',
        start: { hour: START_HOUR, minute: 0 },
        end: sorted[0].startTime,
      });
    }

    // Between slots
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = {
        id: `avail-gap-${i}`,
        start: sorted[i].endTime,
        end: sorted[i + 1].startTime,
      };
      available.push(gap);
    }

    // After last slot
    if (sorted[sorted.length - 1].endTime.hour < END_HOUR ||
        (sorted[sorted.length - 1].endTime.hour === END_HOUR && sorted[sorted.length - 1].endTime.minute > 0)) {
      available.push({
        id: 'avail-end',
        start: sorted[sorted.length - 1].endTime,
        end: { hour: END_HOUR, minute: 0 },
      });
    }

    return available;
  };

  // "Available" gaps mean "nothing on my board here" -- meaningful for a
  // single person's day, not a merged view of everyone's schedules.
  const availableSlots = view === 'me' ? getAvailableSlots() : [];

  const getSlotColor = (slot: BoardSlot) => {
    switch (slot.type) {
      case 'scheduled':
        return 'scheduled';
      case 'pending':
        return 'pending';
      case 'countered':
        return 'countered';
      case 'time-off':
        return 'time-off';
      default:
        return 'pending';
    }
  };

  return (
    <div className="timeline-board" ref={boardRef}>
      {/* Time axis */}
      <div className="time-axis" style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}>
        {timeAxis.map((time, idx) => (
          <div key={time.hour} className="time-marker" style={{ top: `${idx * HOUR_HEIGHT}px` }}>
            <span>{time.display}</span>
          </div>
        ))}
      </div>

      {/* Timeline area */}
      <div className="timeline-area">
        <div className="timeline-track" style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}>
          {/* Available slots (red) */}
          {availableSlots.map((avail) => (
            <div
              key={avail.id}
              className="slot available"
              style={{
                top: `${timeToPixels(avail.start)}px`,
                height: `${getDurationPixels(avail.start, avail.end)}px`,
              }}
            />
          ))}

          {/* Scheduled slots */}
          {renderSlots.map((slot) => {
            const color = getSlotColor(slot);
            const top = timeToPixels(slot.startTime);
            const height = getDurationPixels(slot.startTime, slot.endTime);
            const { lane, lanes } = laneLayout.get(slot.id) ?? { lane: 0, lanes: 1 };
            const isConflict = isSlotConflicted(slot);
            const gutter = lanes > 1 ? 3 : 0;

            return (
              <div
                key={slot.id}
                className={`slot ${color} ${isConflict ? 'conflict' : ''}`}
                style={{
                  top: `${top}px`,
                  height: `${height}px`,
                  left: `calc(${(lane / lanes) * 100}% + ${lane > 0 ? gutter : 0}px)`,
                  width: `calc(${100 / lanes}% - ${gutter}px)`,
                  cursor: onSlotSelect ? 'pointer' : undefined,
                }}
                onClick={() => onSlotSelect?.(slot)}
              >
                {isConflict && <div className="conflict-badge">⚠ Overlaps</div>}
                <div className="slot-content">
                  <div className="slot-time">
                    {slot.startTime.hour}:{String(slot.startTime.minute).padStart(2, '0')}
                  </div>
                  {slot.jobName && (
                    <div className="slot-job">
                      <div className="job-name">{slot.jobName}</div>
                      {slot.note && <div className="job-note">{slot.note}</div>}
                    </div>
                  )}
                  {slot.techName && <div className="slot-tech">{slot.techName}</div>}
                  <div className="slot-badge">{slot.status}</div>
                </div>
              </div>
            );
          })}

          {/* Hour grid lines */}
          {timeAxis.map((time, idx) => (
            <div
              key={`grid-${time.hour}`}
              className="grid-line"
              style={{
                top: `${idx * HOUR_HEIGHT}px`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default TimelineBoard;
