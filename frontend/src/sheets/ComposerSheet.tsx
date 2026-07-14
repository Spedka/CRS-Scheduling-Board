import { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api';
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss';
// @ts-ignore: CSS side-effect import declaration not available in this project setup
import './ComposerSheet.css';

// Sentinel job_id for "New WO Required" -- matches what both stores'
// createRequest recognize and swap for the real placeholder Opportunity.
const NEW_WO_SENTINEL = 'NEW_WO_REQUIRED';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const formatLocalDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface ComposerSheetProps {
  onClose: () => void;
  selectedDate: string;
  preselectedJob?: any;
  onCreated?: () => void;
  // 'timeOff' opens straight into the time-off flow with no job field at
  // all -- entered via its own button now, not a picker option.
  mode?: 'job' | 'timeOff';
}

function ComposerSheet({ onClose, selectedDate, preselectedJob, onCreated, mode = 'job' }: ComposerSheetProps) {
  const isTimeOffMode = mode === 'timeOff';
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState(preselectedJob?.Id ?? '');
  // Decoupled from `jobs`: the picker list is a server-filtered page (see
  // below) that can change or exclude the already-picked job entirely, but
  // the trigger label must keep showing whatever was actually selected.
  const [selectedJobDetails, setSelectedJobDetails] = useState<any>(preselectedJob ?? null);
  const [date, setDate] = useState(selectedDate);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('10:00');
  const [note, setNote] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const jobSearchInputRef = useRef<HTMLInputElement>(null);
  const { sheetRef: composerSheetRef, onTouchStart: composerTouchStart, onTouchMove: composerTouchMove, onTouchEnd: composerTouchEnd } =
    useSwipeToDismiss<HTMLDivElement>(onClose);
  const { sheetRef: jobPickerRef, onTouchStart: jobPickerTouchStart, onTouchMove: jobPickerTouchMove, onTouchEnd: jobPickerTouchEnd } =
    useSwipeToDismiss<HTMLDivElement>(() => {
      setPickerOpen(false);
      setJobSearch('');
    });
  const [jobSearch, setJobSearch] = useState('');
  const [timeManuallySet, setTimeManuallySet] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([selectedDate]);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const [y, m] = selectedDate.split('-').map(Number);
    return { year: y, month: m - 1 };
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Server-side search, same as the Jobs tab: the picker's own local list
  // used to be a single unfiltered fetch capped at 200 rows ordered
  // alphabetically, so anything past that page (including jobs already
  // visible on the board) silently never showed up no matter what you
  // typed. Querying the backend per keystroke instead means the search
  // covers the whole org, not just whatever the first page happened to be.
  useEffect(() => {
    if (isTimeOffMode) return;
    let cancelled = false;

    const fetchJobs = async () => {
      try {
        const params = new URLSearchParams();
        if (jobSearch.trim()) params.append('query', jobSearch.trim());
        const res = await api(`/api/jobs?${params}`);
        const data = await res.json();
        if (!cancelled) setJobs(data.jobs);
      } catch (err) {
        console.error('Failed to fetch jobs:', err);
      }
    };

    const debounce = setTimeout(fetchJobs, jobSearch ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [isTimeOffMode, jobSearch]);

  // autoFocus fires the instant the input mounts, which is mid-slide-up
  // (job-picker's own 0.3s animation) -- iOS calculates keyboard/viewport
  // repositioning based on the input's position at that exact moment, and
  // catching it mid-animation is what makes the sheet jump. Waiting for
  // the animation to finish first fixes it.
  useEffect(() => {
    if (!pickerOpen) return;
    const timer = setTimeout(() => {
      jobSearchInputRef.current?.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, [pickerOpen]);

  // Default the window to the tech's next open 2h gap, starting from the
  // selected date. If that day has nothing (starting no earlier than 8am,
  // ending no later than 4pm), roll forward day by day up to two weeks out
  // and land on the first day that does -- so they're not manually checking
  // their own board, possibly across several days, before every request.
  // Stops recomputing the moment they touch the steppers themselves, so a
  // later date change doesn't clobber a window they already picked.
  //
  // Time off mode skips this: with multiple, possibly non-contiguous days
  // selected via the calendar, "next open gap" doesn't cleanly generalize --
  // it just uses a plain default (or "All day") instead.
  useEffect(() => {
    if (timeManuallySet || isTimeOffMode) return;

    const MAX_DAYS_AHEAD = 14;

    const fetchDefaultWindow = async () => {
      try {
        const res = await api(`/api/board/gap?from=${date}&maxDays=${MAX_DAYS_AHEAD}`);
        const data = await res.json();
        const gap: { date: string; start: string; end: string } | null = data.gap ?? null;
        if (gap) {
          if (gap.date !== date) setDate(gap.date);
          setStartTime(gap.start);
          setEndTime(gap.end);
          return;
        }

        // Nothing open in the next two weeks -- leave the date alone and
        // fall back rather than searching indefinitely.
        setStartTime('08:00');
        setEndTime('10:00');
      } catch (err) {
        console.error('Failed to compute default window:', err);
        setStartTime('08:00');
        setEndTime('10:00');
      }
    };

    fetchDefaultWindow();
  }, [date, timeManuallySet, isTimeOffMode]);

  const isNewWoRequired = selectedJob === NEW_WO_SENTINEL;
  const pickerLabel = isNewWoRequired
    ? 'New WO Required'
    : selectedJobDetails
      ? `${selectedJobDetails.Name} · ${selectedJobDetails.Customer_Name__c} · ${selectedJobDetails.Scope__c}`
      : 'No Job Selected';
  const canSubmit = isTimeOffMode
    ? selectedDates.length > 0
    : !!selectedJob && (!isNewWoRequired || note.trim().length > 0);

  // Calendar grid for the selected month: null cells pad out to the first
  // weekday so days line up under the right column.
  const calendarCells = useMemo(() => {
    const { year, month } = calendarMonth;
    const startWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (string | null)[] = Array(startWeekday).fill(null);
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(formatLocalDate(new Date(year, month, day)));
    }
    return cells;
  }, [calendarMonth]);

  // Time off: tap toggles a day and the picker stays open for more taps.
  // Job: single-select, picking a day is the confirm action -- close right away.
  const handleDateCellClick = (dateStr: string) => {
    if (isTimeOffMode) {
      setSelectedDates((prev) =>
        prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr].sort()
      );
    } else {
      setDate(dateStr);
      setDatePickerOpen(false);
    }
  };

  const changeCalendarMonth = (delta: number) => {
    setCalendarMonth((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const formatDateLabel = (dateStr: string) =>
    new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const dateTriggerLabel = isTimeOffMode
    ? selectedDates.length === 0
      ? 'Select date(s)'
      : selectedDates.length === 1
        ? formatDateLabel(selectedDates[0])
        : `${selectedDates.length} days selected`
    : formatDateLabel(date);

  const closePicker = () => {
    setPickerOpen(false);
    setJobSearch('');
  };

  const handleAllDayToggle = (checked: boolean) => {
    setAllDay(checked);
    if (checked) {
      setTimeManuallySet(true);
      setStartTime('08:00');
      setEndTime('16:00');
    }
  };

  const handleTimeStep = (field: string, direction: number) => {
    setTimeManuallySet(true);
    const MIN_TIME = 5 * 60;
    const MAX_TIME = 20 * 60;
    const STEP = 30;
    const fmt = (mins: number) => `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;

    const time = field === 'start' ? startTime : endTime;
    const [h, m] = time.split(':').map(Number);
    const minutes = Math.max(MIN_TIME, Math.min(MAX_TIME, h * 60 + m + direction * STEP));

    const [oh, om] = (field === 'start' ? endTime : startTime).split(':').map(Number);
    let otherMinutes = oh * 60 + om;

    // Start can never reach or pass end (and vice versa). Rather than just
    // refusing the step, drag the other end of the window along so it
    // keeps a minimum 30min gap -- e.g. pushing start up to/past end bumps
    // end forward too instead of getting stuck.
    if (field === 'start' && minutes >= otherMinutes) {
      otherMinutes = Math.min(minutes + STEP, MAX_TIME);
      if (otherMinutes <= minutes) return; // no room left to maintain a gap
    }
    if (field === 'end' && minutes <= otherMinutes) {
      otherMinutes = Math.max(minutes - STEP, MIN_TIME);
      if (otherMinutes >= minutes) return; // no room left to maintain a gap
    }

    if (field === 'start') {
      setStartTime(fmt(minutes));
      setEndTime(fmt(otherMinutes));
    } else {
      setEndTime(fmt(minutes));
      setStartTime(fmt(otherMinutes));
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitError(null);

    if (isTimeOffMode) {
      // One Schedule_Request__c per selected day -- no date-range field in
      // the data model, and this reuses the exact same create/approve
      // pipeline per day rather than needing a new one.
      const results = await Promise.allSettled(
        selectedDates.map((d) =>
          api('/api/requests', {
            method: 'POST',
            body: JSON.stringify({ type: 'Time off', date: d, start: startTime, end: endTime, note }),
          }).then((res) => {
            if (!res.ok) throw new Error(d);
          })
        )
      );
      const failedDates = results
        .map((r, i) => (r.status === 'rejected' ? selectedDates[i] : null))
        .filter((d): d is string => d !== null);

      if (failedDates.length > 0) {
        setSubmitError(
          failedDates.length === selectedDates.length
            ? 'Failed to send. Nothing was requested.'
            : `Sent for ${selectedDates.length - failedDates.length} day(s); failed for ${failedDates.join(', ')}.`
        );
        if (failedDates.length < selectedDates.length) onCreated?.();
        return;
      }
      onCreated ? onCreated() : onClose();
      return;
    }

    const payload = {
      job_id: selectedJob,
      type: 'Job',
      date,
      start: startTime,
      end: endTime,
      note,
    };

    try {
      const res = await api('/api/requests', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        onCreated ? onCreated() : onClose();
      }
    } catch (err) {
      console.error('Failed to create request:', err);
    }
  };

  return (
    <div className="sheet composer-sheet" ref={composerSheetRef}>
      <div className="grab" onTouchStart={composerTouchStart} onTouchMove={composerTouchMove} onTouchEnd={composerTouchEnd} />
      <h3>{isTimeOffMode ? 'Request time off' : 'New request'}</h3>
      <p className="sub">Sends a request to the office. Not on the schedule until approved.</p>

      {!isTimeOffMode && (
        <div className="field">
          <label>Job</label>
          <button type="button" className="picker-trigger" onClick={() => setPickerOpen(true)}>
            <span className={`picker-trigger-text ${!isNewWoRequired && !selectedJobDetails ? 'placeholder' : ''}`}>
              {pickerLabel}
            </span>
            <span className="picker-chevron">▾</span>
          </button>
        </div>
      )}

      {pickerOpen && (
        <>
          <div className="scrim job-picker-scrim" onClick={closePicker} />
          <div className="job-picker" ref={jobPickerRef}>
            <div className="grab" onTouchStart={jobPickerTouchStart} onTouchMove={jobPickerTouchMove} onTouchEnd={jobPickerTouchEnd} />
            <div className="job-picker-search">
              <span className="search-icon">🔍</span>
              <input
                ref={jobSearchInputRef}
                type="text"
                placeholder="Search jobs..."
                value={jobSearch}
                onChange={(e) => setJobSearch(e.target.value)}
              />
            </div>
            <div className="job-picker-list">
              <button
                className={`job-picker-item ${isNewWoRequired ? 'sel' : ''}`}
                onClick={() => {
                  setSelectedJob(NEW_WO_SENTINEL);
                  closePicker();
                }}
              >
                New WO Required
              </button>
              {jobs.map((job) => (
                <button
                  key={job.Id}
                  className={`job-picker-item ${selectedJob === job.Id ? 'sel' : ''}`}
                  onClick={() => {
                    setSelectedJob(job.Id);
                    setSelectedJobDetails(job);
                    closePicker();
                  }}
                >
                  <span className="jp-name">{job.Name}</span>
                  <span className="jp-sub">{job.Customer_Name__c} · {job.Scope__c}</span>
                </button>
              ))}
              {jobs.length === 0 && (
                <div className="job-picker-empty">No jobs match "{jobSearch}"</div>
              )}
            </div>
          </div>
        </>
      )}

      <div className="field">
        <label>{isTimeOffMode ? 'Date(s)' : 'Date'}</label>
        <button type="button" className="picker-trigger" onClick={() => setDatePickerOpen(true)}>
          <span className={`picker-trigger-text ${isTimeOffMode && selectedDates.length === 0 ? 'placeholder' : ''}`}>
            {dateTriggerLabel}
          </span>
          <span className="picker-chevron">▾</span>
        </button>
      </div>

      {datePickerOpen && (
        <>
          <div className="scrim date-picker-scrim" onClick={() => setDatePickerOpen(false)} />
          <div className="date-picker">
            <div className="date-picker-header">
              <button type="button" onClick={() => changeCalendarMonth(-1)}>‹</button>
              <span>
                {new Date(calendarMonth.year, calendarMonth.month, 1).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
              <button type="button" onClick={() => changeCalendarMonth(1)}>›</button>
            </div>
            <div className="date-picker-weekdays">
              {WEEKDAY_LABELS.map((w, i) => <span key={i}>{w}</span>)}
            </div>
            <div className="date-picker-grid">
              {calendarCells.map((dateStr, i) =>
                dateStr ? (
                  <button
                    type="button"
                    key={dateStr}
                    className={`date-cell ${(isTimeOffMode ? selectedDates.includes(dateStr) : dateStr === date) ? 'sel' : ''}`}
                    onClick={() => handleDateCellClick(dateStr)}
                  >
                    {Number(dateStr.split('-')[2])}
                  </button>
                ) : (
                  <span key={`blank-${i}`} className="date-cell date-cell-blank" />
                )
              )}
            </div>
            {isTimeOffMode && (
              <div className="date-picker-footer">
                <span>{selectedDates.length} day{selectedDates.length === 1 ? '' : 's'} selected</span>
                <button type="button" className="bigbtn" onClick={() => setDatePickerOpen(false)}>
                  Done
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {isTimeOffMode && (
        <label className="field checkbox-field">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => handleAllDayToggle(e.target.checked)}
          />
          All day (8:00am – 4:00pm)
        </label>
      )}

      {!allDay && (
        <div className="field">
          <label>Window</label>
          <div className="times">
            <div className="stepper">
              <button onClick={() => handleTimeStep('start', -1)}>−</button>
              <span>{startTime}</span>
              <button onClick={() => handleTimeStep('start', 1)}>+</button>
            </div>
            <div className="stepper">
              <button onClick={() => handleTimeStep('end', -1)}>−</button>
              <span>{endTime}</span>
              <button onClick={() => handleTimeStep('end', 1)}>+</button>
            </div>
          </div>
        </div>
      )}

      <div className="field">
        <label>Note for the office{isNewWoRequired ? ' (required — what needs to be opened)' : ' (optional)'}</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {submitError && <div className="submit-error">{submitError}</div>}

      <button className="bigbtn" onClick={handleSubmit} disabled={!canSubmit}>
        Send request
      </button>
    </div>
  );
}

export default ComposerSheet;