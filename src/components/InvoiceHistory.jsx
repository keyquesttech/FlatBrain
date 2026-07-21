import React from 'react';
import { calculateInvoice, formatCurrency } from '../utils/calculations';
import { Trash2, Download } from 'lucide-react';
import { DEFAULT_NAMES, normalizeDraft } from '../utils/defaults';
import PaidControl from './PaidControl';

function formatPeriod(period) {
  if (!period) return 'No period';
  const d = new Date(period + '-01T00:00:00Z');
  return isNaN(d) ? period : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export default function InvoiceHistory({ invoices, onDelete, onLoad, onDownload, onMarkPaid, downloadingId }) {
  if (!invoices || invoices.length === 0) {
    return (
      <div className="glass-panel empty-state">
        <h2>No invoices yet</h2>
        <p className="text-muted">Invoices you download &amp; save will appear here.</p>
      </div>
    );
  }

  return (
    <div className="history-grid">
      {invoices.map((invoice) => {
        const names = { ...DEFAULT_NAMES, ...(invoice.names || {}) };
        // Recomputed from the invoice's own data (like PNG re-downloads),
        // so every card shows the current settlement semantics — the dues
        // stored on old invoices predate the transfer-amount model.
        const calc = calculateInvoice(normalizeDraft(invoice));
        return (
          <div key={invoice.id} className="glass-panel history-card" onClick={() => onLoad(invoice)}>
            <div className="history-card-head">
              <div>
                <h3 className="history-card-title">{formatPeriod(invoice.period)}</h3>
                <div className="text-muted history-card-date">
                  Saved {new Date(invoice.timestamp).toLocaleDateString('en-GB')}
                </div>
              </div>
              <div className="history-card-actions">
                <button
                  className="btn-icon"
                  onClick={(e) => { e.stopPropagation(); onDownload(invoice); }}
                  disabled={downloadingId === invoice.id}
                  title="Download this invoice as PNG"
                  aria-label="Download this invoice as PNG"
                >
                  <Download size={16} />
                </button>
                <button
                  className="btn-icon btn-icon-danger"
                  onClick={(e) => { e.stopPropagation(); onDelete(invoice.id); }}
                  title="Delete invoice"
                  aria-label="Delete invoice"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="history-card-totals">
              <div className="history-total-row">
                <span className="text-muted">Grand total</span>
                <span className="history-total-value">{formatCurrency(calc.grandTotal)}</span>
              </div>
              <div className="history-total-row">
                <span className="text-muted">{names.matias} due</span>
                <span className="history-total-due">{formatCurrency(calc.matiasEffectiveDue)}</span>
              </div>
              <div className="history-total-row">
                <span className="text-muted">{names.reka} due</span>
                <span className="history-total-due">{formatCurrency(calc.netTransfer)}</span>
              </div>
            </div>

            {/* Marking paid stamps the invoice (preview + downloads alike) */}
            <div className="history-paid-row" onClick={(e) => e.stopPropagation()}>
              <PaidControl
                paidDate={invoice.paidDate || ''}
                onChange={(d) => onMarkPaid(invoice, d)}
              />
            </div>

            <div className="history-card-hint text-muted">Tap to load into the generator</div>
          </div>
        );
      })}
    </div>
  );
}
