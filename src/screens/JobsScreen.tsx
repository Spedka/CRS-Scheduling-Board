import { useState, useEffect } from 'react';
// CSS module type declarations should live in a separate .d.ts file.
// Suppress TS here for the side-effect CSS import.
// @ts-ignore
import './JobsScreen.css';

interface JobsScreenProps {
  onSelect: () => void;
}

function JobsScreen({ onSelect }: JobsScreenProps) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('');
  const [sort] = useState('due');

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const params = new URLSearchParams();
        if (query) params.append('query', query);
        if (area) params.append('area', area);
        params.append('sort', sort);

        const res = await fetch(`/api/jobs?${params}`);
        const data = await res.json();
        setJobs(data.jobs);
      } catch (err) {
        console.error('Failed to fetch jobs:', err);
      }
    };

    fetchJobs();
  }, [query, area, sort]);

  return (
    <div className="jobs-screen">
      <div className="apphead">
        <div className="row1">
          <div>
            <h1>Open jobs</h1>
            <div className="sub">Company backlog</div>
          </div>
          <div className="avatar">LS</div>
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

      {/* Filters */}
      <div className="frow">
        <button
          className={`fchip ${area === '' ? 'on' : ''}`}
          onClick={() => setArea('')}
        >
          All
        </button>
        <button
          className={`fchip ${area === 'Charlotte' ? 'on' : ''}`}
          onClick={() => setArea('Charlotte')}
        >
          Charlotte
        </button>
        <button
          className={`fchip ${area === 'Raleigh' ? 'on' : ''}`}
          onClick={() => setArea('Raleigh')}
        >
          Raleigh
        </button>
      </div>

      {/* Jobs list */}
      <div className="jobs">
        {jobs.map((job) => (
          <div key={job.Id} className="jobcard">
            <div className="info">
              <span className="t">
                <span className="mono">{job.Name}</span> {job.Customer_Name__c}
              </span>
              <small>{job.Scope__c} · {job.City__c}</small>
              <span className={`due ${job.due_soon ? 'hot' : ''}`}>
                Due {new Date(job.Due_Date__c).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
            <button className="chalkbtn" onClick={onSelect}>
              Chalk it
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default JobsScreen;
