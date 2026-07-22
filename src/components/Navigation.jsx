import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { House, Volume2, VolumeX } from 'lucide-react';
import { flatmateNames } from '../utils/panelSettings';
import { soundEnabled, setSoundEnabled, playTick } from '../utils/sound';

// FlatBrain header. The brand always links home to the dashboard; app pages
// show their app's name next to it plus that app's tabs (showTabs=false on
// the dashboard itself). Apps other than Bill Splitter pass their own
// `customTabs` [{ id, label, active, onClick }] to get the same tab pill
// in the same place.
export default function Navigation({ activeTab, names = flatmateNames(), showTabs = true, appLabel, customTabs }) {
  const [sound, setSound] = useState(soundEnabled);

  const toggleSound = () => {
    const next = !sound;
    setSoundEnabled(next);
    setSound(next);
    if (next) playTick(); // audible confirmation only when turning ON
  };

  const tabs = [
    { id: 'generator', to: '/billsplitter', label: 'Generator' },
    { id: 'history', to: '/billsplitter?view=history', label: 'History' },
    { id: 'flatmate1', to: '/billsplitter/flatmate1', label: names.matias?.trim() || 'Flatmate 1' },
    { id: 'flatmate2', to: '/billsplitter/flatmate2', label: names.reka?.trim() || 'Flatmate 2' }
  ];

  return (
    <header className="nav-header">
      <div className="nav-brand-row">
        <Link to="/" className="nav-brand" title="FlatBrain — all apps">
          <span className="brand-icon" aria-hidden="true"><House size={20} strokeWidth={2.5} /></span>
          <span className="brand-title">FlatBrain</span>
        </Link>
        {appLabel && <span className="brand-app">{appLabel}</span>}
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

      {customTabs ? (
        <nav className="tabs" aria-label="Main">
          {customTabs.map(({ id, label, active, onClick }) => (
            <button key={id} type="button" className={`tab ${active ? 'active' : ''}`} onClick={onClick}>
              <span>{label}</span>
            </button>
          ))}
        </nav>
      ) : showTabs && (
        <nav className="tabs" aria-label="Main">
          {tabs.map(({ id, to, label }) => (
            <Link key={id} to={to} className={`tab ${activeTab === id ? 'active' : ''}`} id={`nav-${id}`}>
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
