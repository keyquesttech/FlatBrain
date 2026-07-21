import React, { forwardRef } from 'react';
import { formatCurrency, parseAmount, round2 } from '../utils/calculations';
import { formatDay, formatPeriod, periodUnitsLabel } from '../utils/dates';
import { DEFAULT_BANK } from '../utils/defaults';

// The Rent app's invoice, built from the same frame and cards as Bill
// Splitter's so it downloads through the identical PNG capture path.
// `doc` is either the live draft (lodger, tenancy, the ticked payment
// periods) or a history snapshot, in which case generatedAt fixes the
// issued date.
const RentInvoicePreview = forwardRef(({ doc }, ref) => {
  const bankDetails = { ...DEFAULT_BANK, ...(doc.bankDetails || {}) };
  const items = doc.items || [];
  const total = items.reduce((sum, p) => round2(sum + round2(parseAmount(p.amount))), 0);
  const nextUnpaid = items
    .filter((p) => !p.paymentDate && p.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const issued = doc.generatedAt ? new Date(doc.generatedAt) : new Date();
  const tenancy = formatPeriod(doc.startDate, doc.endDate);

  return (
    <div className="invoice-frame" ref={ref} id="rent-invoice-preview">
      {/* Animated on screen only — the PNG capture removes this whole
          layer, so downloads stay static and identical everywhere */}
      <div className="invoice-orb-layer" aria-hidden="true">
        <span className="invoice-lava invoice-lava-lime"><span className="invoice-orb invoice-orb-lime" /></span>
        <span className="invoice-lava invoice-lava-pink"><span className="invoice-orb invoice-orb-pink" /></span>
        <span className="invoice-lava invoice-lava-bubble"><span className="invoice-orb invoice-orb-bubble" /></span>
      </div>
      <div className="invoice-card">
        <div className="invoice-header">
          <h2>{doc.lodger?.trim() ? `${doc.lodger.trim()} — Rent` : 'Rent'}</h2>
          <div className="text-muted invoice-meta">
            <span>Issued on: <strong>{issued.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></span>
          </div>
        </div>

        {(tenancy || parseAmount(doc.deposit) > 0) && (
          <div className="invoice-section">
            <div className="due-card due-card-bills">
              <div className="due-card-name">Tenancy</div>
              {tenancy && (
                <div className="due-line due-line-text">
                  <span>Period:</span>
                  <span>{tenancy}</span>
                </div>
              )}
              {parseAmount(doc.deposit) > 0 && (
                <div className="due-line">
                  <span>Deposit</span>
                  <span>{formatCurrency(doc.deposit)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="invoice-section">
          <div className="due-card due-card-summary due-card-summary-reka">
            <div className="due-card-name">Rent Payments</div>
            {items.length === 0 && (
              <div className="due-item-sub">No periods on this invoice yet — tick them in the payments list.</div>
            )}
            {items.map((p) => (
              <div className="due-item" key={p.id}>
                <div className="due-line">
                  <span>
                    {formatPeriod(p.periodFrom, p.periodTo) || 'Period'}
                    {periodUnitsLabel(p.periodFrom, p.periodTo, doc.unitPeriod) ? ` (${periodUnitsLabel(p.periodFrom, p.periodTo, doc.unitPeriod)})` : ''}
                  </span>
                  <span>{formatCurrency(p.amount)}</span>
                </div>
                <div className="due-item-sub">
                  {p.dueDate ? `Due ${formatDay(p.dueDate)}` : 'No due date'}
                  {p.paymentDate ? ` — paid ${formatDay(p.paymentDate)}` : ' — not paid yet'}
                </div>
              </div>
            ))}
          </div>

          <div className="due-card due-card-total-grand">
            <div className="due-card-total grand-total-line">
              <span>Total due</span>
              <span className="grand-total-amount">{formatCurrency(total)}</span>
            </div>
            <div className="due-item-sub">
              {items.length} period{items.length === 1 ? '' : 's'} on this invoice
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
          <p>Thank you for keeping the rent on schedule!</p>
          <p>Please send the total due to the account above.</p>
          {nextUnpaid && (
            <p className="invoice-due-date">
              Due by: {new Date(nextUnpaid.dueDate + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

export default RentInvoicePreview;
