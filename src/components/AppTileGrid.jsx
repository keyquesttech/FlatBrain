import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

// The dashboard/hub tile grid: one glass tile per page definition (see
// utils/pageTiles.js).
export default function AppTileGrid({ tiles }) {
  return (
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
  );
}
