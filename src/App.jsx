import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import InvoicesPage from './pages/InvoicesPage';
import MainPage from './pages/MainPage';
import RentPage from './pages/RentPage';
import ServerStatusPage from './pages/ServerStatusPage';
import SettingsPage from './pages/SettingsPage';
import UserExtrasPage from './pages/UserExtrasPage';
import PasswordGate from './components/PasswordGate';
import DialogHost from './components/Dialog';
import { getPanelSettings } from './api';
import { applyPanelSettings } from './utils/panelSettings';
import { playAdd, playRemove, playTick } from './utils/sound';

function App() {
  // Panel settings (currency, per-app password locks) are applied before
  // the routes render, so no page ever flashes the wrong currency or asks
  // for a password it shouldn't. A failed fetch falls back to the defaults
  // (everything locked, £) — same as before the settings doc existed.
  const [settingsReady, setSettingsReady] = useState(false);
  useEffect(() => {
    getPanelSettings()
      .then((s) => applyPanelSettings(s))
      .catch(() => {})
      .finally(() => setSettingsReady(true));
  }, []);
  // One delegated listener gives every button/tab a click sound without
  // wiring each component: danger buttons fall, primary buttons rise,
  // everything else ticks. Bigger moments (save success, errors) play
  // their own sounds where they happen.
  useEffect(() => {
    const onClick = (e) => {
      const el = e.target.closest?.('button, .tab');
      if (!el || el.disabled) return;
      if (el.classList.contains('btn-danger') || el.classList.contains('btn-icon-danger')) playRemove();
      else if (el.classList.contains('btn-primary')) playAdd();
      else playTick();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return (
    <BrowserRouter>
      {/* Lava-lamp underlay behind every page: neon blobs that rise, sink
          and sway on independent periods. Purely decorative, fixed and
          non-interactive. */}
      <div className="app-underlay" aria-hidden="true">
        <span className="lava lava-1"><span className="lava-blob" /></span>
        <span className="lava lava-2"><span className="lava-blob" /></span>
        <span className="lava lava-3"><span className="lava-blob" /></span>
        <span className="lava lava-4"><span className="lava-blob" /></span>
        <span className="lava lava-5"><span className="lava-blob" /></span>
        <span className="underlay-grain" />
      </div>
      {settingsReady && <Routes>
        {/* FlatBrain dashboard — the hub; its tiles are picked in Settings */}
        <Route path="/" element={<PasswordGate pageKey="dashboard"><DashboardPage /></PasswordGate>} />

        {/* Bill Splitter app. Every page has its own lock; flatmate 2's
            defaults open so the page stays shareable until locked. */}
        <Route path="/billsplitter" element={<PasswordGate pageKey="billsplitter"><MainPage /></PasswordGate>} />
        <Route path="/billsplitter/flatmate1" element={<PasswordGate pageKey="flatmate1"><UserExtrasPage personKey="matias" /></PasswordGate>} />
        <Route path="/billsplitter/flatmate2" element={<PasswordGate pageKey="flatmate2"><UserExtrasPage personKey="reka" /></PasswordGate>} />

        {/* Rent — the tenancy schedule and its per-period invoices */}
        <Route path="/rent" element={<PasswordGate pageKey="rent"><RentPage /></PasswordGate>} />

        {/* Custom invoice generator — itemized invoices with a paid history */}
        <Route path="/invoices" element={<PasswordGate pageKey="invoices"><InvoicesPage /></PasswordGate>} />

        {/* Settings — panel-wide information the apps share */}
        <Route path="/settings" element={<PasswordGate pageKey="settings"><SettingsPage /></PasswordGate>} />

        {/* Server status — live stats for the Pi this panel runs on */}
        <Route path="/status" element={<PasswordGate pageKey="status"><ServerStatusPage /></PasswordGate>} />

        {/* Legacy paths from the single-app era keep old bookmarks working */}
        <Route path="/flatmate1" element={<Navigate to="/billsplitter/flatmate1" replace />} />
        <Route path="/flatmate2" element={<Navigate to="/billsplitter/flatmate2" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>}
      <DialogHost />
    </BrowserRouter>
  );
}

export default App;
