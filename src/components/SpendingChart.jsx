import React from 'react';

function billsTotalOf(invoice) {
  const parse = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };
  return (invoice.bills || []).reduce((sum, b) => (b.discounted ? sum : sum + parse(b.amount)), 0);
}

export default function SpendingChart({ history }) {
  // One point per period; if a month was saved more than once, the latest wins.
  const byPeriod = {};
  (history || []).forEach((inv) => {
    if (!inv.period) return;
    const existing = byPeriod[inv.period];
    if (!existing || (inv.timestamp || 0) > (existing.timestamp || 0)) {
      byPeriod[inv.period] = inv;
    }
  });

  const points = Object.values(byPeriod)
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-6)
    .map((inv) => ({
      period: inv.period,
      label: new Date(inv.period + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      value: billsTotalOf(inv)
    }));

  if (points.length === 0) {
    return null;
  }

  const max = Math.max(...points.map((p) => p.value), 1);

  return (
    <div className="spend-chart">
      {points.map((p) => (
        <div className="spend-bar-col" key={p.period}>
          <div className="spend-bar-value">£{p.value.toFixed(0)}</div>
          <div className="spend-bar-track">
            <div className="spend-bar-fill" style={{ height: `${(p.value / max) * 100}%` }} />
          </div>
          <div className="spend-bar-label">{p.label}</div>
        </div>
      ))}
    </div>
  );
}
