import express from 'express';
import compression from 'compression';
import fs from 'fs';
import path from 'path';
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

// ---- USB backups (see backup.js) ----
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
