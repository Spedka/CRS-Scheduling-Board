import { useMemo } from 'react';
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
  startTime: TimeSlot;
  endTime: TimeSlot;
  note?: string;
  status: string;
}

interface TimelineBoardProps {
  slots: BoardSlot[];
  view: 'me' | 'crew';
  date: string;
}

const START_HOUR = 5;
const END_HOUR = 19; // 7 PM
const TOTAL_HOURS = END_HOUR - START_HOUR;
const HOUR_HEIGHT = 60; // pixels

function TimelineBoard(props: TimelineBoardProps) {
  const { slots } = props;
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

  const availableSlots = getAvailableSlots();

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
    <div className="timeline-board">
      {/* Time axis */}
      <div className="time-axis">
        {timeAxis.map((time) => (
          <div key={time.hour} className="time-marker" style={{ height: `${HOUR_HEIGHT}px` }}>
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
          {slots.map((slot) => {
            const color = getSlotColor(slot);
            const top = timeToPixels(slot.startTime);
            const height = getDurationPixels(slot.startTime, slot.endTime);

            return (
              <div
                key={slot.id}
                className={`slot ${color}`}
                style={{
                  top: `${top}px`,
                  height: `${height}px`,
                }}
              >
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
