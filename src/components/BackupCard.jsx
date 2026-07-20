import React, { useEffect, useState } from 'react';
import { ArchiveRestore, ArrowUpFromLine, HardDrive, RefreshCw, Trash2 } from 'lucide-react';
import SelectMenu from './SelectMenu';
import { appAlert, appConfirm } from './Dialog';
import { getBackupStatus, getBackupDevices, mountBackupDevice, updateBackupConfig, runBackupNow, ejectBackupDevice, restoreBackup, deleteBackup } from '../api';

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

// Backup settings card (Server Status page): pick + mount a USB stick
// plugged into the Pi, choose the schedule, trigger a manual backup, and
// see what's on the stick. One backup covers all of FlatBrain — every
// app's data, the password and these settings — not any single app.
// Every control saves immediately, like the rest of the panel.
export default function BackupCard() {
  const [status, setStatus] = useState(null);
  const [devices, setDevices] = useState([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('backup');

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

  // Refresh the device list without touching the message line (used after
  // eject/selection so the dropdown reflects what's really plugged in).
  const rescanQuietly = () => getBackupDevices().then((r) => setDevices(r.devices)).catch(() => {});

  // Selecting a drive turns automatic backups on; picking "No backups"
  // clears the drive and turns them off.
  const pickDevice = async (devicePath) => {
    if (devicePath === (cfg?.device?.path || '')) return;
    setBusy('mount');
    setMessage(devicePath ? 'Mounting…' : 'Turning backups off…');
    try {
      if (devicePath) {
        const res = await mountBackupDevice(devicePath);
        setMessage(`Automatic backups on — backing up to ${res.device.label}.`);
      } else {
        await updateBackupConfig({ ...cfg, device: null });
        setMessage('Automatic backups off.');
      }
      await refresh();
    } catch {
      // e.g. the stick was unplugged between scanning and picking it
      setMessage(devicePath ? 'That drive is no longer available — rescan and try again.' : 'Failed to update the settings.');
      await rescanQuietly();
    } finally {
      setBusy('');
    }
  };

  const restore = async (name) => {
    if (!await appConfirm(`Restore ${name}? This replaces FlatBrain's current data — bill draft, history and password — with the backup.`, { title: 'Restore backup', okLabel: 'Restore', danger: true })) return;
    setBusy('restore');
    setMessage('Restoring…');
    try {
      const res = await restoreBackup(name);
      if (res.success) {
        await appAlert(`Restored ${res.restored.join(', ')} from ${name}. The app will now reload.`, { title: 'Backup restored' });
        window.location.reload();
      } else {
        setMessage(`Restore failed: ${res.error}`);
        setBusy('');
      }
    } catch {
      setMessage('Restore failed — check the server and the USB drive.');
      setBusy('');
    }
  };

  const removeBackup = async (name) => {
    if (!await appConfirm(`Delete ${name} from the USB stick? This can't be undone.`, { title: 'Delete backup', okLabel: 'Delete', danger: true })) return;
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

  // Ejecting also clears the selection (backups off); the quiet rescan
  // keeps the drive in the dropdown for a quick re-select if it stays in.
  const eject = async () => {
    setBusy('eject');
    setMessage('Ejecting…');
    try {
      const res = await ejectBackupDevice();
      setMessage(res.success ? res.message : `Eject failed: ${res.error}`);
      await refresh();
      if (res.success) await rescanQuietly();
    } catch {
      setMessage('Eject failed — check the server.');
    } finally {
      setBusy('');
    }
  };

  if (!cfg) return null;

  // The dropdown lists scanned drives plus the saved one; "No backups"
  // clears the selection, which is what disables the schedule.
  const driveOptions = [{ value: '', label: 'No backups' }];
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
      ? `Automatic backups on — mounted at ${status.mounted}.`
      : status.devicePresent
        ? 'Automatic backups on — mounts when backing up.'
        : 'Automatic backups on — not plugged in right now, retries every 30 min.'
    : 'Automatic backups off — pick a drive to turn them on.';

  return (
    <div className="glass-panel backup-card">
      <div className="extras-section-header">
        <h3 className="invoice-section-title">Backup</h3>
        <div className="backup-header-actions">
          <button className="btn btn-primary btn-sm" onClick={backupNow} disabled={!!busy || !cfg.device}>
            <HardDrive size={16} /> {busy === 'run' ? 'Backing up…' : 'Back up now'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={scan} disabled={!!busy}>
            <RefreshCw size={16} /> {busy === 'scan' ? 'Scanning…' : 'Scan USB drives'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={eject}
            disabled={!!busy || !status.mounted}
            title={status.mounted ? 'Unmount the stick so it is safe to unplug' : 'Drive is not mounted'}
          >
            <ArrowUpFromLine size={16} /> {busy === 'eject' ? 'Ejecting…' : 'Eject'}
          </button>
        </div>
      </div>
      <p className="section-desc">
        Copies all of FlatBrain's data — every app's files, the password and a bill-history CSV — to a USB stick on the schedule below. Keeps the newest {cfg.keep} backups.
      </p>

      <div className="backup-tabs" role="tablist">
        <button
          className={`backup-tab${tab === 'backup' ? ' active' : ''}`}
          onClick={() => setTab('backup')}
          role="tab"
          aria-selected={tab === 'backup'}
        >
          Back up
        </button>
        <button
          className={`backup-tab${tab === 'restore' ? ' active' : ''}`}
          onClick={() => setTab('restore')}
          role="tab"
          aria-selected={tab === 'restore'}
        >
          Restore
        </button>
      </div>

      <div className="form-group">
        <label>USB drive</label>
        <SelectMenu
          value={cfg.device?.path || ''}
          onChange={pickDevice}
          options={driveOptions}
          width="100%"
        />
        <p className="section-desc split-desc">{driveState}</p>
        {status.usage && (
          <div className="usb-meter" title="Space on the selected drive">
            <div className="usb-meter-track">
              <div
                className="usb-meter-fill"
                style={{ width: `${Math.min(100, Math.max(2, Math.round((status.usage.used / status.usage.total) * 100)))}%` }}
              />
            </div>
            <div className="usb-meter-label">
              {formatSize(status.usage.used)} used · {formatSize(status.usage.free)} free of {formatSize(status.usage.total)}
            </div>
          </div>
        )}
      </div>

      {tab === 'backup' && (
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
          <SelectMenu
            value={cfg.keep}
            onChange={(v) => saveConfig({ keep: v })}
            options={KEEP_OPTIONS}
            width="auto"
          />
        </div>
      </div>
      )}

      {tab === 'restore' && (
        <>
          <p className="section-desc">
            Restoring replaces FlatBrain's data — bill draft, history and password — with the backup's files, then reloads. The backup settings themselves are kept as they are now.
          </p>
          {status.backups?.length > 0 ? (
            <div className="backup-list">
              {status.backups.map((b) => (
                <div className="backup-item" key={b.name}>
                  <span>{b.name}</span>
                  <span className="backup-item-meta">
                    {b.files} file{b.files === 1 ? '' : 's'}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => restore(b.name)}
                      disabled={!!busy}
                      title="Replace the app's data with this backup"
                    >
                      <ArchiveRestore size={14} /> {busy === 'restore' ? 'Restoring…' : 'Restore'}
                    </button>
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
          ) : (
            <p className="section-desc">
              No backups found on the stick{status.mounted ? '.' : ' — it may not be mounted yet; Back up now mounts it.'}
            </p>
          )}
        </>
      )}

      {message && <p className="backup-message">{message}</p>}
      {tab === 'backup' && cfg.lastResult && (
        <p className="section-desc backup-last">
          {/* lastAttempt is stamped with every result, success or failure,
              so the date always belongs to the message shown */}
          Last: {cfg.lastResult}
          {cfg.lastAttempt ? ` — ${new Date(cfg.lastAttempt).toLocaleString('en-GB')}` : ''}
        </p>
      )}
    </div>
  );
}
