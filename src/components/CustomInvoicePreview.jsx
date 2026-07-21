import React, { forwardRef } from 'react';
import { formatCurrency, parseAmount, round2 } from '../utils/calculations';
import { DEFAULT_BANK } from '../utils/defaults';

// A custom invoice, built from the same frame and cards as Bill Splitter's
// so it downloads through the identical PNG capture path. `doc` is either
// the live draft (title, due date, items) or a history snapshot, in which
// case generatedAt fixes the issued date.
const unitsOf = (i) => {
  const n = parseInt(i?.units, 10);
  return isNaN(n) || n < 1 ? 1 : n;
};

// Multi-unit lines read like Bill Splitter's extras: "Bulbs (2 × £7.50)";
// single-unit lines keep just their name.
function itemLabel(i) {
  const units = unitsOf(i);
  const name = i.thing?.trim() || 'Item';
  if (units === 1) return name;
  return `${name} (${units} × ${formatCurrency(parseAmount(i.amount) / units)})`;
}

const CustomInvoicePreview = forwardRef(({ doc }, ref) => {
  const bankDetails = { ...DEFAULT_BANK, ...(doc.bankDetails || {}) };
  const items = doc.items || [];
  const total = items.reduce((sum, i) => round2(sum + round2(parseAmount(i.amount))), 0);
  const issued = doc.generatedAt ? new Date(doc.generatedAt) : new Date();

  return (
    <div className="invoice-frame" ref={ref} id="custom-invoice-preview">
      {/* Animated on screen only — the PNG capture removes this whole
          layer, so downloads stay static and identical everywhere */}
      <div className="invoice-orb-layer" aria-hidden="true">
        <span className="invoice-lava invoice-lava-lime"><span className="invoice-orb invoice-orb-lime" /></span>
        <span className="invoice-lava invoice-lava-pink"><span className="invoice-orb invoice-orb-pink" /></span>
        <span className="invoice-lava invoice-lava-bubble"><span className="invoice-orb invoice-orb-bubble" /></span>
      </div>
      <div className="invoice-card">
        <div className="invoice-header">
          <h2>{doc.title?.trim() || 'Invoice'}</h2>
          <div className="text-muted invoice-meta">
            <span>Issued on: <strong>{issued.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></span>
          </div>
        </div>

        <div className="invoice-section">
          <div className="due-card due-card-summary due-card-summary-flatmate2">
            <div className="due-card-name">Items</div>
            {items.length === 0 && (
              <div className="due-item-sub">Nothing on this invoice yet — add items in the form.</div>
            )}
            {items.map((i) => (
              <div className="due-line" key={i.id}>
                <span>{itemLabel(i)}</span>
                <span>{formatCurrency(i.amount)}</span>
              </div>
            ))}
          </div>

          <div className="due-card due-card-total-grand">
            <div className="due-card-total grand-total-line">
              <span>Total due</span>
              <span className="grand-total-amount">{formatCurrency(total)}</span>
            </div>
            <div className="due-item-sub">
              {items.length} item{items.length === 1 ? '' : 's'} on this invoice
            </div>
          </div>
        </div>

        <div className="invoice-section">
          <div className="due-card due-card-bank">
            <div className="due-card-name">Bank Details</div>
            <div className="due-line due-line-text">
              <span>Name:</span>
              <span>{bankDetails.name}</span>
            </div>
            <div className="due-line due-line-text">
              <span>Bank name:</span>
              <span>{bankDetails.bankName}</span>
            </div>
            <div className="due-line due-line-text">
              <span>Sort code:</span>
              <span>{bankDetails.sortCode}</span>
            </div>
            <div className="due-line due-line-text">
              <span>Account number:</span>
              <span>{bankDetails.accountNumber}</span>
            </div>
          </div>
        </div>

        <div className="invoice-footer">
          <p>Thank you for settling this promptly!</p>
          <p>Please send the total due to the account above.</p>
          {doc.dueDate && (
            <p className="invoice-due-date">
              Due by: {new Date(doc.dueDate + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

export default CustomInvoicePreview;
