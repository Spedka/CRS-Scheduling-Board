import { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api';
import './WeekStrip.css';

const SWIPE_THRESHOLD = 50; // px dragged horizontally before it counts as a week nav

interface WeekStripProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
}

interface DayActivity {
  scheduled: boolean;
  pending: boolean;
  countered: boolean;
}

// selectedDate is a plain 'YYYY-MM-DD' string. new Date(str) parses that as
// UTC midnight, but getDate()/getDay() read local time and toISOString()
// writes UTC time -- mixing those silently shifts the whole week by a day in
// any timezone behind UTC. Parse and format in local time throughout instead.
const parseLocalDate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const formatLocalDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function WeekStrip({ selectedDate, onDateChange }: WeekStripProps) {
  const days = useMemo(() => {
    const today = parseLocalDate(selectedDate);
    const dayOfWeek = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      const dateStr = formatLocalDate(date);
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
      const dayNum = date.getDate();

      weekDays.push({
        dateStr,
        dayName,
        dayNum,
        isToday: dateStr === formatLocalDate(new Date()),
      });
    }
    return weekDays;
  }, [selectedDate]);

  const [activity, setActivity] = useState<Record<string, DayActivity>>({});

  const weekStart = days[0]?.dateStr;

  // Shifts the whole strip by a week: the strip always re-derives its 7
  // days from selectedDate, so moving that by +/-7 keeps the same weekday
  // selected in the new week rather than snapping to its Sunday.
  const shiftWeek = (deltaDays: number) => {
    const d = parseLocalDate(selectedDate);
    d.setDate(d.getDate() + deltaDays);
    onDateChange(formatLocalDate(d));
  };

  // Swipe left/right to navigate weeks. Writes directly to the DOM node's
  // style during the drag (not React state) so it tracks the finger every
  // frame with no re-render lag, same approach as useSwipeToDismiss --
  // not reusing that hook since it's hardcoded vertical/single-outcome and
  // this is the only consumer of a horizontal two-outcome gesture.
  const stripRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const draggedX = useRef(0);
  const dragging = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    draggedX.current = 0;
    dragging.current = true;
    const el = stripRef.current;
    if (el) el.style.transition = 'none';
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const delta = e.touches[0].clientX - startX.current;
    draggedX.current = delta;
    const el = stripRef.current;
    if (el) el.style.transform = `translateX(${delta}px)`;
  };

  const onTouchEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const el = stripRef.current;
    if (el) {
      el.style.transition = 'transform 0.2s ease-out';
      el.style.transform = 'translateX(0)';
    }
    if (draggedX.current > SWIPE_THRESHOLD) shiftWeek(-7);
    else if (draggedX.current < -SWIPE_THRESHOLD) shiftWeek(7);
  };

  useEffect(() => {
    let cancelled = false;
    const weekEnd = days[6]?.dateStr;
    if (!weekStart || !weekEnd) return;

    const fetchWeekActivity = async () => {
      try {
        const res = await api(`/api/board/week?start=${weekStart}&end=${weekEnd}`);
        const data = await res.json();
        const dayEntries: { date: string; scheduled: boolean; pending: boolean; countered: boolean }[] = data.days ?? [];
        if (!cancelled) {
          setActivity(Object.fromEntries(dayEntries.map((d) => [d.date, d])));
        }
      } catch (err) {
        console.error('Failed to fetch week activity:', err);
      }
    };

    fetchWeekActivity();
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  return (
    <div className="weekstrip-row">
      <button
        type="button"
        className="week-nav"
        aria-label="Previous week"
        onClick={() => shiftWeek(-7)}
      >
        ‹
      </button>
      <div
        className="weekstrip"
        ref={stripRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {days.map((day) => {
          const dayActivity = activity[day.dateStr];
          return (
            <button
              key={day.dateStr}
              className={`day ${selectedDate === day.dateStr ? 'sel' : ''}`}
              onClick={() => onDateChange(day.dateStr)}
            >
              <small>{day.dayName}</small>
              <b>{day.dayNum}</b>
              <div className="dots">
                {dayActivity?.scheduled && <i className="dot-0" />}
                {dayActivity?.pending && <i className="dot-1" />}
                {dayActivity?.countered && <i className="dot-2" />}
              </div>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="week-nav"
        aria-label="Next week"
        onClick={() => shiftWeek(7)}
      >
        ›
      </button>
    </div>
  );
}

export default WeekStrip;
