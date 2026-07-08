import { useState, useEffect } from 'react';
import WeekStrip from '../components/WeekStrip';
import TimelineBoard from '../components/TimelineBoard';
import './BoardScreen.css';

interface BoardScreenProps {
  date: string;
  onDateChange: (date: string) => void;
  onComposerOpen: () => void;
  onNegotiationOpen: () => void;
}

function BoardScreen({ date, onDateChange, onComposerOpen, onNegotiationOpen }: BoardScreenProps) {
  const [view, setView] = useState<'me' | 'crew'>('me');
  const [boardData, setBoardData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchBoard = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/board?start=${date}`);
        const data = await res.json();
        setBoardData(data);
      } catch (err) {
        console.error('Failed to fetch board:', err);
      }
      setLoading(false);
    };

    fetchBoard();
  }, [date]);

  const handleDateChange = (newDate: string) => {
    onDateChange(newDate);
  };

  return (
    <div className="board-screen">
      {/* Header */}
      <div className="apphead">
        <div className="row1">
          <div>
            <h1>Your schedule</h1>
            <div className="sub">Monday, July 14</div>
          </div>
          <button className="plus-btn" onClick={onComposerOpen}>+</button>
          <div className="avatar">LS</div>
        </div>
      </div>

      {/* Week strip */}
      <WeekStrip selectedDate={date} onDateChange={handleDateChange} />

      {/* Me / Crew toggle */}
      <div className="seg">
        <button
          className={`seg-btn ${view === 'me' ? 'on' : ''}`}
          onClick={() => setView('me')}
        >
          Me
        </button>
        <button
          className={`seg-btn ${view === 'crew' ? 'on' : ''}`}
          onClick={() => setView('crew')}
        >
          Crew
        </button>
      </div>

      {/* Countered banner (if any) */}
      {boardData?.countered && (
        <div className="alert" onClick={onNegotiationOpen}>
          <div className="alert-content">
            <div className="tx">
              <b>{boardData.countered.jobName}</b>
              <br />
              Waiting on you, {boardData.countered.age}
            </div>
            <div className="chev">›</div>
          </div>
        </div>
      )}

      {/* Timeline board */}
      {boardData && !loading && (
        <TimelineBoard
          slots={boardData.slots}
          view={view}
          date={date}
        />
      )}

      {loading && <div className="loading">Loading...</div>}
    </div>
  );
}

export default BoardScreen;
