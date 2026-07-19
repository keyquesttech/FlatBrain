import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainPage from './pages/MainPage';
import UserExtrasPage from './pages/UserExtrasPage';
import PasswordGate from './components/PasswordGate';
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
      {/* Ambient underlay behind every page: slow-drifting neon orbs and a
          faint grain wash. Purely decorative, fixed and non-interactive. */}
      <div className="app-underlay" aria-hidden="true">
        <span className="underlay-orb underlay-orb-lime" />
        <span className="underlay-orb underlay-orb-pink" />
        <span className="underlay-orb underlay-orb-blue" />
        <span className="underlay-grain" />
      </div>
      <Routes>
        <Route path="/" element={<PasswordGate><MainPage /></PasswordGate>} />
        <Route path="/flatmate1" element={<PasswordGate><UserExtrasPage personKey="matias" /></PasswordGate>} />
        <Route path="/flatmate2" element={<UserExtrasPage personKey="reka" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
