import React from 'react';
import Navigation from '../components/Navigation';
import AppTileGrid from '../components/AppTileGrid';
import { PAGE_TILES } from '../utils/pageTiles';

// FlatBrain home: the password-side launcher with a tile per app. The
// guest-facing sibling is the custom hub at /hub, whose tiles are picked
// in Settings.
export default function DashboardPage() {
  return (
    <div className="container container-narrow animate-fade-in">
      <Navigation showTabs={false} />

      <div className="page-header">
        <h1>FlatBrain</h1>
        <p className="text-muted">Everything your flat runs, in one place.</p>
      </div>

      <AppTileGrid tiles={PAGE_TILES.filter((t) => t.appTile)} />
    </div>
  );
}
