import React, { forwardRef } from 'react';
import { formatCurrency, parseAmount } from '../utils/calculations';
import { formatDay, monthsOf, periodLabel, periodTotal, rentTotals } from '../utils/rent';
import { DEFAULT_BANK } from '../utils/defaults';

// The Rent app's invoice, built from the same frame and cards as Bill
// Splitter's so it downloads through the identical PNG capture path.
// Every rent payment is itemized: period, block size × monthly amount,
// due date and paid status.
const RentInvoicePreview = forwardRef(({ rent, bank }, ref) => {
  const bankDetails = { ...DEFAULT_BANK, ...(bank || {}) };
  const totals = rentTotals(rent);
  const payments = rent.payments || [];
  const nextUnpaid = payments
    .filter((p) => !p.paidDate && p.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  const outstandingParts = [];
  if (totals.rentOutstanding > 0) outstandingParts.push(`${formatCurrency(totals.rentOutstanding)} rent`);
  if (totals.depositOutstanding > 0) outstandingParts.push(`${formatCurrency(totals.depositOutstanding)} deposit`);

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
          <h2>{rent.name?.trim() || 'Rent'}</h2>
          <div className="text-muted invoice-meta">
            <span>Issued on: <strong>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></span>
          </div>
        </div>

        <div className="invoice-section">
          <div className="due-card due-card-bills">
            <div className="due-card-name">Tenancy</div>
            <div className="due-line">
              <span>Monthly rent</span>
              <span>{formatCurrency(rent.monthlyAmount)}</span>
            </div>
            {parseAmount(rent.deposit?.amount) > 0 && (
              <div className="due-item">
                <div className="due-line">
                  <span>Deposit</span>
                  <span>{formatCurrency(rent.deposit.amount)}</span>
                </div>
                <div className="due-item-sub">
                  {rent.deposit.paidDate ? `Paid ${formatDay(rent.deposit.paidDate)}` : 'Not paid yet'}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="invoice-section">
          <div className="due-card due-card-summary due-card-summary-reka">
            <div className="due-card-name">Rent Payments</div>
            {payments.length === 0 && (
              <div className="due-item-sub">No payments scheduled yet.</div>
            )}
            {payments.map((p) => (
              <div className="due-item" key={p.id}>
                <div className="due-line">
                  <span>{periodLabel(p.periodStart, p.months) || 'Period'} ({monthsOf(p)} × {formatCurrency(p.amount)})</span>
                  <span>{formatCurrency(periodTotal(p))}</span>
                </div>
                <div className="due-item-sub">
                  Due {formatDay(p.dueDate) || '—'} — {p.paidDate ? `paid ${formatDay(p.paidDate)}` : 'not paid yet'}
                </div>
              </div>
            ))}
            <div className="due-card-total due-card-total-secondary due-card-total-first">
              <span>Paid so far</span>
              <span>{formatCurrency(totals.paidTotal)}</span>
            </div>
            <div className="due-card-total due-card-total-secondary">
              <span>Schedule total</span>
              <span>{formatCurrency(totals.scheduleTotal)}</span>
            </div>
            <div className="due-card-total">
              <span>Rent outstanding</span>
              <span>{formatCurrency(totals.rentOutstanding)}</span>
            </div>
          </div>

          <div className="due-card due-card-total-grand">
            <div className="due-card-total grand-total-line">
              <span>Total outstanding</span>
              <span className="grand-total-amount">{formatCurrency(totals.totalOutstanding)}</span>
            </div>
            <div className="due-item-sub">
              {outstandingParts.length > 0 ? outstandingParts.join(' + ') : 'Everything on the schedule is paid'}
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
          <p>Please send the outstanding amount to the account above.</p>
          {nextUnpaid && (
            <p className="invoice-due-date">
              Next payment due: {formatDay(nextUnpaid.dueDate)} ({periodLabel(nextUnpaid.periodStart, nextUnpaid.months)})
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

export default RentInvoicePreview;
