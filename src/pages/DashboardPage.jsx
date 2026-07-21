import React from 'react';
import { Link } from 'react-router-dom';
import { Activity, FileText, KeyRound, Receipt, ArrowRight } from 'lucide-react';
import Navigation from '../components/Navigation';

// FlatBrain home: the launcher for every app the flat runs. Each tile is an
// app; adding a future app = adding one entry here plus its routes.
const APPS = [
  {
    key: 'billsplitter',
    name: 'Bill Splitter',
    to: '/billsplitter',
    icon: Receipt,
    accent: 'lime',
    description: 'Split bills and expenses for the flat.'
  },
  {
    key: 'rent',
    name: 'Rent',
    to: '/rent',
    icon: KeyRound,
    accent: 'lime',
    description: 'Track the tenancy and invoice each rent period.'
  },
  {
    key: 'invoices',
    name: 'Invoice generator',
    to: '/invoices',
    icon: FileText,
    accent: 'pink',
    description: 'Generate custom one-off invoices.'
  },
  {
    key: 'status',
    name: 'Server status',
    to: '/status',
    icon: Activity,
    accent: 'blue',
    description: 'View server stats and control backups.'
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
        {APPS.map(({ key, name, to, icon: Icon, accent, description }) => (
          <div className={`glass-panel app-tile app-tile-${accent}`} key={key}>
            <Link to={to} className="app-tile-main">
              <span className="app-tile-icon"><Icon size={26} /></span>
              <span className="app-tile-text">
                <span className="app-tile-name">{name}</span>
                <span className="app-tile-desc">{description}</span>
              </span>
              <ArrowRight size={18} className="app-tile-arrow" />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
