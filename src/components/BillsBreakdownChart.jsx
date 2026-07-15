import React from 'react';

const COLORS = ['#d4ff3f', '#ff5fd4', '#5fb2ff', '#ffc850', '#a78bfa', '#4bd6b6', '#ff8a5f', '#8ee06a'];

function parseAmt(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

export default function BillsBreakdownChart({ history, months }) {
  // One invoice per period; if a month was saved more than once, the latest wins.
  const byPeriod = {};
  (history || []).forEach((inv) => {
    if (!inv.period) return;
    const existing = byPeriod[inv.period];
    if (!existing || (inv.timestamp || 0) > (existing.timestamp || 0)) {
      byPeriod[inv.period] = inv;
    }
  });

  let periods = Object.values(byPeriod).sort((a, b) => a.period.localeCompare(b.period));
  if (months && months > 0) periods = periods.slice(-months);

  if (periods.length === 0) {
    return null;
  }

  // Collect bill categories (in order of first appearance) and per-month totals.
  const categories = [];
  const monthData = periods.map((inv) => {
    const totals = {};
    (inv.bills || []).forEach((b) => {
      if (b.discounted) return;
      const name = (b.thing || '').trim() || 'Unnamed';
      totals[name] = (totals[name] || 0) + parseAmt(b.amount);
      if (!categories.includes(name)) categories.push(name);
    });
    return {
      period: inv.period,
      label: new Date(inv.period + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      totals,
      total: Object.values(totals).reduce((s, v) => s + v, 0)
    };
  });

  const colorFor = (name) => COLORS[categories.indexOf(name) % COLORS.length];
  const max = Math.max(...monthData.map((m) => m.total), 1);

  return (
    <div>
      <div className="spend-chart">
        {monthData.map((m) => (
          <div className="spend-bar-col" key={m.period}>
            <div className="spend-bar-value">£{m.total.toFixed(0)}</div>
            <div className="spend-bar-track">
              <div className="spend-bar-stack" style={{ height: `${(m.total / max) * 100}%` }}>
                {categories.filter((c) => m.totals[c]).map((c) => (
                  <div
                    key={c}
                    className="spend-stack-seg"
                    title={`${c}: £${m.totals[c].toFixed(2)}`}
                    style={{ height: `${(m.totals[c] / m.total) * 100}%`, background: colorFor(c) }}
                  />
                ))}
              </div>
            </div>
            <div className="spend-bar-label">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="chart-legend">
        {categories.map((c) => (
          <div className="chart-legend-item" key={c}>
            <span className="chart-legend-swatch" style={{ background: colorFor(c) }} />
            {c}
          </div>
        ))}
      </div>
    </div>
  );
}
