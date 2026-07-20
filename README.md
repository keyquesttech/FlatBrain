# FlatBrain

A small self-hosted **admin panel for your flat**, designed to run on a
Raspberry Pi and reachable at **`http://flatbrain.local`** on your LAN.
FlatBrain is the launcher; the things your flat actually needs live inside it
as apps under one domain:

| App | Path | What it does |
|---|---|---|
| **Dashboard** | `/` | The launcher — every app as a tile |
| **Bill Splitter** | `/billsplitter` | Split monthly bills and shared purchases, generate invoice images |
| *(more soon)* | `/…` | Each future app is just a new route + API namespace |

- **Frontend:** React 19 + Vite (one SPA for all apps, dark "neon" design,
  lava-lamp ambience, in-app dialogs and UI sounds)
- **Backend:** one Express server that stores data in plain JSON files (no
  database); each app's API lives under `/api/<app>/…`
- **Auth:** the dashboard and every app page are password-protected; the
  password lives in an editable `password.txt`. The only open page is Bill
  Splitter's flatmate 2 page, so it can be shared with a link.

---

## Bill Splitter (the first app)

- Shared **bills** (Broadband, Electricity, Heating, Water, ...) — add or
  remove as many as you need, split by an **adjustable ratio** (50/50 by
  default, e.g. 60/40 if one room is bigger).
- Personal **extras** for each flatmate, added from their own page:
  - `/billsplitter/flatmate1` and `/billsplitter/flatmate2` — shareable links
    so each person can add what they bought. Changes sync live to the invoice
    (no refresh needed).
  - each item has its own **split percentage** — the share the buyer pays
    themselves (default 50%, or e.g. 0% for "I picked up your parcel
    postage" — the other flatmate covers it all).
  - You enter the **units in the pack and the total price paid**; the
    per-unit price is calculated automatically — a 9-roll pack for £4.50
    shows as "Item (9 × £0.50)" on the invoice.
- Per-flatmate **notes** that appear on the invoice.
- Per-flatmate **discounts** — a fixed £ amount or a % of their total, shown
  as deduction lines on the invoice (e.g. a bill credit or something they
  already paid for). A discount only ever reduces its own flatmate's total.
- **Settle-up totals**: each flatmate card ends with Extras share, Net total,
  Discounts total (personal discounts plus the extras that person already
  paid for at the shop) and a final **total due** — the exact amount to
  transfer, with reimbursements for own purchases already netted off.
- A **Spending Trend card on the invoice** comparing this month's bills and
  extras against the previous three saved months — stacked bars plus an
  up/down line vs the 3-month average, so every invoice shows at a glance
  whether household spending is rising or falling.
- Live **invoice preview** that downloads as a fixed-size PNG — identical
  output whether generated from a phone, tablet or desktop.
- **History** of saved invoices with:
  - one-click **PNG re-download** of any past invoice,
  - **CSV export / import** (spreadsheet-friendly and losslessly re-importable
    — use it as your backup),
  - stacked **bills-breakdown chart** by month.
- Picking an invoice period auto-fills the due date (7th of the next month).
- Editable flatmate names and bank details, shown on the invoice.
- Automatic **USB backups** of the app's data on a schedule, with restore.

---

## Quick deploy on a Raspberry Pi

On a Raspberry Pi running Raspberry Pi OS, open a terminal and run:

```bash
git clone https://github.com/keyquesttech/FlatBrain.git
cd FlatBrain
sudo bash install.sh
```

That single `install.sh` command will:

1. Install **Node.js** — using the official nodejs.org ARM binaries on 32-bit
   Raspberry Pi OS (`armhf`), since NodeSource doesn't support 32-bit ARM.
2. Install the **runtime dependencies** (the frontend is pre-built and committed
   in `dist/`, so the Pi does **not** run the heavy Vite build).
3. Create and enable a **systemd service** (`flatbrain`) so the panel
   **auto-starts on boot** — migrating away from the pre-FlatBrain
   `billsplitter` service if one exists.
4. Set the Pi's **mDNS hostname** so it's reachable at
   **`http://flatbrain.local`** from any device on your network.

Works on 32-bit (`armhf`) and 64-bit (`arm64`) Raspberry Pi OS.

When it finishes, open **http://flatbrain.local** on any device on the LAN.

> The default login password is `change-me` — change it right away (see
> "Password" below).

### Install options

Override defaults with environment variables, for example:

```bash
# Use a different port and a different mDNS name
sudo PORT=8080 APP_HOSTNAME=myflat bash install.sh

# Install a specific Node major version
sudo NODE_MAJOR=20 bash install.sh

# Skip changing the hostname (reach it via <pi-hostname>.local or its IP)
sudo APP_HOSTNAME= bash install.sh
```

The installer is **idempotent** — re-run it any time (e.g. after `git pull`) to
rebuild and restart with the latest code.

### Managing the service

```bash
sudo systemctl status flatbrain     # is it running?
journalctl -u flatbrain -f          # live logs
sudo systemctl restart flatbrain    # restart
sudo systemctl stop flatbrain       # stop
```

### Updating

The frontend build (`dist/`) is committed to the repo, so updating the Pi is
just a pull + restart:

```bash
cd FlatBrain
git pull
sudo systemctl restart flatbrain
```

Run `sudo bash install.sh` again instead if dependencies changed.

> After changing source code, rebuild on your dev machine with `npm run build`
> and commit the updated `dist/` so the Pi picks it up on the next `git pull`.

### Uninstalling

```bash
sudo bash uninstall.sh
```

This removes the service but leaves your data and code in place. Delete the
folder to remove everything.

---

## Personalising it

- **Names** — set both flatmates' names in the *Names* card on the Bill
  Splitter generator page; they're used across the app and on the invoice.
- **Bank details** — fill in the *Bank Details* card; they appear on the
  invoice so the other flatmate knows where to send money. (The defaults are
  placeholders.)
- **Bills** — edit the bill names/amounts on the generator page.

## Password

- The password is stored in **`password.txt`** in the project folder. It is
  created automatically on first run with the default `change-me`.
- One password covers the whole panel: the dashboard and every app page ask
  for it.
- To change it, edit the file and restart the service:

  ```bash
  nano password.txt
  sudo systemctl restart flatbrain
  ```

- `password.txt` is **git-ignored**, so it is never uploaded to GitHub and each
  deployment keeps its own password.
- Bill Splitter's flatmate 2 page (`/billsplitter/flatmate2`) is deliberately
  reachable without the password so you can share the link; don't expose the
  panel beyond your LAN.

## Data & backups

The server stores everything in the project folder as plain files (all
git-ignored):

- `draft.json` — Bill Splitter's current in-progress invoice
- `history.json` — saved past invoices
- `password.txt` — the login password
- `backup-config.json` — USB backup settings

To back up, use the **USB Backup card** on the History page (scheduled backups
to a USB stick, with restore), copy those files somewhere safe, or use
**History → Export CSV** from the app, which downloads the whole history as a
spreadsheet-friendly file that can be re-imported with **Import CSV** (it
merges by invoice id).

---

## Local development (on your PC)

Requires Node.js 20+.

```bash
npm install

# Terminal 1 - backend API (defaults to port 80; set PORT to change)
npm run start          # or: PORT=3000 npm run start

# Terminal 2 - Vite dev server with hot reload
npm run dev
```

Then open the URL Vite prints (e.g. http://localhost:5173). The dev server
proxies `/api` to the backend (see `vite.config.js` — update the port there if
you change the backend port).

To preview a production build locally:

```bash
npm run build
npm run start
```

Lint with:

```bash
npm run lint
```

---

## Project structure

```
server.js              Express API + serves the built frontend from dist/
install.sh             One-command Raspberry Pi installer (Node, systemd, mDNS)
uninstall.sh           Removes the systemd service
src/                   React source (one SPA for all FlatBrain apps)
  api.js               Bill Splitter API client (/api/billsplitter/*)
  App.jsx              Routes: dashboard at /, apps under their own paths
  pages/               DashboardPage, MainPage (generator + history), UserExtrasPage
  components/          InvoiceForm, InvoicePreview, InvoiceHistory, Dialog,
                       CollapsibleCard, pickers, charts
  utils/
    calculations.js    Bill-splitting math (units × unit price, per-item split %)
    historyCsv.js      CSV export/import mapping
    invoicePng.js      Fixed-size PNG capture of the invoice
    defaults.js        Draft shape + placeholder defaults
    sound.js           WebAudio UI sounds (mute toggle in the nav)
dist/                  Production build output (committed so the Pi needn't build)
```

### Adding a new app

1. Add its tile to `src/pages/DashboardPage.jsx`.
2. Add its routes in `src/App.jsx` under `/<app>/…` (wrap in `PasswordGate`
   unless a page is meant to be shared).
3. Give its API a namespace: serve it under `/api/<app>/…` in `server.js`.

---

## Notes

- **Port 80** requires elevated privileges. The systemd service grants the
  `CAP_NET_BIND_SERVICE` capability so it can bind port 80 without running as
  root.
- **`flatbrain.local`** resolution relies on **mDNS/Bonjour** (Avahi on the
  Pi). Most phones, Macs, and modern Windows machines support it out of the box.
  If a device can't resolve it, use the Pi's IP address instead
  (`hostname -I` on the Pi).
- Pre-FlatBrain bookmarks to `/flatmate1` / `/flatmate2` still work — they
  redirect to the new `/billsplitter/…` paths. The old `billsplitter.local`
  hostname is retired once the installer renames the Pi to `flatbrain`.
- This panel is intended for a trusted home LAN. Traffic is plain HTTP and the
  data API endpoints are not individually authenticated — do not port-forward
  it to the internet.
