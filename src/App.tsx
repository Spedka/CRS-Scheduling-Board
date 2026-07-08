import { useState, useEffect } from 'react';
import BoardScreen from './screens/BoardScreen.tsx';
import JobsScreen from './screens/JobsScreen.tsx';
import RequestsScreen from './screens/RequestsScreen.tsx';
import ComposerSheet from './sheets/ComposerSheet.tsx';
import NegotiationSheet from './sheets/NegotiationSheet.tsx';
// @ts-ignore: CSS side-effect import without type declarations
import './App.css';

type Screen = 'board' | 'jobs' | 'requests';
type Sheet = 'composer' | 'negotiation' | null;

function App() {
  const [activeScreen, setActiveScreen] = useState<Screen>('board');
  const [activeSheet, setActiveSheet] = useState<Sheet>(null);
  const [userId] = useState('u001');
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  // Mock: set auth header for dev
  useEffect(() => {
    const headers = new Headers();
    headers.set('Authorization', `Bearer ${userId}`);
    (window as any).__authHeaders = headers;
  }, [userId]);

  return (
    <div className="app">
      <div className="screen-container">
        {activeScreen === 'board' && (
          <BoardScreen
            date={selectedDate}
            onDateChange={setSelectedDate}
            onComposerOpen={() => setActiveSheet('composer')}
            onNegotiationOpen={() => setActiveSheet('negotiation')}
          />
        )}
        {activeScreen === 'jobs' && <JobsScreen onSelect={() => setActiveSheet('composer')} />}
        {activeScreen === 'requests' && <RequestsScreen />}
      </div>

      {/* Scrim for sheets */}
      {activeSheet && (
        <div className="scrim" onClick={() => setActiveSheet(null)} />
      )}

      {/* Sheets */}
      {activeSheet === 'composer' && (
        <ComposerSheet onClose={() => setActiveSheet(null)} selectedDate={selectedDate} />
      )}
      {activeSheet === 'negotiation' && (
        <NegotiationSheet onClose={() => setActiveSheet(null)} />
      )}

      {/* Tab bar */}
      <div className="tabbar">
        <button
          className={`tab ${activeScreen === 'board' ? 'on' : ''}`}
          onClick={() => setActiveScreen('board')}
        >
          <span className="ic">🗓️</span>Board
        </button>
        <button
          className={`tab ${activeScreen === 'jobs' ? 'on' : ''}`}
          onClick={() => setActiveScreen('jobs')}
        >
          <span className="ic">🧰</span>Jobs
        </button>
        <button
          className={`tab ${activeScreen === 'requests' ? 'on' : ''}`}
          onClick={() => setActiveScreen('requests')}
        >
          <span className="badge">1</span>
          <span className="ic">✏️</span>Requests
        </button>
      </div>
    </div>
  );
}

export default App;
