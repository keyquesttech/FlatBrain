import React, { useEffect, useState } from 'react';
import { Clock, RefreshCw, ScrollText, Trash2 } from 'lucide-react';
import Navigation from '../components/Navigation';
import CollapsibleCard from '../components/CollapsibleCard';
import SelectMenu from '../components/SelectMenu';
import { appConfirm, appToast } from '../components/Dialog';
import { clearLogs, getLogs, updateLogsConfig } from '../api';

const RETENTION_OPTIONS = [
  { value: 7, label: 'Keep 7 days' },
  { value: 30, label: 'Keep 30 days' },
  { value: 90, label: 'Keep 90 days' },
  { value: 365, label: 'Keep a year' }
];

const formatWhen = (t) =>
  new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Logs: the server's record of everything that happened — log-ins, saves,
// settings changes, backups and reboots. Read-only apart from retention
// and the clear button; the server writes the events itself.
export default function LogsPage() {
  const [logs, setLogs] = useState(null);
  const [appFilter, setAppFilter] = useState('');
  const [search, setSearch] = useState('');

  const refresh = () => getLogs().then(setLogs).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  if (!logs) return <div className="page-loading">Loading…</div>;

  const apps = [...new Set(logs.events.map((e) => e.app))].sort();
  const appOptions = [{ value: '', label: 'All apps' }, ...apps.map((a) => ({ value: a, label: a }))];
  const needle = search.trim().toLowerCase();
  const filtered = logs.events.filter((e) =>
    (!appFilter || e.app === appFilter) &&
    (!needle || `${e.action} ${e.detail || ''}`.toLowerCase().includes(needle))
  );

  const setRetention = async (days) => {
    try {
      const res = await updateLogsConfig({ retentionDays: days });
      setLogs((l) => ({ ...l, retentionDays: res.retentionDays }));
      refresh();
    } catch {
      appToast('Failed to save the retention setting.');
    }
  };

  const wipe = async () => {
    if (!await appConfirm('Clear the whole log? This can’t be undone.', { title: 'Clear log', okLabel: 'Clear', danger: true })) return;
    try {
      await clearLogs();
      refresh();
      appToast('Log cleared.');
    } catch {
      appToast('Failed to clear the log.');
    }
  };

  return (
    <div className="container container-narrow animate-fade-in">
      <Navigation showTabs={false} appLabel="Logs" />

      <div className="form-card-stack">
        <CollapsibleCard
          title={<span className="stat-title"><Clock size={15} /> Log settings</span>}
          storageKey="logs-settings"
          actions={(
            <button className="btn btn-danger btn-sm" onClick={wipe} disabled={logs.events.length === 0}>
              <Trash2 size={16} /> Clear log
            </button>
          )}
        >
          <p className="section-desc">
            Events older than the retention window are pruned automatically.
          </p>
          <div className="form-group">
            <label>Retention</label>
            <SelectMenu
              value={logs.retentionDays}
              onChange={setRetention}
              options={RETENTION_OPTIONS}
              width="auto"
            />
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          title={<span className="stat-title"><ScrollText size={15} /> Activity</span>}
          storageKey="logs-activity"
          actions={(
            <button className="btn btn-secondary btn-sm" onClick={refresh}>
              <RefreshCw size={16} /> Refresh
            </button>
          )}
        >
          <p className="section-desc">
            Newest first. Repeats of the same action within a few minutes show as one counted line.
          </p>
          <div className="log-filters">
            <div className="log-filter-app">
              <SelectMenu value={appFilter} onChange={setAppFilter} options={appOptions} width="100%" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the log…"
              aria-label="Search the log"
            />
          </div>

          {filtered.length === 0 && (
            <p className="section-desc">
              {logs.events.length === 0 ? 'Nothing logged yet — events appear as things happen.' : 'Nothing matches the filters.'}
            </p>
          )}
          <div className="log-list">
            {filtered.map((e, i) => (
              <div className="log-row" key={`${e.t}-${i}`}>
                <span className="log-time">{formatWhen(e.lastT || e.t)}</span>
                <span className="status-pill log-app">{e.app}</span>
                <span className="log-text">
                  {e.action}
                  {e.detail ? <span className="log-detail"> · {e.detail}</span> : null}
                  {e.count > 1 ? <span className="log-count"> ×{e.count}</span> : null}
                </span>
              </div>
            ))}
          </div>
        </CollapsibleCard>
      </div>
    </div>
  );
}
