import React from 'react';
import { Link } from 'react-router-dom';
import { Activity, FileText, KeyRound, Receipt, Settings, User, UserRound, ArrowRight } from 'lucide-react';
import Navigation from '../components/Navigation';
import { isOnHub } from '../utils/panelSettings';
import { DEFAULT_NAMES } from '../utils/defaults';

// FlatBrain home: the hub for every app and page the flat runs. Which
// tiles actually show is picked in Settings (Hub tiles); locked pages
// still ask for the password when their tile is tapped. Adding a future
// app = one entry here plus its routes and its lock/hub keys.
const TILES = [
  {
    key: 'billsplitter',
    name: 'Bill Splitter',
    to: '/billsplitter',
    icon: Receipt,
    accent: 'lime',
    description: 'Split bills and expenses for the flat.'
  },
  {
    key: 'flatmate1',
    name: `${DEFAULT_NAMES.matias}'s bills page`,
    to: '/billsplitter/flatmate1',
    icon: User,
    accent: 'lime',
    description: 'Add extras and see this month\'s share.'
  },
  {
    key: 'flatmate2',
    name: `${DEFAULT_NAMES.reka}'s bills page`,
    to: '/billsplitter/flatmate2',
    icon: UserRound,
    accent: 'lime',
    description: 'Add extras and see this month\'s share.'
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
    key: 'settings',
    name: 'Settings',
    to: '/settings',
    icon: Settings,
    accent: 'blue',
    description: 'Manage app settings and information used.'
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
  const tiles = TILES.filter(({ key }) => isOnHub(key));

  return (
    <div className="container container-narrow animate-fade-in">
      <Navigation showTabs={false} />

      <div className="page-header">
        <h1>FlatBrain</h1>
        <p className="text-muted">Everything your flat runs, in one place.</p>
      </div>

      <div className="app-grid">
        {tiles.map(({ key, name, to, icon: Icon, accent, description }) => (
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

      {tiles.length === 0 && (
        <p className="text-muted section-desc">
          The hub is empty — pick some tiles in Settings.
        </p>
      )}
    </div>
  );
}
