import { useState, useEffect } from 'react';
import WeekStrip from '../components/WeekStrip';
import TimelineBoard from '../components/TimelineBoard';
import { api } from '../api';
import { getTechName, initialsOf } from '../auth';
// @ts-ignore: Side-effect import of CSS file without type declarations
import './BoardScreen.css';

interface BoardScreenProps {
  date: string;
  onDateChange: (date: string) => void;
  refreshKey?: number;
  onComposerOpen: () => void;
  onNegotiationOpen: (request: any) => void;
  onSlotSelect: (slot: any) => void;
}

function BoardScreen({ date, onDateChange, refreshKey, onComposerOpen, onNegotiationOpen, onSlotSelect }: BoardScreenProps) {
  const [view, setView] = useState<'me' | 'crew'>('me');
  const [boardData, setBoardData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchBoard = async () => {
      setLoading(true);
      try {
        const res = await api(`/api/board?start=${date}&view=${view}`);
        const data = await res.json();
        setBoardData(data);
      } catch (err) {
        console.error('Failed to fetch board:', err);
      }
      setLoading(false);
    };

    fetchBoard();
  }, [date, view, refreshKey]);

  const handleDateChange = (newDate: string) => {
    onDateChange(newDate);
  };

  return (
    <div className="board-screen">
      {/* Header */}
      <div className="apphead">
        <div className="row1">
          <div className="head-text">
            <h1>Your schedule</h1>
            <div className="sub">
              {new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          </div>
          <div className="avatar">{initialsOf(getTechName())}</div>
        </div>
        <div className="action-row">
          <button className="plus-btn" onClick={onComposerOpen}>New Request</button>
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
          All Techs
        </button>
      </div>

      {/* Countered banner (if any) */}
      {boardData?.countered && (
        <div className="alert" onClick={() => onNegotiationOpen(boardData.countered)}>
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
          onSlotSelect={onSlotSelect}
        />
      )}

      {loading && <div className="loading">Loading...</div>}
    </div>
  );
}

export default BoardScreen;
