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
  const [devices, setDevices] = useState(null); // null until a scan is run
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
      setMessage('Failed to save the backup settings. Check the server.');
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
    setBusy('mount');
    setMessage('Mounting…');
    try {
      const res = await mountBackupDevice(devicePath);
      setMessage(`Backups will go to ${res.device.label} (mounted at ${res.mountpoint}).`);
      setDevices(null);
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

  return (
    <div className="glass-panel backup-card">
      <div className="section-header">
        <h3 className="invoice-section-title">Backup</h3>
        <button className="btn btn-secondary btn-sm" onClick={scan} disabled={!!busy}>
          <RefreshCw size={16} /> {devices === null ? 'Scan USB drives' : 'Rescan'}
        </button>
      </div>
      <p className="section-desc">
        Copies the app's data (draft, history, password) into a BillSplitterBackups folder on a USB
        stick plugged into the Pi. Runs on the schedule below and always keeps the newest {cfg.keep}{' '}
        backups — the current one and {cfg.keep - 1} behind.
      </p>

      <p className="backup-device-state">
        {cfg.device ? (
          <>
            Drive: <strong>{cfg.device.label}</strong>
            {status.mounted
              ? ` — mounted at ${status.mounted}`
              : status.devicePresent
                ? ' — plugged in, will mount when backing up'
                : ' — not plugged in right now'}
          </>
        ) : (
          'No USB drive selected yet — scan and pick one below.'
        )}
      </p>

      {devices?.map((d) => (
        <button
          key={d.path}
          className="backup-device-option"
          onClick={() => pickDevice(d.path)}
          disabled={!!busy}
        >
          <HardDrive size={16} />
          {d.label} · {formatSize(d.sizeBytes)} · {d.fstype}
          {d.mountpoint ? ' · mounted' : ''}
        </button>
      ))}

      <div className="backup-schedule">
        <label className="remember-checkbox backup-enabled">
          <input
            type="checkbox"
            checked={!!cfg.enabled}
            onChange={(e) => saveConfig({ enabled: e.target.checked })}
          />
          <span>Automatic backups</span>
        </label>

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
              width="130px"
            />
          )}
          {cfg.frequency === 'monthly' && (
            <label className="backup-field">
              Day
              <input
                type="number"
                min="1"
                max="28"
                value={cfg.dayOfMonth}
                onChange={(e) => saveConfig({ dayOfMonth: Math.min(28, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
                aria-label="Day of the month to back up"
              />
            </label>
          )}
          <label className="backup-field">
            At
            <input
              type="time"
              value={cfg.time}
              onChange={(e) => e.target.value && saveConfig({ time: e.target.value })}
              aria-label="Time of day to back up"
            />
          </label>
          <label className="backup-field">
            Keep
            <input
              type="number"
              min="2"
              max="12"
              value={cfg.keep}
              onChange={(e) => saveConfig({ keep: Math.min(12, Math.max(2, parseInt(e.target.value, 10) || 2)) })}
              aria-label="How many backups to keep"
            />
          </label>
        </div>
      </div>

      <div className="backup-actions">
        <button className="btn btn-primary btn-sm" onClick={backupNow} disabled={!!busy || !cfg.device}>
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
