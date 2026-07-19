# Bill Splitter

A small self-hosted web app for two flatmates to split monthly household bills
and shared purchases, then generate and download a polished invoice image.

- **Frontend:** React 19 + Vite (bundled to static files, dark "neon" design)
- **Backend:** Express server that stores data in plain JSON files (no database)
- **Auth:** the main page is password-protected; the password lives in an
  editable `password.txt`
- **Designed to run on a Raspberry Pi** and start on boot, reachable at
  `http://billsplitter.local` on your LAN

---

## Features

- Shared **bills** (Broadband, Electricity, Heating, Water, ...) — add or
  remove as many as you need, split by an **adjustable ratio** (50/50 by
  default, e.g. 60/40 if one room is bigger).
- Personal **extras** for each flatmate, added from their own page:
  - `/flatmate1` and `/flatmate2` — shareable links so each person can add
    what they bought. Changes sync live to the invoice (no refresh needed).
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

---

## Quick deploy on a Raspberry Pi

On a Raspberry Pi running Raspberry Pi OS, open a terminal and run:

```bash
git clone https://github.com/keyquesttech/BillSplitter.git billsplitter
cd billsplitter
sudo bash install.sh
```

That single `install.sh` command will:

1. Install **Node.js** — using the official nodejs.org ARM binaries on 32-bit
   Raspberry Pi OS (`armhf`), since NodeSource doesn't support 32-bit ARM.
2. Install the **runtime dependencies** (the frontend is pre-built and committed
   in `dist/`, so the Pi does **not** run the heavy Vite build).
3. Create and enable a **systemd service** so the app **auto-starts on boot**.
4. Set the Pi's **mDNS hostname** so it's reachable at
   **`http://billsplitter.local`** from any device on your network.

Works on 32-bit (`armhf`) and 64-bit (`arm64`) Raspberry Pi OS.

When it finishes, open **http://billsplitter.local** on any device on the LAN.

> The default login password is `change-me` — change it right away (see
> "Password" below).

### Install options

Override defaults with environment variables, for example:

```bash
# Use a different port and a different mDNS name
sudo PORT=8080 APP_HOSTNAME=bills bash install.sh

# Install a specific Node major version
sudo NODE_MAJOR=20 bash install.sh

# Skip changing the hostname (reach it via <pi-hostname>.local or its IP)
sudo APP_HOSTNAME= bash install.sh
```

The installer is **idempotent** — re-run it any time (e.g. after `git pull`) to
rebuild and restart with the latest code.

### Managing the service

```bash
sudo systemctl status billsplitter     # is it running?
journalctl -u billsplitter -f          # live logs
sudo systemctl restart billsplitter    # restart
sudo systemctl stop billsplitter       # stop
```

### Updating

The frontend build (`dist/`) is committed to the repo, so updating the Pi is
just a pull + restart:

```bash
cd billsplitter
git pull
sudo systemctl restart billsplitter
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

- **Names** — set both flatmates' names in the *Names* card on the generator
  page; they're used across the app and on the invoice.
- **Bank details** — fill in the *Bank Details* card; they appear on the
  invoice so the other flatmate knows where to send money. (The defaults are
  placeholders.)
- **Bills** — edit the bill names/amounts on the generator page.

## Password

- The password for the main page is stored in **`password.txt`** in the project
  folder. It is created automatically on first run with the default
  `change-me`.
- To change it, edit the file and restart the service:

  ```bash
  nano password.txt
  sudo systemctl restart billsplitter
  ```

- `password.txt` is **git-ignored**, so it is never uploaded to GitHub and each
  deployment keeps its own password.
- The per-flatmate pages (`/flatmate2`) are deliberately reachable without the
  password so you can share the link; don't expose the app beyond your LAN.

---

## Data & backups

The app stores everything in the project folder as plain files (all git-ignored):

- `draft.json` — the current in-progress invoice
- `history.json` — saved past invoices
- `password.txt` — the login password

To back up, copy those files somewhere safe — or use **History → Export CSV**
from the app, which downloads the whole history as a spreadsheet-friendly file
that can be re-imported with **Import CSV** (it merges by invoice id).

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
src/                   React source
  api.js               Frontend API client
  App.jsx              Routes (main page is wrapped in the password gate)
  pages/               MainPage (generator + history), UserExtrasPage
  components/          InvoiceForm, InvoicePreview, InvoiceHistory, pickers, charts
  utils/
    calculations.js    Bill-splitting math (packs × price, per-item split %)
    historyCsv.js      CSV export/import mapping
    invoicePng.js      Fixed-size PNG capture of the invoice
    defaults.js        Draft shape + placeholder defaults
dist/                  Production build output (committed so the Pi needn't build)
```

---

## Notes

- **Port 80** requires elevated privileges. The systemd service grants the
  `CAP_NET_BIND_SERVICE` capability so it can bind port 80 without running as
  root.
- **`billsplitter.local`** resolution relies on **mDNS/Bonjour** (Avahi on the
  Pi). Most phones, Macs, and modern Windows machines support it out of the box.
  If a device can't resolve it, use the Pi's IP address instead
  (`hostname -I` on the Pi).
- This app is intended for a trusted home LAN. Traffic is plain HTTP and the
  data API endpoints are not individually authenticated — do not port-forward
  it to the internet.
