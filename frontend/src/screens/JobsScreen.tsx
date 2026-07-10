import { useState, useEffect } from 'react';
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

function JobsScreen({ onSelect, onViewDetail }: JobsScreenProps) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [sort] = useState('due');

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const params = new URLSearchParams();
        if (query) params.append('query', query);
        params.append('sort', sort);

        const res = await api(`/api/jobs?${params}`);
        const data = await res.json();
        setJobs(data.jobs);
      } catch (err) {
        console.error('Failed to fetch jobs:', err);
      }
    };

    fetchJobs();
  }, [query, sort]);

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
      </div>
    </div>
  );
}

export default JobsScreen;
