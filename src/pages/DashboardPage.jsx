import React from 'react';
import { Link } from 'react-router-dom';
import { Receipt, Sparkles, ArrowRight } from 'lucide-react';
import Navigation from '../components/Navigation';

// FlatBrain home: the launcher for every app the flat runs. Each tile is an
// app; adding a future app = adding one entry here plus its routes.
const APPS = [
  {
    key: 'billsplitter',
    name: 'Bill Splitter',
    to: '/billsplitter',
    icon: Receipt,
    accent: 'lime'
  }
];

export default function DashboardPage() {
  return (
    <div className="container container-narrow animate-fade-in">
      <Navigation showTabs={false} />

      <div className="page-header">
        <h1>FlatBrain</h1>
        <p className="text-muted">Everything your flat runs, in one place.</p>
      </div>

      <div className="app-grid">
        {APPS.map(({ key, name, to, icon: Icon, accent }) => (
          <div className={`glass-panel app-tile app-tile-${accent}`} key={key}>
            <Link to={to} className="app-tile-main">
              <span className="app-tile-icon"><Icon size={26} /></span>
              <span className="app-tile-text">
                <span className="app-tile-name">{name}</span>
              </span>
              <ArrowRight size={18} className="app-tile-arrow" />
            </Link>
          </div>
        ))}

        <div className="glass-panel app-tile app-tile-soon" aria-disabled="true">
          <div className="app-tile-main">
            <span className="app-tile-icon"><Sparkles size={26} /></span>
            <span className="app-tile-text">
              <span className="app-tile-name">More apps soon</span>
              <span className="app-tile-desc">Chores, shopping list, meter readings… whatever the flat needs next.</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
