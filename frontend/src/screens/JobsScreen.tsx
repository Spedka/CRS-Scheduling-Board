import { useState, useEffect, useRef, useCallback } from 'react';
// CSS module type declarations should live in a separate .d.ts file.
// Suppress TS here for the side-effect CSS import.
// @ts-ignore
import './JobsScreen.css';
import { api } from '../api';
import { getTechName, initialsOf } from '../auth';

interface JobsScreenProps {
  onSelect: (job: any) => void;
  onViewDetail: (job: any) => void;
}

const PAGE_SIZE = 25;

function JobsScreen({ onSelect, onViewDetail }: JobsScreenProps) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [sort] = useState('due');
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (offset: number, reset: boolean) => {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (query) params.append('query', query);
      params.append('sort', sort);
      params.append('limit', String(PAGE_SIZE));
      params.append('offset', String(offset));

      const res = await api(`/api/jobs?${params}`);
      const data = await res.json();
      setJobs((prev) => (reset ? data.jobs : [...prev, ...data.jobs]));
      setHasMore(data.jobs.length === PAGE_SIZE);
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [query, sort]);

  // New search/sort: start over from the first page.
  useEffect(() => {
    fetchPage(0, true);
  }, [fetchPage]);

  // Infinite scroll: load the next page once the sentinel at the bottom of
  // the list scrolls into view, same 25-at-a-time page the initial load
  // uses -- keeps the backlog fast to open instead of fetching everything
  // up front.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) {
        fetchPage(jobs.length, false);
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchPage, hasMore, loadingMore, jobs.length]);

  return (
    <div className="jobs-screen">
      <div className="apphead">
        <div className="row1">
          <div>
            <h1>Open jobs</h1>
            <div className="sub">Company backlog</div>
          </div>
          <div className="avatar">{initialsOf(getTechName())}</div>
        </div>
      </div>

      {/* Search */}
      <div className="search">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          placeholder="Search jobs..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Jobs list */}
      <div className="jobs">
        {jobs.map((job) => (
          <div key={job.Id} className="jobcard">
            <div className="info" onClick={() => onViewDetail(job)}>
              <span className="t">
                <span className="mono">{job.Name}</span>
              </span>
              <small>{[job.Customer_Name__c, job.Scope__c, job.City__c].filter(Boolean).join(' · ')}</small>
              {job.Due_Date__c && (
                <span className={`due ${job.due_soon ? 'hot' : ''}`}>
                  Due {new Date(job.Due_Date__c).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
            <button className="requestbtn" onClick={() => onSelect(job)}>
              Request
            </button>
          </div>
        ))}
        {hasMore && <div ref={sentinelRef} className="jobs-sentinel" />}
        {loadingMore && <div className="jobs-loading-more">Loading more…</div>}
      </div>
    </div>
  );
}

export default JobsScreen;
