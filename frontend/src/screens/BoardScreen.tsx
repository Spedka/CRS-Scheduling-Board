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
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchBoard = async () => {
      setLoading(true);
      try {
        const res = await api(`/api/board?start=${date}&view=${view}`);
        const data = await res.json();
        if (cancelled) return;
        setBoardData(data);
        setLoadError(false);
      } catch (err) {
        console.error('Failed to fetch board:', err);
        // Deliberately don't clear boardData here -- if we already had a
        // schedule loaded, keep showing it (stale but useful) rather than
        // blanking the screen on a transient failure.
        if (!cancelled) setLoadError(true);
      }
      if (!cancelled) setLoading(false);
    };

    fetchBoard();

    // The fetch above only runs once on mount/dependency change. Without
    // this, a tech who loses signal (or reopens the app after iOS silently
    // reloaded it while offline) is stuck forever -- nothing re-triggers a
    // fetch once connectivity actually comes back.
    const retryOnReconnect = () => fetchBoard();
    window.addEventListener('online', retryOnReconnect);

    return () => {
      cancelled = true;
      window.removeEventListener('online', retryOnReconnect);
    };
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

      {/* Offline / load failure banners -- never leave the tech looking at
          a silently blank screen with no explanation of what's happening. */}
      {loadError && boardData && (
        <div className="alert offline-alert">
          <div className="alert-content">
            <div className="tx">Showing your last loaded schedule. Will refresh automatically once you're back online.</div>
          </div>
        </div>
      )}
      {loadError && !boardData && !loading && (
        <div className="board-empty-state">
          <p>Couldn't load your schedule. Check your connection — this will retry automatically once you're back online.</p>
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