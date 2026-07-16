import React, { useEffect, useState } from 'react';
import { HardDrive, RefreshCw, Trash2 } from 'lucide-react';
import SelectMenu from './SelectMenu';
import { getBackupStatus, getBackupDevices, mountBackupDevice, updateBackupConfig, runBackupNow, deleteBackup } from '../api';

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

// Day of the month for monthly backups (1–28 so it exists in every month)
const MONTH_DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `Day ${i + 1}` }));

const TIME_OPTIONS = Array.from({ length: 24 }, (_, h) => {
  const v = `${String(h).padStart(2, '0')}:00`;
  return { value: v, label: v };
});

const KEEP_OPTIONS = [2, 3, 4, 6, 8, 12].map((n) => ({ value: n, label: `Keep ${n}` }));

function formatSize(bytes) {
  if (!bytes) return '';
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / (1024 * 1024))} MB`;
}

// Backup settings card (history tab): pick + mount a USB stick plugged into
// the Pi, choose the schedule, trigger a manual backup, and see what's on
// the stick. Every control saves immediately, like the rest of the app.
export default function BackupCard() {
  const [status, setStatus] = useState(null);
  const [devices, setDevices] = useState([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const refresh = () => getBackupStatus().then(setStatus).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  const cfg = status?.config;

  const saveConfig = async (changes) => {
    try {
      const res = await updateBackupConfig({ ...cfg, ...changes });
      setStatus((s) => ({ ...s, config: res.config }));
    } catch {
      setMessage('Failed to save the backup settings.');
    }
  };

  const scan = async () => {
    setBusy('scan');
    setMessage('');
    try {
      const res = await getBackupDevices();
      setDevices(res.devices);
      if (res.devices.length === 0) setMessage('No USB drives found — plug one in and scan again.');
    } catch {
      setMessage('Failed to scan for USB drives.');
    } finally {
      setBusy('');
    }
  };

  const pickDevice = async (devicePath) => {
    if (!devicePath || devicePath === cfg?.device?.path) return;
    setBusy('mount');
    setMessage('Mounting…');
    try {
      const res = await mountBackupDevice(devicePath);
      setMessage(`Backups will go to ${res.device.label}.`);
      await refresh();
    } catch {
      setMessage('Failed to mount that drive. Is it formatted?');
    } finally {
      setBusy('');
    }
  };

  const removeBackup = async (name) => {
    if (!window.confirm(`Delete ${name} from the USB stick? This can't be undone.`)) return;
    setBusy('delete');
    try {
      const res = await deleteBackup(name);
      if (res.success) {
        setMessage(`Deleted ${name}.`);
        setStatus((s) => ({ ...s, backups: res.backups }));
      } else {
        setMessage(`Delete failed: ${res.error}`);
      }
    } catch {
      setMessage('Delete failed — check the server and the USB drive.');
    } finally {
      setBusy('');
    }
  };

  const backupNow = async () => {
    setBusy('run');
    setMessage('Backing up…');
    try {
      const res = await runBackupNow();
      setMessage(res.success ? 'Backup complete.' : `Backup failed: ${res.error}`);
      await refresh();
    } catch {
      setMessage('Backup failed — check the server and the USB drive.');
    } finally {
      setBusy('');
    }
  };

  if (!cfg) return null;

  // The dropdown lists scanned drives, always including the saved one.
  const driveOptions = [];
  if (!cfg.device && devices.length === 0) {
    driveOptions.push({ value: '', label: 'Scan for USB drives…' });
  }
  if (cfg.device && !devices.some((d) => d.path === cfg.device.path)) {
    driveOptions.push({ value: cfg.device.path, label: cfg.device.label });
  }
  for (const d of devices) {
    driveOptions.push({ value: d.path, label: `${d.label} · ${formatSize(d.sizeBytes)} · ${d.fstype}` });
  }
  // A time set before the dropdown existed (e.g. 06:30) stays selectable
  const timeOptions = TIME_OPTIONS.some((t) => t.value === cfg.time)
    ? TIME_OPTIONS
    : [{ value: cfg.time, label: cfg.time }, ...TIME_OPTIONS];

  const driveState = cfg.device
    ? status.mounted
      ? `Mounted at ${status.mounted}.`
      : status.devicePresent
        ? 'Plugged in — mounts when backing up.'
        : 'Not plugged in right now.'
    : 'No drive selected yet.';

  return (
    <div className="glass-panel backup-card">
      <div className="extras-section-header">
        <h3 className="invoice-section-title">Backup</h3>
        <button className="btn btn-primary btn-sm" onClick={scan} disabled={!!busy}>
          <RefreshCw size={16} /> {busy === 'scan' ? 'Scanning…' : 'Scan USB drives'}
        </button>
      </div>
      <p className="section-desc">
        Copies the app's data to a USB stick on the schedule below — keeps the newest {cfg.keep} backups.
      </p>

      <div className="form-group">
        <label>USB drive</label>
        <SelectMenu
          value={cfg.device?.path || ''}
          onChange={pickDevice}
          options={driveOptions}
          width="100%"
        />
        <p className="section-desc split-desc">{driveState}</p>
      </div>

      <div className="form-group">
        <label>Schedule</label>
        <div className="backup-schedule-controls">
          <SelectMenu
            value={cfg.frequency}
            onChange={(v) => saveConfig({ frequency: v })}
            options={FREQUENCY_OPTIONS}
            width="110px"
          />
          {cfg.frequency === 'weekly' && (
            <SelectMenu
              value={cfg.dayOfWeek}
              onChange={(v) => saveConfig({ dayOfWeek: v })}
              options={DAY_OPTIONS}
              width="132px"
            />
          )}
          {cfg.frequency === 'monthly' && (
            <SelectMenu
              value={cfg.dayOfMonth}
              onChange={(v) => saveConfig({ dayOfMonth: v })}
              options={MONTH_DAY_OPTIONS}
              width="104px"
            />
          )}
          <SelectMenu
            value={cfg.time}
            onChange={(v) => saveConfig({ time: v })}
            options={timeOptions}
            width="96px"
          />
          <SelectMenu
            value={cfg.keep}
            onChange={(v) => saveConfig({ keep: v })}
            options={KEEP_OPTIONS}
            width="104px"
          />
        </div>
        <label className="remember-checkbox backup-enabled">
          <input
            type="checkbox"
            checked={!!cfg.enabled}
            onChange={(e) => saveConfig({ enabled: e.target.checked })}
          />
          <span>Automatic backups</span>
        </label>
      </div>

      <div className="backup-actions">
        <button className="btn btn-secondary" onClick={backupNow} disabled={!!busy || !cfg.device}>
          <HardDrive size={16} /> {busy === 'run' ? 'Backing up…' : 'Back up now'}
        </button>
      </div>

      {message && <p className="backup-message">{message}</p>}
      {cfg.lastResult && (
        <p className="section-desc backup-last">
          Last: {cfg.lastResult}
          {cfg.lastSuccess ? ` — ${new Date(cfg.lastSuccess).toLocaleString('en-GB')}` : ''}
        </p>
      )}

      {status.backups?.length > 0 && (
        <div className="backup-list">
          {status.backups.map((b) => (
            <div className="backup-item" key={b.name}>
              <span>{b.name}</span>
              <span className="backup-item-meta">
                {b.files} file{b.files === 1 ? '' : 's'}
                <button
                  className="btn-icon btn-icon-danger"
                  onClick={() => removeBackup(b.name)}
                  disabled={!!busy}
                  title="Delete this backup from the stick"
                  aria-label={`Delete ${b.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
