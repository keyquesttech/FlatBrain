// USB backup for the whole of FlatBrain: copies every data file the panel
// keeps (all apps' data, the password and the backup settings themselves)
// into a FlatBrainBackups folder on a USB stick, on a schedule (default:
// weekly, Saturday 06:00), keeping the newest N backups (default 2 —
// current + one behind). Configuration lives in the git-ignored
// backup-config.json next to the data files.
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { historyToCSV } from './src/utils/historyCsv.js';

// Everything that goes to the stick. backup-config.json rides along so the
// schedule survives an SD-card death, but it is NOT restored (see
// RESTORE_FILES): it records which stick is the current backup target, and
// an old copy could silently point automatic backups at a retired drive.
const DATA_FILES = ['draft.json', 'history.json', 'invoices.json', 'rent.json', 'password.txt', 'backup-config.json', 'reboot-config.json', 'temp-history.json'];
const RESTORE_FILES = ['draft.json', 'history.json', 'invoices.json', 'rent.json', 'password.txt'];
const BACKUP_DIR_NAME = 'FlatBrainBackups';
// Sticks used before the FlatBrain rename carry this folder; backupRoot
// renames it in place the first time it's seen.
const LEGACY_BACKUP_DIR_NAME = 'BillSplitterBackups';
const FALLBACK_MOUNTPOINT = '/media/flatbrain-backup';
const RETRY_MS = 30 * 60 * 1000; // a failed scheduled backup retries every 30 min

// Automatic backups are enabled by selecting a drive: device set = on,
// device null = off. There is no separate enabled flag.
export const DEFAULT_CONFIG = {
  frequency: 'weekly', // 'daily' | 'weekly' | 'monthly'
  dayOfWeek: 6, // 0 = Sunday … 6 = Saturday (weekly)
  dayOfMonth: 1, // 1–28 (monthly)
  time: '06:00',
  keep: 2, // backups to retain; at least current + previous
  device: null, // { uuid, label, path, fstype } picked on the Backup card
  lastSuccess: 0,
  lastAttempt: 0,
  lastResult: ''
};

export function createBackupManager(baseDir) {
  const configFile = path.join(baseDir, 'backup-config.json');

  function readConfig() {
    try {
      if (fs.existsSync(configFile)) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(configFile, 'utf8')) };
      }
    } catch (err) {
      console.error('Error reading backup config:', err);
    }
    return { ...DEFAULT_CONFIG };
  }

  function writeConfig(cfg) {
    const tmp = `${configFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
    fs.renameSync(tmp, configFile);
  }

  function run(cmd, args) {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout: 20000 });
  }

  // Removable/USB partitions (or unpartitioned sticks) carrying a
  // filesystem. Only these are offered and mountable — never system disks.
  function listUsbCandidates() {
    const out = run('lsblk', [
      '-J', '-b',
      '-o', 'NAME,PATH,SIZE,TYPE,MOUNTPOINT,LABEL,UUID,FSTYPE,RM,TRAN,MODEL'
    ]);
    const tree = JSON.parse(out).blockdevices || [];
    const found = [];
    for (const disk of tree) {
      if (disk.type !== 'disk' || !(disk.rm === true || disk.tran === 'usb')) continue;
      const nodes = disk.children?.length ? disk.children : [disk];
      for (const part of nodes) {
        if (!part.fstype || part.fstype === 'swap') continue;
        found.push({
          path: part.path,
          uuid: part.uuid || null,
          label: part.label || disk.model?.trim() || 'USB drive',
          sizeBytes: Number(part.size) || 0,
          fstype: part.fstype,
          mountpoint: part.mountpoint || null,
          model: disk.model?.trim() || ''
        });
      }
    }
    return found;
  }

  // The configured drive, as currently plugged in (matched by UUID first so
  // it survives /dev/sdX letters changing between boots).
  function findConfiguredDevice(cfg) {
    if (!cfg.device) return null;
    const candidates = listUsbCandidates();
    return (
      (cfg.device.uuid && candidates.find((d) => d.uuid === cfg.device.uuid)) ||
      candidates.find((d) => d.path === cfg.device.path) ||
      null
    );
  }

  // Mount a partition and return its mountpoint. udisksctl mounts under
  // /media with the right permissions; if polkit refuses (service user has
  // no desktop session), fall back to sudo mount with ownership options.
  function mountDevice(device) {
    if (device.mountpoint) return device.mountpoint;
    try {
      const out = run('udisksctl', ['mount', '-b', device.path, '--no-user-interaction']);
      const m = out.match(/ at (\S+?)\.?\s*$/m);
      if (m) return m[1];
    } catch {
      // fall through to sudo mount
    }
    run('sudo', ['mkdir', '-p', FALLBACK_MOUNTPOINT]);
    // A stick yanked without ejecting leaves a dead mount here that would
    // block the next one — lazily clear it first (no-op when nothing's there)
    try {
      run('sudo', ['umount', '-l', FALLBACK_MOUNTPOINT]);
    } catch {
      /* nothing mounted there */
    }
    const ownable = ['vfat', 'exfat', 'ntfs'].includes(device.fstype);
    const opts = ownable ? ['-o', `uid=${process.getuid()},gid=${process.getgid()}`] : [];
    run('sudo', ['mount', ...opts, device.path, FALLBACK_MOUNTPOINT]);
    if (!ownable) {
      // ext*: ownership lives on the filesystem — make our folder writable
      const dir = path.join(FALLBACK_MOUNTPOINT, BACKUP_DIR_NAME);
      run('sudo', ['mkdir', '-p', dir]);
      run('sudo', ['chown', `${process.getuid()}:${process.getgid()}`, dir]);
    }
    return FALLBACK_MOUNTPOINT;
  }

  function unmountDevice(device) {
    try {
      run('udisksctl', ['unmount', '-b', device.path, '--no-user-interaction']);
    } catch {
      run('sudo', ['umount', device.path]);
    }
  }

  // Select a drive as the backup target: mounts it and remembers it, which
  // is what turns automatic backups on. If a different stick was selected
  // before, it's unmounted best-effort so only one target stays mounted.
  function selectDevice(devPath) {
    const device = listUsbCandidates().find((d) => d.path === devPath);
    if (!device) throw new Error('Not a removable USB partition');
    const cfg = readConfig();
    if (cfg.device && cfg.device.uuid !== device.uuid) {
      try {
        const old = findConfiguredDevice(cfg);
        if (old?.mountpoint) unmountDevice(old);
      } catch {
        /* best effort — the new selection proceeds regardless */
      }
    }
    const mountpoint = mountDevice(device);
    cfg.device = { uuid: device.uuid, label: device.label, path: device.path, fstype: device.fstype };
    writeConfig(cfg);
    return { mountpoint, device: cfg.device };
  }

  // The backups folder on the stick. A pre-rename BillSplitterBackups
  // folder is renamed in place on first sight, so existing backups stay
  // listed and restorable; on a read-only stick the old folder keeps
  // working under its old name instead.
  function backupRoot(mountpoint) {
    const dir = path.join(mountpoint, BACKUP_DIR_NAME);
    const legacy = path.join(mountpoint, LEGACY_BACKUP_DIR_NAME);
    if (fs.existsSync(legacy)) {
      try {
        // rename() replaces an empty target dir (mountDevice pre-creates
        // one on ext sticks), so old backups slide under the new name
        if (!fs.existsSync(dir) || fs.readdirSync(dir).length === 0) {
          fs.renameSync(legacy, dir);
        }
      } catch { /* read-only or busy stick */ }
      if (!fs.existsSync(dir)) return legacy;
    }
    return dir;
  }

  // Backups are ordered by folder mtime, newest first — the folder names
  // carry month NAMES (backup_2026_July_16), which don't sort by date.
  function listBackups(mountpoint) {
    const dir = backupRoot(mountpoint);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((name) => name.startsWith('backup'))
      .map((name) => {
        let files = 0;
        let mtime = 0;
        try {
          const full = path.join(dir, name);
          mtime = fs.statSync(full).mtimeMs;
          files = fs.readdirSync(full).length;
        } catch {
          /* unreadable entry — show it anyway */
        }
        return { name, files, mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);
  }

  function performBackup() {
    const cfg = readConfig();
    cfg.lastAttempt = Date.now();
    try {
      if (!cfg.device) throw new Error('No USB drive selected');
      const device = findConfiguredDevice(cfg);
      if (!device) throw new Error(`USB drive "${cfg.device.label}" is not plugged in`);
      const mountpoint = mountDevice(device);
      const dir = backupRoot(mountpoint);
      fs.mkdirSync(dir, { recursive: true });

      // backup_{Year}_{MonthName}_{Day}; a second backup on the same day
      // refreshes the same folder
      const now = new Date();
      const monthName = now.toLocaleDateString('en-GB', { month: 'long' });
      const day = String(now.getDate()).padStart(2, '0');
      const target = path.join(dir, `backup_${now.getFullYear()}_${monthName}_${day}`);
      fs.mkdirSync(target, { recursive: true });
      let copied = 0;
      for (const file of DATA_FILES) {
        const src = path.join(baseDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(target, file));
          copied++;
        }
      }
      // Also write the history as CSV — the same format the app exports,
      // readable in a spreadsheet without the app.
      try {
        const history = JSON.parse(fs.readFileSync(path.join(baseDir, 'history.json'), 'utf8'));
        if (Array.isArray(history) && history.length > 0) {
          fs.writeFileSync(path.join(target, 'billsplitter-history.csv'), historyToCSV(history));
          copied++;
        }
      } catch {
        /* no or invalid history — skip the CSV */
      }

      // Prune to the newest `keep` by mtime (never below 2: current + previous)
      const keep = Math.max(2, Number(cfg.keep) || 2);
      const all = fs
        .readdirSync(dir)
        .filter((n) => n.startsWith('backup'))
        .map((n) => ({ n, mtime: fs.statSync(path.join(dir, n)).mtimeMs }))
        .sort((a, b) => a.mtime - b.mtime);
      for (const { n } of all.slice(0, Math.max(0, all.length - keep))) {
        fs.rmSync(path.join(dir, n), { recursive: true, force: true });
      }

      cfg.lastSuccess = Date.now();
      cfg.lastResult = `Backed up ${copied} file${copied === 1 ? '' : 's'} to ${path.basename(target)} on ${device.label}`;
      writeConfig(cfg);
      return { success: true, target, backups: listBackups(mountpoint) };
    } catch (err) {
      cfg.lastResult = `Backup failed: ${err.message}`;
      writeConfig(cfg);
      return { success: false, error: err.message };
    }
  }

  // Restore FlatBrain's data files from one backup folder on the stick.
  // Both JSON files are validated before anything is touched, and each
  // file is swapped in atomically (tmp + rename), so a bad or half-copied
  // backup can never corrupt the live data.
  function restoreBackup(name) {
    if (
      typeof name !== 'string' ||
      !name.startsWith('backup') ||
      /[/\\]|\.\./.test(name)
    ) {
      throw new Error('Invalid backup name');
    }
    const cfg = readConfig();
    if (!cfg.device) throw new Error('No USB drive selected');
    const device = findConfiguredDevice(cfg);
    if (!device) throw new Error(`USB drive "${cfg.device.label}" is not plugged in`);
    const mountpoint = device.mountpoint || mountDevice(device);
    const dir = path.join(backupRoot(mountpoint), name);
    if (!fs.existsSync(dir)) throw new Error('Backup not found on the stick');

    const staged = [];
    for (const file of RESTORE_FILES) {
      const src = path.join(dir, file);
      if (!fs.existsSync(src)) continue;
      const content = fs.readFileSync(src);
      if (file.endsWith('.json')) {
        let parsed;
        try {
          parsed = JSON.parse(content.toString('utf8'));
        } catch {
          throw new Error(`${file} in this backup is corrupted — not restoring anything`);
        }
        const ok = file === 'history.json'
          ? Array.isArray(parsed)
          : parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
        if (!ok) throw new Error(`${file} in this backup has the wrong shape — not restoring anything`);
      }
      staged.push([file, content]);
    }
    if (staged.length === 0) throw new Error('This backup contains no data files');

    for (const [file, content] of staged) {
      const dest = path.join(baseDir, file);
      const tmp = `${dest}.tmp`;
      fs.writeFileSync(tmp, content);
      fs.renameSync(tmp, dest);
    }
    return { success: true, restored: staged.map(([f]) => f) };
  }

  // Eject = "stop using this stick": unmount it AND clear the selection,
  // which switches automatic backups off (the schedule settings stay).
  // If the drive is busy, nothing changes and the error says so; if it was
  // already yanked, the selection still clears so the state is consistent.
  function ejectDevice() {
    const cfg = readConfig();
    if (!cfg.device) throw new Error('No USB drive selected');
    const label = cfg.device.label;
    const device = findConfiguredDevice(cfg);
    const clearSelection = () => {
      const fresh = readConfig();
      fresh.device = null;
      writeConfig(fresh);
    };
    if (!device) {
      clearSelection();
      return { success: true, message: `${label} is already unplugged — automatic backups switched off.` };
    }
    if (device.mountpoint) {
      try {
        unmountDevice(device);
      } catch {
        throw new Error('Could not eject — the drive is busy. Try again in a moment.');
      }
    }
    clearSelection();
    return { success: true, message: `${label} ejected — safe to unplug. Automatic backups are off.` };
  }

  // Delete one backup folder from the stick (manual housekeeping from the
  // Backup card). The name must be a plain "backup…" folder name — no
  // separators — so nothing outside the backups folder can be touched.
  function deleteBackup(name) {
    if (
      typeof name !== 'string' ||
      !name.startsWith('backup') ||
      /[/\\]|\.\./.test(name)
    ) {
      throw new Error('Invalid backup name');
    }
    const cfg = readConfig();
    const device = findConfiguredDevice(cfg);
    if (!device) throw new Error('USB drive is not plugged in');
    const mountpoint = device.mountpoint || mountDevice(device);
    const dir = path.join(backupRoot(mountpoint), name);
    if (!fs.existsSync(dir)) throw new Error('Backup not found on the stick');
    fs.rmSync(dir, { recursive: true, force: true });
    return { success: true, backups: listBackups(mountpoint) };
  }

  // The most recent moment the schedule says a backup should have happened.
  function lastScheduledOccurrence(cfg, now = new Date()) {
    const [h, m] = String(cfg.time || '06:00').split(':').map(Number);
    const d = new Date(now);
    d.setHours(h || 0, m || 0, 0, 0);
    if (cfg.frequency === 'daily') {
      if (d > now) d.setDate(d.getDate() - 1);
      return d;
    }
    if (cfg.frequency === 'monthly') {
      d.setDate(Math.min(Math.max(1, Number(cfg.dayOfMonth) || 1), 28));
      if (d > now) d.setMonth(d.getMonth() - 1);
      return d;
    }
    // weekly (default)
    const target = Number.isInteger(cfg.dayOfWeek) ? cfg.dayOfWeek : 6;
    while (d.getDay() !== target) d.setDate(d.getDate() - 1);
    if (d > now) d.setDate(d.getDate() - 7);
    return d;
  }

  // Called every minute by the server: runs a backup once per scheduled
  // occurrence, with throttled retries when the drive is missing. Having a
  // drive selected is what turns the schedule on.
  function checkSchedule() {
    const cfg = readConfig();
    if (!cfg.device) return;
    const due = lastScheduledOccurrence(cfg).getTime();
    if (cfg.lastSuccess >= due) return;
    if (Date.now() - cfg.lastAttempt < RETRY_MS) return;
    const result = performBackup();
    console.log(result.success ? `Scheduled backup: ${result.target}` : `Scheduled backup failed: ${result.error}`);
  }

  // Capacity of the mounted stick for the card's status bar.
  function diskUsage(mountpoint) {
    try {
      const s = fs.statfsSync(mountpoint);
      const total = s.blocks * s.bsize;
      const free = s.bavail * s.bsize;
      if (!total) return null;
      return { total, free, used: total - free };
    } catch {
      return null;
    }
  }

  function status() {
    const cfg = readConfig();
    let mounted = null;
    let backups = [];
    let devicePresent = false;
    let usage = null;
    try {
      const device = findConfiguredDevice(cfg);
      devicePresent = !!device;
      mounted = device?.mountpoint || null;
      if (mounted) {
        backups = listBackups(mounted);
        usage = diskUsage(mounted);
      }
    } catch (err) {
      console.error('Error reading backup status:', err);
    }
    return { config: cfg, devicePresent, mounted, usage, backups };
  }

  return {
    readConfig,
    writeConfig,
    listUsbCandidates,
    mountDevice,
    selectDevice,
    performBackup,
    restoreBackup,
    deleteBackup,
    ejectDevice,
    lastScheduledOccurrence,
    checkSchedule,
    status
  };
}
