import React from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_NAMES } from '../utils/defaults';

export default function Navigation({ activeTab, names = DEFAULT_NAMES }) {
  const tabs = [
    { id: 'generator', to: '/', label: 'Generator' },
    { id: 'history', to: '/?view=history', label: 'History' },
    { id: 'flatmate1', to: '/flatmate1', label: names.flatmate1?.trim() || 'Flatmate 1' },
    { id: 'flatmate2', to: '/flatmate2', label: names.flatmate2?.trim() || 'Flatmate 2' }
  ];

  return (
    <header className="nav-header">
      <Link to="/" className="nav-brand">
        <span className="brand-icon" aria-hidden="true">£</span>
        <span className="brand-title">Bill Splitter</span>
      </Link>

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
