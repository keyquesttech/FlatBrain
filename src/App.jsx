import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import InvoicesPage from './pages/InvoicesPage';
import MainPage from './pages/MainPage';
import ServerStatusPage from './pages/ServerStatusPage';
import UserExtrasPage from './pages/UserExtrasPage';
import PasswordGate from './components/PasswordGate';
import DialogHost from './components/Dialog';
import { playAdd, playRemove, playTick } from './utils/sound';

function App() {
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
      <Routes>
        {/* FlatBrain dashboard — the app launcher */}
        <Route path="/" element={<PasswordGate><DashboardPage /></PasswordGate>} />

        {/* Bill Splitter app. Everything is password-gated except the
            flatmate 2 page, which is deliberately shareable. */}
        <Route path="/billsplitter" element={<PasswordGate><MainPage /></PasswordGate>} />
        <Route path="/billsplitter/flatmate1" element={<PasswordGate><UserExtrasPage personKey="matias" /></PasswordGate>} />
        <Route path="/billsplitter/flatmate2" element={<UserExtrasPage personKey="reka" />} />

        {/* Custom invoice generator — itemized invoices with a paid history */}
        <Route path="/invoices" element={<PasswordGate><InvoicesPage /></PasswordGate>} />

        {/* Server status — live stats for the Pi this panel runs on */}
        <Route path="/status" element={<PasswordGate><ServerStatusPage /></PasswordGate>} />

        {/* Legacy paths from the single-app era keep old bookmarks working */}
        <Route path="/flatmate1" element={<Navigate to="/billsplitter/flatmate1" replace />} />
        <Route path="/flatmate2" element={<Navigate to="/billsplitter/flatmate2" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <DialogHost />
    </BrowserRouter>
  );
}

export default App;
