import express from 'express';
import compression from 'compression';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { createBackupManager } from './backup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable('x-powered-by');
// Gzip responses (JS/CSS/HTML/JSON) — cuts transfer to phones on slow
// Wi-Fi to roughly a third; negligible CPU for a Pi 4 serving two users.
app.use(compression());
app.use(express.json({ limit: '512kb' }));

// FlatBrain app namespaces: /api/billsplitter/* is the canonical path for
// the bill splitter API. The bare /api/* routes below stay reachable for
// back-compat, so this middleware just strips the app prefix.
app.use((req, res, next) => {
  if (req.url.startsWith('/api/billsplitter/')) {
    req.url = req.url.replace('/api/billsplitter/', '/api/');
  }
  next();
});

// A plain-object body check: rejects null, arrays and primitives so a bad
// client can't overwrite draft.json/history.json with unusable data.
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

const DIST_DIR = path.join(__dirname, 'dist');
const DRAFT_FILE = path.join(__dirname, 'draft.json');
const HISTORY_FILE = path.join(__dirname, 'history.json');
const PASSWORD_FILE = path.join(__dirname, 'password.txt');
const DEFAULT_PASSWORD = 'change-me';

const defaultDraft = {
  period: '',
  dueDate: '',
  names: { matias: 'Matias', reka: 'Réka' },
  bills: [
    { id: '1', thing: 'Broadband', amount: '' },
    { id: '2', thing: 'Electricity', amount: '' },
    { id: '3', thing: 'Heating', amount: '' },
    { id: '4', thing: 'Water', amount: '' }
  ],
  matiasExtras: [],
  rekaExtras: [],
  matiasFullPriceExtras: [],
  rekaFullPriceExtras: [],
  matiasNote: '',
  rekaNote: '',
  matiasDiscounts: [],
  rekaDiscounts: [],
  splitPercent: 50,
  bankDetails: {
    name: 'Your Name',
    bankName: 'Your Bank',
    sortCode: '00-00-00',
    accountNumber: '00000000'
  }
};

function readJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (err) {
    console.error(`Error reading ${file}:`, err);
  }
  return fallback;
}

// Write to a temp file and rename so a power cut mid-write (common enough on a
// Pi with an SD card) can't leave a half-written, corrupt JSON file behind.
function writeJSON(file, data) {
  try {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error(`Error writing ${file}:`, err);
  }
}

// Reads the password from password.txt so it can be changed by editing that file.
// If the file is missing, it is recreated with the default password.
function getPassword() {
  try {
    if (fs.existsSync(PASSWORD_FILE)) {
      const pw = fs.readFileSync(PASSWORD_FILE, 'utf8').trim();
      if (pw) return pw;
    } else {
      fs.writeFileSync(PASSWORD_FILE, DEFAULT_PASSWORD + '\n');
    }
  } catch (err) {
    console.error('Error reading password file:', err);
  }
  return DEFAULT_PASSWORD;
}

// API Routes
app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  res.json({ success: password === getPassword() });
});

// Change the shared password (managed from Settings). Knowing the current
// password is required, mirroring the login check. The new one is trimmed
// like getPassword() trims the file, and written tmp+rename so a power cut
// can't leave an empty password.txt behind.
app.post('/api/password', (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ success: false, error: 'Both passwords are required' });
  }
  if (currentPassword !== getPassword()) {
    return res.json({ success: false, error: 'The current password is incorrect.' });
  }
  const next = newPassword.trim();
  if (next.length < 4 || next.length > 200 || /[\r\n]/.test(next)) {
    return res.json({ success: false, error: 'The new password needs 4–200 characters on a single line.' });
  }
  try {
    const tmp = `${PASSWORD_FILE}.tmp`;
    fs.writeFileSync(tmp, next + '\n');
    fs.renameSync(tmp, PASSWORD_FILE);
  } catch (err) {
    console.error('Error writing password file:', err);
    return res.status(500).json({ success: false, error: 'Could not write the password file' });
  }
  res.json({ success: true });
});

app.get('/api/draft', (req, res) => {
  res.json(readJSON(DRAFT_FILE, defaultDraft));
});

app.put('/api/draft', (req, res) => {
  const newData = req.body;
  if (!isPlainObject(newData)) {
    return res.status(400).json({ success: false, error: 'Draft must be an object' });
  }
  writeJSON(DRAFT_FILE, newData);
  res.json({ success: true, draft: newData });
});

// Merge a partial update into the draft: only the keys sent are replaced.
// The read+merge+write is synchronous, so concurrent editors touching
// different parts (generator page vs a flatmate page) can't clobber each
// other's keys the way a full PUT can.
app.patch('/api/draft', (req, res) => {
  const changes = req.body;
  if (!isPlainObject(changes)) {
    return res.status(400).json({ success: false, error: 'Changes must be an object' });
  }
  const merged = { ...readJSON(DRAFT_FILE, defaultDraft), ...changes };
  writeJSON(DRAFT_FILE, merged);
  res.json({ success: true, draft: merged });
});

app.post('/api/draft/reset', (req, res) => {
  writeJSON(DRAFT_FILE, defaultDraft);
  res.json({ success: true, draft: defaultDraft });
});

app.get('/api/history', (req, res) => {
  res.json(readJSON(HISTORY_FILE, []));
});

app.post('/api/history', (req, res) => {
  const invoice = req.body;
  if (!isPlainObject(invoice) || typeof invoice.id !== 'string' || !invoice.id) {
    return res.status(400).json({ success: false, error: 'Invoice must be an object with an id' });
  }
  const history = readJSON(HISTORY_FILE, []);
  // Replace rather than duplicate if the same invoice is submitted twice
  // (e.g. a retried request after a network hiccup). Sorted by timestamp so
  // an updated old invoice keeps its chronological place instead of jumping
  // to the top of the history.
  const updated = [invoice, ...history.filter((inv) => inv.id !== invoice.id)]
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  writeJSON(HISTORY_FILE, updated);
  res.json({ success: true, history: updated });
});

// Bulk import (from a CSV export): upserts by id — imported invoices replace
// existing ones with the same id, everything else is kept.
app.post('/api/history/import', (req, res) => {
  const { invoices } = req.body || {};
  if (!Array.isArray(invoices)) {
    return res.status(400).json({ success: false, error: 'Body must contain an invoices array' });
  }
  const valid = invoices.filter(
    (inv) => isPlainObject(inv) && typeof inv.id === 'string' && inv.id
  );
  const byId = new Map(readJSON(HISTORY_FILE, []).map((inv) => [inv.id, inv]));
  valid.forEach((inv) => byId.set(inv.id, inv));
  const updated = [...byId.values()].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  writeJSON(HISTORY_FILE, updated);
  res.json({ success: true, history: updated, imported: valid.length });
});

app.delete('/api/history/:id', (req, res) => {
  const history = readJSON(HISTORY_FILE, []);
  const updated = history.filter(inv => inv.id !== req.params.id);
  writeJSON(HISTORY_FILE, updated);
  res.json({ success: true, history: updated });
});

// ---- Shared bank accounts (managed by the Settings app, read by every
// bank-details picker). The file keeps the payments name from the app
// that introduced it; whole-document GET/PUT. ----
const PAYMENTS_FILE = path.join(__dirname, 'payments.json');

const defaultPayments = {
  accounts: [] // [{ id, label, name, bankName, sortCode, accountNumber }]
};

app.get('/api/payments', (req, res) => {
  res.json(readJSON(PAYMENTS_FILE, defaultPayments));
});

app.put('/api/payments', (req, res) => {
  const payments = req.body;
  if (!isPlainObject(payments)) {
    return res.status(400).json({ success: false, error: 'Payments data must be an object' });
  }
  writeJSON(PAYMENTS_FILE, payments);
  res.json({ success: true, payments });
});

// ---- Rent: the tenancy details, the payment schedule and the history of
// generated rent invoices. Single-editor, so whole-document GET/PUT. ----
const RENT_FILE = path.join(__dirname, 'rent.json');

const defaultRent = {
  lodger: '',
  deposit: '',
  startDate: '',
  endDate: '',
  blocks: 6,
  payments: [], // [{ id, paymentDate, periodFrom, periodTo, amount, dueDate, paid, include }]
  bankDetails: {
    // Rent's own account details, independent of the other apps'
    name: 'Your Name',
    bankName: 'Your Bank',
    sortCode: '00-00-00',
    accountNumber: '00000000'
  },
  history: [] // [{ id, title, period, items, deposit, lodger, bankDetails, total, generatedAt, paidDate }]
};

app.get('/api/rent', (req, res) => {
  res.json(readJSON(RENT_FILE, defaultRent));
});

app.put('/api/rent', (req, res) => {
  const rent = req.body;
  if (!isPlainObject(rent)) {
    return res.status(400).json({ success: false, error: 'Rent data must be an object' });
  }
  writeJSON(RENT_FILE, rent);
  res.json({ success: true, rent });
});

// ---- Custom invoice generator: one document holding the one-off invoice
// being built (title + due date + line items + its own bank details).
// Download-only by design — no history. Small and single-editor, so
// whole-document GET/PUT is enough.
const INVOICES_FILE = path.join(__dirname, 'invoices.json');

const defaultInvoicesDoc = {
  title: '',
  dueDate: '',
  items: [], // [{ id, thing, units, amount }] — amount is the line's TOTAL
  bankDetails: {
    // The generator's own account details, independent of Bill Splitter's
    name: 'Your Name',
    bankName: 'Your Bank',
    sortCode: '00-00-00',
    accountNumber: '00000000'
  }
};

app.get('/api/invoices', (req, res) => {
  res.json(readJSON(INVOICES_FILE, defaultInvoicesDoc));
});

app.put('/api/invoices', (req, res) => {
  const docBody = req.body;
  if (!isPlainObject(docBody)) {
    return res.status(400).json({ success: false, error: 'Invoices data must be an object' });
  }
  writeJSON(INVOICES_FILE, docBody);
  res.json({ success: true, doc: docBody });
});

// ---- USB backups (see backup.js) ----
// Panel-level: one backup covers every app's data plus the password and
// backup settings. Lives at the bare /api/backup/* (the old
// /api/billsplitter/backup/* path still reaches it via the prefix strip).
const backup = createBackupManager(__dirname);

app.get('/api/backup/status', (req, res) => {
  try {
    res.json(backup.status());
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/backup/devices', (req, res) => {
  try {
    res.json({ devices: backup.listUsbCandidates() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Select + mount a USB partition as the backup target (which turns
// automatic backups on). Only paths lsblk reports as removable/USB are
// accepted; a previously selected different stick is unmounted.
app.post('/api/backup/mount', (req, res) => {
  const { path: devPath } = req.body || {};
  try {
    const result = backup.selectDevice(devPath);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.message === 'Not a removable USB partition' ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

app.put('/api/backup/config', (req, res) => {
  const body = req.body;
  if (!isPlainObject(body)) {
    return res.status(400).json({ success: false, error: 'Config must be an object' });
  }
  const cfg = backup.readConfig();
  const updated = {
    ...cfg,
    // device is only ever SET via /api/backup/mount; an explicit null here
    // clears it, which switches automatic backups off
    device: body.device === null ? null : cfg.device,
    frequency: ['daily', 'weekly', 'monthly'].includes(body.frequency) ? body.frequency : cfg.frequency,
    dayOfWeek: Number.isInteger(body.dayOfWeek) && body.dayOfWeek >= 0 && body.dayOfWeek <= 6 ? body.dayOfWeek : cfg.dayOfWeek,
    dayOfMonth: Number.isInteger(body.dayOfMonth) && body.dayOfMonth >= 1 && body.dayOfMonth <= 28 ? body.dayOfMonth : cfg.dayOfMonth,
    time: /^\d{1,2}:\d{2}$/.test(body.time || '') ? body.time : cfg.time,
    keep: Number.isInteger(body.keep) && body.keep >= 2 && body.keep <= 12 ? body.keep : cfg.keep
  };
  backup.writeConfig(updated);
  res.json({ success: true, config: updated });
});

app.post('/api/backup/run', (req, res) => {
  // Always 200: the success flag carries the outcome so the card can show
  // "drive not plugged in" instead of a generic HTTP failure.
  res.json(backup.performBackup());
});

app.post('/api/backup/restore', (req, res) => {
  const { name } = req.body || {};
  try {
    res.json(backup.restoreBackup(name));
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/backup/eject', (req, res) => {
  try {
    res.json(backup.ejectDevice());
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.delete('/api/backup/:name', (req, res) => {
  try {
    res.json(backup.deleteBackup(req.params.name));
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Scheduler heartbeat — fires the backup when its scheduled time passes.
setInterval(() => backup.checkSchedule(), 60 * 1000);

// ---- Scheduled reboots (panel-level, like backups) ----
// Weekly by default at 06:30 Sunday — half an hour after the default
// backup slot, so the stick is fresh before the Pi goes down.
const REBOOT_FILE = path.join(__dirname, 'reboot-config.json');
const REBOOT_RETRY_MS = 30 * 60 * 1000;

const DEFAULT_REBOOT = {
  enabled: true,
  frequency: 'weekly', // 'daily' | 'weekly' | 'monthly'
  dayOfWeek: 0, // Sunday
  dayOfMonth: 1,
  time: '06:30',
  lastReboot: 0,
  lastAttempt: 0,
  lastResult: ''
};

function readRebootConfig() {
  const existing = readJSON(REBOOT_FILE, null);
  if (existing) return { ...DEFAULT_REBOOT, ...existing };
  // First run: count the schedule from now, so enabling by default can't
  // fire a reboot for an occurrence that predates the feature.
  const cfg = { ...DEFAULT_REBOOT, lastReboot: Date.now() };
  writeJSON(REBOOT_FILE, cfg);
  return cfg;
}

// Before any reboot, scheduled actions get dealt with first — and backups
// take priority: if the backup schedule has a due, un-run backup and a
// configured drive, it runs before the Pi goes down. The config is written
// BEFORE the reboot command so the post-boot state can't re-trigger it.
function performReboot(trigger) {
  const cfg = readRebootConfig();
  cfg.lastAttempt = Date.now();
  let note = '';
  const backupCfg = backup.readConfig();
  if (backupCfg.device && backupCfg.lastSuccess < backup.lastScheduledOccurrence(backupCfg).getTime()) {
    const result = backup.performBackup();
    note = result.success
      ? ' — ran the due backup first'
      : ` — due backup failed first (${result.error})`;
  }
  cfg.lastReboot = Date.now();
  cfg.lastResult = `${trigger} reboot on ${new Date().toLocaleString('en-GB')}${note}`;
  writeJSON(REBOOT_FILE, cfg);
  // Let the HTTP response land before the network goes away.
  setTimeout(() => {
    execFile('sudo', ['systemctl', 'reboot'], (err) => {
      if (err) console.error('Reboot command failed:', err);
    });
  }, 1500);
  return { success: true, message: `Rebooting${note}.` };
}

// Reuses the backup manager's schedule maths (it only reads frequency,
// day and time from the config it's given).
function checkRebootSchedule() {
  const cfg = readRebootConfig();
  if (!cfg.enabled) return;
  if (cfg.lastReboot >= backup.lastScheduledOccurrence(cfg).getTime()) return;
  // Never reboot within 10 minutes of boot — guards against clock
  // catch-up right after startup looking like a missed occurrence.
  if (os.uptime() < 600) return;
  if (Date.now() - cfg.lastAttempt < REBOOT_RETRY_MS) return;
  console.log('Scheduled reboot due — triggering');
  performReboot('Scheduled');
}
setInterval(checkRebootSchedule, 60 * 1000);

app.get('/api/reboot/status', (req, res) => {
  res.json({ config: readRebootConfig(), uptimeSec: Math.round(os.uptime()) });
});

app.put('/api/reboot/config', (req, res) => {
  const body = req.body;
  if (!isPlainObject(body)) {
    return res.status(400).json({ success: false, error: 'Config must be an object' });
  }
  const cfg = readRebootConfig();
  const updated = {
    ...cfg,
    enabled: typeof body.enabled === 'boolean' ? body.enabled : cfg.enabled,
    frequency: ['daily', 'weekly', 'monthly'].includes(body.frequency) ? body.frequency : cfg.frequency,
    dayOfWeek: Number.isInteger(body.dayOfWeek) && body.dayOfWeek >= 0 && body.dayOfWeek <= 6 ? body.dayOfWeek : cfg.dayOfWeek,
    dayOfMonth: Number.isInteger(body.dayOfMonth) && body.dayOfMonth >= 1 && body.dayOfMonth <= 28 ? body.dayOfMonth : cfg.dayOfMonth,
    time: /^\d{1,2}:\d{2}$/.test(body.time || '') ? body.time : cfg.time
  };
  writeJSON(REBOOT_FILE, updated);
  res.json({ success: true, config: updated });
});

app.post('/api/reboot/now', (req, res) => {
  res.json(performReboot('Manual'));
});

// ---- Server status: host stats for the Pi this panel runs on ----

function readSysFile(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return null;
  }
}

// First line of /proc/stat: cumulative jiffies since boot. Usage is the busy
// share between two samples, so the previous sample is kept between requests
// — each poll reports the usage since the one before it.
function readCpuTimes() {
  const line = readSysFile('/proc/stat')?.split('\n')[0];
  if (!line) return null;
  const t = line.trim().split(/\s+/).slice(1, 9).map(Number);
  if (t.length < 5 || !t.every(Number.isFinite)) return null;
  const idle = t[3] + t[4]; // idle + iowait
  return { idle, total: t.reduce((a, b) => a + b, 0) };
}

let lastCpuTimes = readCpuTimes();

function readTempC() {
  const raw = readSysFile('/sys/class/thermal/thermal_zone0/temp');
  return raw ? Math.round(Number(raw) / 100) / 10 : null;
}

// Temperature history for the status page graph: sampled once a minute,
// kept for four hours, and persisted to a git-ignored file so the service
// restart that comes with every deploy doesn't blank the graph.
const TEMP_HISTORY_FILE = path.join(__dirname, 'temp-history.json');
const TEMP_WINDOW_MS = 4 * 60 * 60 * 1000;

let tempHistory = readJSON(TEMP_HISTORY_FILE, []).filter(
  (p) => p && Number.isFinite(p.t) && Number.isFinite(p.c) && Date.now() - p.t <= TEMP_WINDOW_MS
);

function sampleTemp() {
  const c = readTempC();
  if (c == null) return;
  const now = Date.now();
  tempHistory = [...tempHistory.filter((p) => now - p.t <= TEMP_WINDOW_MS), { t: now, c }];
  writeJSON(TEMP_HISTORY_FILE, tempHistory);
}
sampleTemp();
setInterval(sampleTemp, 60 * 1000);

function cpuUsagePercent() {
  const now = readCpuTimes();
  if (!now) return null;
  const prev = lastCpuTimes;
  lastCpuTimes = now;
  if (!prev || now.total <= prev.total) return null;
  const busy = (now.total - prev.total) - (now.idle - prev.idle);
  return Math.min(100, Math.max(0, Math.round((busy / (now.total - prev.total)) * 100)));
}

function memInfo() {
  const text = readSysFile('/proc/meminfo');
  if (!text) return null;
  const kb = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^(\w+):\s+(\d+)/);
    if (m) kb[m[1]] = Number(m[2]) * 1024;
  }
  const total = kb.MemTotal || 0;
  return {
    total,
    used: total - (kb.MemAvailable ?? kb.MemFree ?? 0),
    swapTotal: kb.SwapTotal || 0,
    swapUsed: (kb.SwapTotal || 0) - (kb.SwapFree || 0)
  };
}

function diskInfo() {
  try {
    const s = fs.statfsSync(__dirname);
    const total = s.blocks * s.bsize;
    const avail = s.bavail * s.bsize; // what non-root users can still write
    const used = total - s.bfree * s.bsize;
    return {
      total,
      used,
      avail,
      // df-style percentage: the root-reserved blocks don't count as free
      percent: used + avail > 0 ? Math.round((used / (used + avail)) * 100) : null
    };
  } catch {
    return null;
  }
}

// Firmware throttling flags (undervoltage, thermal throttling). vcgencmd is
// Pi-specific, so any failure just reports null and the page omits the line.
// Spawning a process per 3-second poll adds up on a Pi, so the result is
// cached briefly — the flags change rarely and 15s staleness is fine.
const THROTTLE_CACHE_MS = 15 * 1000;
let throttledCache = { value: null, at: 0 };

function readThrottled() {
  if (Date.now() - throttledCache.at < THROTTLE_CACHE_MS) {
    return Promise.resolve(throttledCache.value);
  }
  return new Promise((resolve) => {
    execFile('vcgencmd', ['get_throttled'], { timeout: 1500 }, (err, stdout) => {
      const m = !err && String(stdout).match(/=0x([0-9a-f]+)/i);
      const value = m
        ? {
            undervoltageNow: Boolean(parseInt(m[1], 16) & 0x1),
            throttledNow: Boolean(parseInt(m[1], 16) & 0x4),
            undervoltageEver: Boolean(parseInt(m[1], 16) & 0x10000),
            throttledEver: Boolean(parseInt(m[1], 16) & 0x40000)
          }
        : null;
      throttledCache = { value, at: Date.now() };
      resolve(value);
    });
  });
}

// Core count never changes at runtime — read it once instead of allocating
// the whole os.cpus() array on every poll.
const CPU_CORES = os.cpus().length;

// Polled every few seconds by the dashboard's Server Status page. Lives at
// /api/system/* — panel-level, not part of any app's namespace. The 4-hour
// temperature history is deliberately NOT in here: it only gains a point a
// minute, so the page fetches /api/system/temp-history on its own slower
// cadence instead of shipping ~240 points with every fast poll.
app.get('/api/system/stats', async (req, res) => {
  const freqRaw = readSysFile('/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq');
  res.json({
    hostname: os.hostname(),
    // device-tree strings are NUL-terminated; strip that before serving
    model: readSysFile('/proc/device-tree/model')?.replaceAll('\0', '') || null,
    kernel: os.release(),
    arch: os.arch(),
    node: process.version,
    uptimeSec: Math.round(os.uptime()),
    tempC: readTempC(),
    cpu: {
      percent: cpuUsagePercent(),
      cores: CPU_CORES,
      load: os.loadavg().map((n) => Math.round(n * 100) / 100),
      mhz: freqRaw ? Math.round(Number(freqRaw) / 1000) : null
    },
    memory: memInfo(),
    disk: diskInfo(),
    throttled: await readThrottled()
  });
});

app.get('/api/system/temp-history', (req, res) => {
  res.json({ history: tempHistory });
});

// Serve the built React app. Vite fingerprints everything under /assets, so
// those files can be cached forever; everything else revalidates.
app.use('/assets', express.static(path.join(DIST_DIR, 'assets'), {
  immutable: true,
  maxAge: '1y'
}));
app.use(express.static(DIST_DIR, {
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-cache');
  }
}));

// Fallback route for React Router
app.use((req, res) => {
  if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    res.setHeader('Cache-Control', 'no-cache');
    // root + relative name (rather than one absolute path) so send() doesn't
    // 404 when the app is installed under a dot-directory.
    res.sendFile('index.html', { root: DIST_DIR });
  } else {
    res.status(404).send('Frontend not built. Run "npm run build" first.');
  }
});

// Malformed JSON bodies and other request errors get a JSON 400 instead of
// Express's default HTML error page.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('Unhandled request error:', err);
  res.status(status).json({ success: false, error: status >= 500 ? 'Internal server error' : 'Bad request' });
});

const PORT = process.env.PORT || 80;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT} (http://flatbrain.local)`);
});
