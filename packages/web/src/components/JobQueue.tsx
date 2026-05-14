import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Clock, Check, AlertCircle } from 'lucide-react';

const API_URL = '/api/schedule-booking';

export type JobData = {
  phone: string;
  message: string;
  rawLine: string;
  conversationId: string;
};

export type JobQueueRef = {
  addJob: (job: JobData, onComplete?: () => void) => void;
};

export type JobQueueProps = {
  onChange?: (jobs: (JobData & { status: string })[]) => void;
};

export const JobQueue = forwardRef<JobQueueRef, JobQueueProps>((props, ref) => {
  const [jobs, setJobs] = useState<(JobData & { id: string; status: 'pending' | 'running' | 'completed' | 'failed'; error?: string; onComplete?: () => void })[]>([]);

  const updateJobs = (updater: typeof jobs | ((prev: typeof jobs) => typeof jobs)) => {
    setJobs(updater);
  };

  useEffect(() => {
    if (props.onChange) {
      props.onChange(jobs);
    }
  }, [jobs, props]);

  useImperativeHandle(ref, () => ({
    addJob: (job, onComplete) => {
      updateJobs(prev => [...prev, { ...job, id: Math.random().toString(36).substr(2, 9), status: 'pending', onComplete }]);
    }
  }));

  useEffect(() => {
    const processQueue = async () => {
      const runningJob = jobs.find(j => j.status === 'running');
      if (runningJob) return; // Wait for running job to finish

      const nextJob = jobs.find(j => j.status === 'pending');
      if (!nextJob) return;

      updateJobs(prev => prev.map(j => j.id === nextJob.id ? { ...j, status: 'running' } : j));

      try {
        const res = await fetch(`${API_URL}/run-flow`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inputs: {
              parameters: nextJob.phone,
              message: nextJob.message,
              phone: nextJob.phone
            }
          })
        });

        if (res.ok) {
          updateJobs(prev => prev.map(j => j.id === nextJob.id ? { ...j, status: 'completed' } : j));
          if (nextJob.onComplete) {
            setTimeout(() => {
              nextJob.onComplete!();
            }, 1500);
          }
        } else {
          const errText = await res.text();
          updateJobs(prev => prev.map(j => j.id === nextJob.id ? { ...j, status: 'failed', error: errText } : j));
        }
      } catch (err: any) {
        updateJobs(prev => prev.map(j => j.id === nextJob.id ? { ...j, status: 'failed', error: err.message } : j));
      }
    };

    processQueue();
  }, [jobs]);

  return (
    <div style={{ marginTop: 30, border: '1px solid #333', borderRadius: 8, backgroundColor: 'var(--bg-panel)', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
        <h3 style={{ margin: 0, color: '#e2e8f0' }}>Automation Job Queue</h3>
        <button 
          onClick={() => setJobs(prev => prev.filter(j => j.status === 'pending' || j.status === 'running'))}
          style={{ backgroundColor: 'transparent', border: '1px solid #333', color: '#aaa', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
          disabled={jobs.length === 0}
        >
          Clear Completed
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {jobs.length === 0 ? (
          <div style={{ padding: 15, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
            No jobs in queue. Send a message to start automation.
          </div>
        ) : (
          jobs.map(job => (
            <div key={job.id} style={{ display: 'flex', alignItems: 'center', padding: 12, backgroundColor: '#1e293b', borderRadius: 6, borderLeft: `4px solid ${job.status === 'completed' ? '#10b981' : job.status === 'failed' ? '#ef4444' : job.status === 'running' ? '#3b82f6' : '#64748b'}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>{job.phone}</div>
                <div style={{ fontSize: 13, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.message}</div>
                {job.error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{job.error}</div>}
              </div>
              <div style={{ width: 100, textAlign: 'right' }}>
                {job.status === 'pending' && <span style={{ color: '#64748b', fontSize: 13 }}>Pending...</span>}
                {job.status === 'running' && <span style={{ color: '#3b82f6', fontSize: 13 }}>Running... <Clock size={12} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} /></span>}
                {job.status === 'completed' && <span style={{ color: '#10b981', fontSize: 13 }}><Check size={14} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} /> Done</span>}
                {job.status === 'failed' && <span style={{ color: '#ef4444', fontSize: 13 }} title={job.error}><AlertCircle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} /> Failed</span>}
              </div>
            </div>
          ))
        )}
      </div>

      {/* FAILED LOGS WINDOW */}
      <div style={{ marginTop: 25, border: '1px solid #7f1d1d', borderRadius: 8, backgroundColor: 'rgba(239, 68, 68, 0.05)', padding: 15 }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={16} /> Persistent Execution Failures (Ghost Runs)
        </h4>
        <p style={{ fontSize: 12, color: '#fca5a5', marginTop: 0, marginBottom: 12 }}>
          The backend attempted to execute these payloads via AnyClick 3 times but the Quo API confirmed they were not visually sent. You must review these manually.
        </p>

        {jobs.filter(j => j.status === 'failed').length === 0 ? (
          <div style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic', padding: '10px 0' }}>
            No ghost runs detected. All automations passed API verification check.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {jobs.filter(j => j.status === 'failed').map(job => (
                <div key={`failed-${job.id}`} style={{ padding: 10, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 6, borderLeft: '3px solid #ef4444' }}>
                  <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{job.phone}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, whiteSpace: 'pre-wrap' }}>
                    {job.message}
                  </div>
                  <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 6 }}>
                    Raw Input: {job.rawLine}
                  </div>
                </div>
              ))}
            </div>
            <button 
               onClick={() => setJobs(prev => prev.filter(j => j.status !== 'failed'))}
               style={{ marginTop: 15, backgroundColor: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
            >
              Clear Error Logs
            </button>
          </>
        )}
      </div>
    </div>
  );
});
