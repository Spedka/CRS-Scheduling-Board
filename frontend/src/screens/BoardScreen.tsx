import { useState, useEffect } from 'react';
import WeekStrip from '../components/WeekStrip';
import TimelineBoard from '../components/TimelineBoard';
import CrewBoard from '../components/CrewBoard';
import { api } from '../api';
import { getTechName, initialsOf } from '../auth';
// @ts-ignore
import './BoardScreen.css';
// @ts-ignore
import '../Skeleton.css';

interface BoardScreenProps {
  date: string;
  onDateChange: (date: string) => void;
  refreshKey?: number;
  onComposerOpen: () => void;
  onTimeOffOpen: () => void;
  onNegotiationOpen: (request: any) => void;
  onSlotSelect: (slot: any) => void;
}

function BoardScreen({ date, onDateChange, refreshKey, onComposerOpen, onTimeOffOpen, onNegotiationOpen, onSlotSelect }: BoardScreenProps) {
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
          <button className="timeoff-btn" onClick={onTimeOffOpen}>New Time Off Request</button>
          <button className="plus-btn" onClick={onComposerOpen}>+</button>
          <div className="avatar">{initialsOf(getTechName())}</div>
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
        view === 'crew' ? (
          <CrewBoard slots={boardData.slots} onSlotSelect={onSlotSelect} />
        ) : (
          <TimelineBoard
            slots={boardData.slots}
            view={view}
            date={date}
            onSlotSelect={onSlotSelect}
          />
        )
      )}

      {loading && (
        <div className="board-skeleton">
          <div className="skel-block" style={{ height: 64 }} />
          <div className="skel-block" style={{ height: 64 }} />
          <div className="skel-block" style={{ height: 64 }} />
        </div>
      )}
    </div>
  );
}

export default BoardScreen;
