# FlatBrain — context for Claude Code sessions

FlatBrain is a self-hosted flat admin panel running on a Raspberry Pi 4
(hostname `flatbrain`, live at http://flatbrain.local, port 80, systemd
service `flatbrain`, app dir `/home/pi/FlatBrain`). Express serves both the
API and the pre-built React frontend. Two users (the flatmates); LAN only.

## Architecture

- **Backend**: `server.js` (Express, ESM) + `backup.js` (USB backup manager).
  All data is plain JSON files in the app dir, written atomically
  (tmp + rename) and **git-ignored** — never commit or overwrite live data
  files (`draft.json`, `history.json`, `invoices.json`, `rent.json`,
  `payments.json`, `settings.json`, `password.txt`, `backup-config.json`,
  `reboot-config.json`, `temp-history.json`).
- **Frontend**: React 18 + Vite in `src/`, no chart/UI libraries — charts
  are hand-rolled SVG/divs, icons are `lucide-react@1.23` (check an icon
  exists before using it). `dist/` **is committed** on purpose (the Pi
  serves it without building; Vite's toolchain is weak on 32-bit ARM).
- **Repo is public** (github.com/keyquesttech/FlatBrain): placeholders only
  in code; real data lives in the git-ignored files.

## Apps (dashboard tiles → routes)

| App | Route | Data | Notes |
|---|---|---|---|
| Bill Splitter | `/billsplitter` (+`/flatmate1`, open `/flatmate2`) | `draft.json`, `history.json` | Monthly bills + extras split between two flatmates; PNG invoices; history with paid dates; standing-charges pre-fill after save |
| Rent | `/rent` | `rent.json` | Tenancy details, per-period payment schedule, one invoice per period from History, PAID stamp with date |
| Invoice generator | `/invoices` | `invoices.json` | One-off custom invoices, download-only (no history) |
| Settings | `/settings` | `payments.json` (accounts key), `settings.json`, `password.txt` | Shared bank accounts as cards; display currency picker; per-app password locks; change the shared password (`POST /api/password`, no old password needed) |
| Server status | `/status` | `temp-history.json`, configs | Pi stats + 4h temp graph, USB backup card, scheduled reboots |

Pages are password-gated (`PasswordGate`, client-side, shared password in
`password.txt`, changeable from Settings) according to the per-app locks in
`settings.json` (default: everything locked); `/billsplitter/flatmate2` has
no lock — it is deliberately open so it can be shared. `settings.json` also
holds the display currency (ISO code); `src/utils/currency.js` turns it
into the symbol/format every amount uses, applied by `App.jsx` before the
routes render.

## Money maths (do not break)

`src/utils/calculations.js` is the settlement engine. Invariants: every
charged penny lands on exactly one flatmate; itemized lines always sum to
their card totals; `round2` rounds the third decimal UP with a float-noise
guard. Matias fronts the bills; whoever adds an extra already paid the shop
(the settlement transfers reflect that). There is a fuzz/invariant test
approach: run `calculateInvoice` over random drafts and assert share sums,
card reconciliation and live-data recomputation — do this after any maths
change.

## Shared patterns (reuse, don't reinvent)

- **Whole-document apps**: GET/PUT one JSON doc (`/api/rent`,
  `/api/invoices`, `/api/payments`), normalize on load, debounced 600ms
  saves via a `dataRef` + `update(changes)` helper, flush on unmount.
- **Bill Splitter draft** instead uses PATCH with per-key pending tracking
  and 3s polling (two pages edit it concurrently).
- **CollapsibleCard** for every form card; titles are
  `<span className="stat-title"><Icon size={15}/> Title</span>` (icon+text,
  consistent across all apps).
- **PaidControl**: date-picker paid chip ("Mark paid…" → lime chip with
  date, × to clear). A filled payment date IS the paid marker everywhere.
- **BankAccountPicker**: full-preview tappable account cards from
  `payments.json`; Bill Splitter and Rent bank cards are pick-only (no
  manual inputs), the invoice generator keeps manual fields too.
- **Invoice PNGs**: `utils/invoicePng.js` captures a 720px clone via
  html2canvas (lazy-loaded). Invoice components share the
  `invoice-frame`/`due-card` CSS; paid invoices get the `.paid-stamp`
  (rotated PAID + date). Hidden off-screen previews for history re-downloads.
- **CurrencyInput** has a `formatted` mode (thousands commas in display,
  plain strings stored). **DatePicker** takes `placeholder`/`prefix`.
- **Navigation** takes `customTabs` for non-billsplitter apps' tab pills.
- Status pills (`.status-pill*`) on the Backup/Reboot cards; `.sys-rows`
  for label/value overviews; `.rent-fields` two-up grids for date-heavy
  forms; `.history-grid` cards.

## Server-side schedulers

- Backup: every minute check, weekly default, retries every 30 min; copies
  ALL data files to the `FLATBRAIN` USB stick (sudo-mount fallback at
  `/media/flatbrain-backup`); restore validates JSON shapes first.
- Reboots: default weekly Sun 06:30 (after the backup slot); a due backup
  runs BEFORE any reboot; config written pre-reboot; 10-min uptime guard.
- Temperature: sampled every 60s into `temp-history.json` (4h window).
- Pi frugality: vcgencmd throttle flags cached 15s, core count read once,
  temp history on its own endpoint (`/api/system/temp-history`) so the 3s
  stats poll stays ~500 bytes.

## Conventions

- Run `npm run lint` (oxlint) and `npm run build` before every deploy; fix
  new warnings (the three Dialog.jsx fast-refresh warnings are known).
- Utils use extensioned imports (`./calculations.js`) so Node can import
  them directly (backup.js does; tests do).
- Card descriptions share one voice: short declarative sentences, one
  em-dash clarifying beat.
- Watch for non-breaking spaces in JSX text (e.g. `pays £…`) — exact
  string edits can miss them; verify with `cat -A` when an edit won't match.
- Dashboard tile accents: `lime` (default gradient), `pink`, `blue`.

## Deploy flow (after ANY change — no need to ask)

1. In the worktree: `ln -sfn /home/pi/FlatBrain/node_modules node_modules`,
   lint + build, then remove the symlink before committing.
2. Commit; `git -C /home/pi/FlatBrain merge --ff-only <branch>`;
   `git -C /home/pi/FlatBrain push origin main`.
3. `sudo systemctl restart flatbrain` (passwordless sudo works), verify
   `systemctl is-active` and that `/` serves the new bundle hash.
4. Never run test servers against the live port; use `PORT=8090 node
   server.js`, kill by PID/cwd afterwards, and delete any data files the
   test created in the worktree.
