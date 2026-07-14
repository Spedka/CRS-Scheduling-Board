import { useState, useEffect } from 'react';
import BoardScreen from './screens/BoardScreen.tsx';
import JobsScreen from './screens/JobsScreen.tsx';
import RequestsScreen, { isOpen } from './screens/RequestsScreen.tsx';
import ComposerSheet from './sheets/ComposerSheet.tsx';
import NegotiationSheet from './sheets/NegotiationSheet.tsx';
import JobDetailSheet from './sheets/JobDetailSheet.tsx';
import { getDeviceToken, redeemTokenFromUrl, redeemTokenFromPastedInput } from './auth';
import { api } from './api';
// @ts-ignore: CSS side-effect import without type declarations
import './App.css';

type Screen = 'board' | 'jobs' | 'requests';
type Sheet = 'composer' | 'negotiation' | 'jobDetail' | null;

function App() {
  const [activeScreen, setActiveScreen] = useState<Screen>('board');
  const [activeSheet, setActiveSheet] = useState<Sheet>(null);
  const [selectedDate, setSelectedDate] = useState(() => {
    // Local date, not toISOString() -- that reports the UTC calendar date,
    // which is a day ahead of "today" in the evening in US timezones.
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });
  const [composerJob, setComposerJob] = useState<any>(null);
  const [composerMode, setComposerMode] = useState<'job' | 'timeOff'>('job');
  const [negotiationRequest, setNegotiationRequest] = useState<any>(null);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [slotDetailDate, setSlotDetailDate] = useState<string | undefined>(undefined);
  const [refreshKey, bumpRefresh] = useState(0);
  const [requestCount, setRequestCount] = useState(0);
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [pastedLink, setPastedLink] = useState('');
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    redeemTokenFromUrl().then(() => {
      setAuthed(!!getDeviceToken());
      setAuthChecked(true);
    });
  }, []);

  // Sheets are position:fixed, but without this the underlying page can
  // still scroll -- and on mobile, focusing an input (e.g. autoFocus on
  // the job search box) makes the browser scroll the focused element into
  // view by scrolling the document, dragging the fixed sheet off-screen
  // along with it instead of just scrolling within the sheet itself.
  useEffect(() => {
    document.body.style.overflow = activeSheet ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [activeSheet]);

  // Independent of RequestsScreen's own fetch -- the tab badge has to be
  // right even before the user ever opens that tab.
  useEffect(() => {
    if (!authed) return;
    const fetchCount = async () => {
      try {
        const res = await api('/api/requests?mine=1');
        const data = await res.json();
        setRequestCount(data.requests.filter((r: any) => isOpen(r.Status__c)).length);
      } catch (err) {
        console.error('Failed to fetch request count:', err);
      }
    };
    fetchCount();
  }, [authed, refreshKey]);

  const handleRedeemPasted = async () => {
    setRedeemError(null);
    setRedeeming(true);
    const ok = await redeemTokenFromPastedInput(pastedLink);
    setRedeeming(false);
    if (ok) {
      setAuthed(true);
      setPastedLink('');
    } else {
      setRedeemError("That link didn't work. Ask the office to resend it.");
    }
  };

  const closeSheet = () => {
    setActiveSheet(null);
    setComposerJob(null);
    setNegotiationRequest(null);
    setSelectedSlot(null);
    setSlotDetailDate(undefined);
  };

  if (!authChecked) return null;

  if (!authed) {
    return (
      <div className="no-access">
        <h1>No access yet</h1>
        <p>Ask the office for your link, then paste it below to set up this device.</p>
        <div className="field" style={{ width: '100%', maxWidth: 320 }}>
          <input
            type="text"
            inputMode="url"
            placeholder="Paste your link here"
            value={pastedLink}
            onChange={(e) => setPastedLink(e.target.value)}
          />
        </div>
        {redeemError && <p style={{ color: 'var(--ctr-tx)' }}>{redeemError}</p>}
        <button
          className="bigbtn"
          disabled={!pastedLink.trim() || redeeming}
          onClick={handleRedeemPasted}
        >
          {redeeming ? 'Checking...' : 'Use this link'}
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <main className="screen-container">
        {activeScreen === 'board' && (
          <BoardScreen
            date={selectedDate}
            onDateChange={setSelectedDate}
            refreshKey={refreshKey}
            onComposerOpen={() => {
              setComposerMode('job');
              setActiveSheet('composer');
            }}
            onTimeOffOpen={() => {
              setComposerMode('timeOff');
              setActiveSheet('composer');
            }}
            onNegotiationOpen={(request) => {
              setNegotiationRequest(request);
              setActiveSheet('negotiation');
            }}
            onSlotSelect={(slot) => {
              setSelectedSlot(slot);
              setSlotDetailDate(selectedDate);
              setActiveSheet('jobDetail');
            }}
          />
        )}
        {activeScreen === 'jobs' && (
          <JobsScreen
            onSelect={(job) => {
              setComposerJob(job);
              setActiveSheet('composer');
            }}
            onComposerOpen={() => {
              setComposerMode('job');
              setActiveSheet('composer');
            }}
            onTimeOffOpen={() => {
              setComposerMode('timeOff');
              setActiveSheet('composer');
            }}
            onViewDetail={(job) => {
              setSelectedSlot({
                jobId: job.Id,
                jobName: job.Name,
                customerName: job.Customer_Name__c,
                scope: job.Scope__c,
                city: job.City__c,
                address: job.Address,
                dueDate: job.Due_Date__c,
              });
              setActiveSheet('jobDetail');
            }}
          />
        )}
        {activeScreen === 'requests' && (
          <RequestsScreen
            refreshKey={refreshKey}
            onCountChange={setRequestCount}
            onMutated={() => bumpRefresh((k) => k + 1)}
            onComposerOpen={() => {
              setComposerMode('job');
              setActiveSheet('composer');
            }}
            onTimeOffOpen={() => {
              setComposerMode('timeOff');
              setActiveSheet('composer');
            }}
            onNegotiationOpen={(request) => {
              setNegotiationRequest(request);
              setActiveSheet('negotiation');
            }}
          />
        )}
      </main>

      {/* Scrim for sheets */}
      {activeSheet && (
        <div className="scrim" onClick={closeSheet} />
      )}

      {/* Sheets */}
      {activeSheet === 'composer' && (
        <ComposerSheet
          onClose={closeSheet}
          selectedDate={selectedDate}
          preselectedJob={composerJob}
          mode={composerMode}
          onCreated={() => {
            bumpRefresh((k) => k + 1);
            closeSheet();
          }}
        />
      )}
      {activeSheet === 'negotiation' && negotiationRequest && (
        <NegotiationSheet
          request={negotiationRequest}
          onClose={closeSheet}
          onResolved={() => bumpRefresh((k) => k + 1)}
        />
      )}
      {activeSheet === 'jobDetail' && selectedSlot && (
        <JobDetailSheet
          slot={selectedSlot}
          date={slotDetailDate}
          onClose={closeSheet}
          onRequest={(jobId) => {
            setComposerJob({
              Id: jobId,
              Name: selectedSlot.jobName,
              Customer_Name__c: selectedSlot.customerName,
              Scope__c: selectedSlot.scope,
              City__c: selectedSlot.city,
              Address: selectedSlot.address,
              Due_Date__c: selectedSlot.dueDate,
            });
            setComposerMode('job');
            setSelectedSlot(null);
            setSlotDetailDate(undefined);
            setActiveSheet('composer');
          }}
        />
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
          {requestCount > 0 && <span className="badge">{requestCount}</span>}
          <span className="ic">✏️</span>Requests
        </button>
      </div>
    </div>
  );
}

export default App;