import { useMemo } from 'react';
import './WeekStrip.css';

interface WeekStripProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
}

function WeekStrip({ selectedDate, onDateChange }: WeekStripProps) {
  const days = useMemo(() => {
    const today = new Date(selectedDate);
    const dayOfWeek = today.getDay();
    const diff = today.getDate() - dayOfWeek;
    const startOfWeek = new Date(today.setDate(diff));

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
      const dayNum = date.getDate();

      weekDays.push({
        dateStr,
        dayName,
        dayNum,
        isToday: dateStr === new Date().toISOString().split('T')[0],
      });
    }
    return weekDays;
  }, [selectedDate]);

  // Mock activity indicators (would come from actual data)
  const getActivityDots = (date: string) => {
    // Simple deterministic indicator based on date to avoid unused param
    const d = new Date(date);
    return d.getDate() % 3; // 0..2 dots
  };

  return (
    <div className="weekstrip">
      {days.map((day) => (
        <button
          key={day.dateStr}
          className={`day ${selectedDate === day.dateStr ? 'sel' : ''}`}
          onClick={() => onDateChange(day.dateStr)}
        >
          <small>{day.dayName}</small>
          <b>{day.dayNum}</b>
          <div className="dots">
            {Array.from({ length: getActivityDots(day.dateStr) }).map((_, i) => (
              <i key={i} className={`dot-${i % 3}`} />
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}

export default WeekStrip;
