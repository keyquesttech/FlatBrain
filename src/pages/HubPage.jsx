import React from 'react';
import Navigation from '../components/Navigation';
import AppTileGrid from '../components/AppTileGrid';
import { pageTiles } from '../utils/pageTiles';
import { hubName, isOnHub } from '../utils/panelSettings';

// The custom hub: the password-free landing page, reached from the lock
// screen's Guest login. It carries the name picked in Settings and one
// tile per page ticked onto it — those pages open without the password.
export default function HubPage() {
  const tiles = pageTiles().filter(({ key }) => isOnHub(key));

  return (
    <div className="container container-narrow animate-fade-in">
      <Navigation showTabs={false} />

      <div className="page-header">
        <h1>{hubName()}</h1>
        <p className="text-muted">The flat's shared pages — no password needed.</p>
      </div>

      <AppTileGrid tiles={tiles} />

      {tiles.length === 0 && (
        <p className="text-muted section-desc">
          Nothing on the hub yet — pick pages in Settings → Custom hub.
        </p>
      )}
    </div>
  );
}
