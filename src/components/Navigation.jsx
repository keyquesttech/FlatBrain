import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Volume2, VolumeX } from 'lucide-react';
import { DEFAULT_NAMES } from '../utils/defaults';
import { soundEnabled, setSoundEnabled, playTick } from '../utils/sound';

export default function Navigation({ activeTab, names = DEFAULT_NAMES }) {
  const [sound, setSound] = useState(soundEnabled);

  const toggleSound = () => {
    const next = !sound;
    setSoundEnabled(next);
    setSound(next);
    if (next) playTick(); // audible confirmation only when turning ON
  };

  const tabs = [
    { id: 'generator', to: '/', label: 'Generator' },
    { id: 'history', to: '/?view=history', label: 'History' },
    { id: 'flatmate1', to: '/flatmate1', label: names.matias?.trim() || 'Flatmate 1' },
    { id: 'flatmate2', to: '/flatmate2', label: names.reka?.trim() || 'Flatmate 2' }
  ];

  return (
    <header className="nav-header">
      <div className="nav-brand-row">
        <Link to="/" className="nav-brand">
          <span className="brand-icon" aria-hidden="true">£</span>
          <span className="brand-title">Bill Splitter</span>
        </Link>
        <button
          type="button"
          className="btn-icon sound-toggle"
          onClick={toggleSound}
          title={sound ? 'Mute UI sounds' : 'Unmute UI sounds'}
          aria-label={sound ? 'Mute UI sounds' : 'Unmute UI sounds'}
          aria-pressed={sound}
        >
          {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
        </button>
      </div>

      <nav className="tabs" aria-label="Main">
        {tabs.map(({ id, to, label }) => (
          <Link key={id} to={to} className={`tab ${activeTab === id ? 'active' : ''}`} id={`nav-${id}`}>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </header>
  );
}
