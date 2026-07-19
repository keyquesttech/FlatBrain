import React, { useMemo } from 'react';
import { calculateInvoice, formatCurrency } from '../utils/calculations';
import { normalizeDraft } from '../utils/defaults';

function monthLabel(period) {
  const d = new Date(period + '-01T00:00:00Z');
  return isNaN(d) ? period : d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

// Signed £ difference for the sub-line, penny-rounded: "+£12.40" / "−£3.10".
function fmtDiff(diff) {
  if (Math.abs(diff) < 0.005) return '±£0.00';
  return `${diff > 0 ? '+' : '−'}${formatCurrency(Math.abs(diff))}`;
}

// Invoice card comparing this month's bills + extras against the previous
// (up to) three saved months, so the invoice itself shows whether household
// spending is going up or down. Past months are recomputed from their own
// data — same as the history cards — and only months BEFORE the invoice's
// period count, so re-downloads of old invoices show the trend as it was.
// Renders nothing when there are no earlier months to compare against.
export default function SpendingTrendCard({ history, currentCalc, currentPeriod }) {
  const past = useMemo(() => {
    const byPeriod = {};
    (history || []).forEach((inv) => {
      if (!inv.period) return;
      if (currentPeriod && inv.period >= currentPeriod) return;
      const existing = byPeriod[inv.period];
      if (!existing || (inv.timestamp || 0) > (existing.timestamp || 0)) byPeriod[inv.period] = inv;
    });
    return Object.values(byPeriod)
      .sort((a, b) => a.period.localeCompare(b.period))
      .slice(-3)
      .map((inv) => {
        const calc = calculateInvoice(normalizeDraft(inv));
        return {
          period: inv.period,
          label: monthLabel(inv.period),
          bills: calc.billsTotal,
          extras: calc.extrasTotal,
          grand: calc.grandTotal
        };
      });
  }, [history, currentPeriod]);

  if (past.length === 0) return null;

  const columns = [
    ...past,
    {
      period: currentPeriod || 'current',
      label: currentPeriod ? monthLabel(currentPeriod) : 'Now',
      bills: currentCalc.billsTotal,
      extras: currentCalc.extrasTotal,
      grand: currentCalc.grandTotal,
      current: true
    }
  ];
  const max = Math.max(...columns.map((c) => c.grand), 1);

  const avg = past.reduce((s, m) => s + m.grand, 0) / past.length;
  const avgBills = past.reduce((s, m) => s + m.bills, 0) / past.length;
  const avgExtras = past.reduce((s, m) => s + m.extras, 0) / past.length;
  const diff = currentCalc.grandTotal - avg;
  const direction = diff > 0.005 ? 'up' : diff < -0.005 ? 'down' : 'level';
  const avgLabel = past.length === 1 ? 'last month' : `the last ${past.length} months' average`;
  const changeLabel = avg > 0
    ? `${Math.round((Math.abs(diff) / avg) * 100)}%`
    : formatCurrency(Math.abs(diff));

  return (
    <div className="due-card due-card-trend">
      <div className="due-card-name">Spending Trend</div>
      <div className="spend-chart trend-chart">
        {columns.map((c) => (
          <div className={`spend-bar-col${c.current ? ' trend-col-current' : ''}`} key={c.period}>
            <div className="spend-bar-value">£{c.grand.toFixed(0)}</div>
            <div className="spend-bar-track">
              <div className="spend-bar-stack" style={{ height: `${(c.grand / max) * 100}%` }}>
                {c.extras > 0 && (
                  <div className="spend-stack-seg trend-seg-extras" style={{ height: `${(c.extras / (c.grand || 1)) * 100}%` }} />
                )}
                {c.bills > 0 && (
                  <div className="spend-stack-seg trend-seg-bills" style={{ height: `${(c.bills / (c.grand || 1)) * 100}%` }} />
                )}
              </div>
            </div>
            <div className="spend-bar-label">{c.current ? `${c.label} · now` : c.label}</div>
          </div>
        ))}
      </div>
      <div className="chart-legend trend-legend">
        <div className="chart-legend-item">
          <span className="chart-legend-swatch" style={{ background: '#5fb2ff' }} />
          Bills
        </div>
        <div className="chart-legend-item">
          <span className="chart-legend-swatch" style={{ background: '#ff5fd4' }} />
          Extras
        </div>
      </div>
      <div className={`trend-headline trend-${direction}`}>
        {direction === 'up' && `▲ ${changeLabel} above ${avgLabel} (${formatCurrency(avg)})`}
        {direction === 'down' && `▼ ${changeLabel} below ${avgLabel} (${formatCurrency(avg)})`}
        {direction === 'level' && `● Level with ${avgLabel} (${formatCurrency(avg)})`}
      </div>
      <div className="due-item-sub">
        Bills {fmtDiff(currentCalc.billsTotal - avgBills)} · Extras {fmtDiff(currentCalc.extrasTotal - avgExtras)} vs {avgLabel}
      </div>
    </div>
  );
}
