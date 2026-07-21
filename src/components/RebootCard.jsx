import React, { useEffect, useState } from 'react';
import { Power } from 'lucide-react';
import CollapsibleCard from './CollapsibleCard';
import SelectMenu from './SelectMenu';
import { appConfirm } from './Dialog';
import { getRebootStatus, updateRebootConfig, rebootNow } from '../api';

const DAY_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' }
];

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' }
];

const MONTH_DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `Day ${i + 1}` }));

// Half-hour steps so the default 06:30 slot (after the 06:00 backup) exists
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const v = `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
  return { value: v, label: v };
});

// When the schedule will next fire, for the status pill.
function nextOccurrence(cfg) {
  const [h, m] = String(cfg.time || '06:30').split(':').map(Number);
  const now = new Date();
  const d = new Date(now);
  d.setHours(h || 0, m || 0, 0, 0);
  if (cfg.frequency === 'daily') {
    if (d <= now) d.setDate(d.getDate() + 1);
    return d;
  }
  if (cfg.frequency === 'monthly') {
    d.setDate(Math.min(Math.max(1, Number(cfg.dayOfMonth) || 1), 28));
    if (d <= now) d.setMonth(d.getMonth() + 1);
    return d;
  }
  const target = Number.isInteger(cfg.dayOfWeek) ? cfg.dayOfWeek : 0;
  while (d.getDay() !== target || d <= now) d.setDate(d.getDate() + 1);
  return d;
}

// Scheduled reboots for the Pi. The server deals with scheduled actions
// before going down — a due backup runs first (backups take priority) —
// so the default slot sits half an hour after the backup's.
export default function RebootCard() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    getRebootStatus().then(setStatus).catch(() => {});
  }, []);

  const cfg = status?.config;
  if (!cfg) return null;

  const saveConfig = async (changes) => {
    try {
      const res = await updateRebootConfig({ ...cfg, ...changes });
      setStatus((s) => ({ ...s, config: res.config }));
    } catch {
      setMessage('Failed to save the reboot settings.');
    }
  };

  const doRebootNow = async () => {
    if (!await appConfirm('Reboot the Pi now? FlatBrain will be unreachable for a minute or two. If a backup is due, it runs first.', { title: 'Reboot now', okLabel: 'Reboot', danger: true })) return;
    setBusy(true);
    setMessage('Rebooting — the page will stop responding until the Pi is back…');
    try {
      const res = await rebootNow();
      if (!res.success) {
        setMessage(`Reboot failed: ${res.error}`);
        setBusy(false);
      }
    } catch {
      setMessage('Reboot request failed — check the server.');
      setBusy(false);
    }
  };

  const next = nextOccurrence(cfg);
  const nextLabel = `${next.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} ${cfg.time}`;
  const lastOk = cfg.lastResult && !cfg.lastResult.includes('failed');

  // A time saved outside the half-hour grid stays selectable
  const timeOptions = TIME_OPTIONS.some((t) => t.value === cfg.time)
    ? TIME_OPTIONS
    : [{ value: cfg.time, label: cfg.time }, ...TIME_OPTIONS];

  return (
    <CollapsibleCard
      title="Reboots"
      storageKey="status-reboot"
      actions={(
        <div className="backup-header-actions">
          <button className="btn btn-primary btn-sm" onClick={doRebootNow} disabled={busy}>
            <Power size={16} /> {busy ? 'Rebooting…' : 'Reboot now'}
          </button>
        </div>
      )}
    >
      <p className="section-desc">
        Restarts the Pi on the schedule below. A due backup always runs first — backups take priority.
      </p>

      <div className="status-pills">
        <span className={`status-pill ${cfg.enabled ? 'status-pill-ok' : ''}`}>
          {cfg.enabled ? 'Scheduled reboots on' : 'Scheduled reboots off'}
        </span>
        {cfg.enabled && (
          <span className="status-pill" title="Next scheduled reboot">
            Next: {nextLabel}
          </span>
        )}
        {cfg.lastResult && (
          <span className={`status-pill ${lastOk ? 'status-pill-ok' : 'status-pill-warn'}`} title={cfg.lastResult}>
            Last: {cfg.lastAttempt ? new Date(cfg.lastAttempt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
          </span>
        )}
      </div>

      <div className="form-group">
        <label>Schedule</label>
        <div className="backup-schedule-controls">
          <SelectMenu
            value={cfg.frequency}
            onChange={(v) => saveConfig({ frequency: v })}
            options={FREQUENCY_OPTIONS}
            width="auto"
          />
          {cfg.frequency === 'weekly' && (
            <SelectMenu
              value={cfg.dayOfWeek}
              onChange={(v) => saveConfig({ dayOfWeek: v })}
              options={DAY_OPTIONS}
              width="auto"
            />
          )}
          {cfg.frequency === 'monthly' && (
            <SelectMenu
              value={cfg.dayOfMonth}
              onChange={(v) => saveConfig({ dayOfMonth: v })}
              options={MONTH_DAY_OPTIONS}
              width="auto"
            />
          )}
          <SelectMenu
            value={cfg.time}
            onChange={(v) => saveConfig({ time: v })}
            options={timeOptions}
            width="auto"
          />
        </div>
      </div>

      {message && <p className="backup-message">{message}</p>}
    </CollapsibleCard>
  );
}
