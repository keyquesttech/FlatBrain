import { Activity, FileText, KeyRound, Receipt, Settings, User, UserRound } from 'lucide-react';
import { flatmateNames } from './panelSettings.js';

// Every page of the panel as a tile definition, shared by the dashboard
// (the password-side launcher, appTile entries only) and the custom hub
// (whatever pages Settings ticked onto it). A function, not a constant —
// the flatmate tiles carry the names picked in Settings. Adding a future
// app = one entry here plus its route and hub key.
export function pageTiles() {
  const names = flatmateNames();
  return [
    {
      key: 'billsplitter',
      appTile: true,
      name: 'Bill Splitter',
      to: '/billsplitter',
      icon: Receipt,
      accent: 'lime',
      description: 'Split bills and expenses for the flat.'
    },
    {
      key: 'flatmate1',
      appTile: false,
      name: `${names.matias}'s bills page`,
      to: '/billsplitter/flatmate1',
      icon: User,
      accent: 'lime',
      description: 'Add extras and see this month\'s share.'
    },
    {
      key: 'flatmate2',
      appTile: false,
      name: `${names.reka}'s bills page`,
      to: '/billsplitter/flatmate2',
      icon: UserRound,
      accent: 'lime',
      description: 'Add extras and see this month\'s share.'
    },
    {
      key: 'rent',
      appTile: true,
      name: 'Rent',
      to: '/rent',
      icon: KeyRound,
      accent: 'lime',
      description: 'Track the tenancy and invoice each rent period.'
    },
    {
      key: 'invoices',
      appTile: true,
      name: 'Invoice generator',
      to: '/invoices',
      icon: FileText,
      accent: 'pink',
      description: 'Generate custom one-off invoices.'
    },
    {
      key: 'settings',
      appTile: true,
      name: 'Settings',
      to: '/settings',
      icon: Settings,
      accent: 'blue',
      description: 'Manage app settings and information used.'
    },
    {
      key: 'status',
      appTile: true,
      name: 'Server status',
      to: '/status',
      icon: Activity,
      accent: 'blue',
      description: 'View server stats and control backups.'
    }
  ];
}
