import React, { forwardRef } from 'react';
import {
  billDiscountFrom,
  billDiscountPercent,
  calculateInvoice,
  discountAmount,
  extraPercent,
  extraShares,
  formatCurrency,
  formatExtraLabel,
  mergedExtras,
  parseAmount
} from '../utils/calculations';
import { DEFAULT_NAMES, DEFAULT_BANK } from '../utils/defaults';
import { formatDay } from '../utils/dates';
import SpendingTrendCard from './SpendingTrendCard';

const InvoicePreview = forwardRef(({ data, history = [] }, ref) => {
  const names = { ...DEFAULT_NAMES, ...(data.names || {}) };
  const bank = { ...DEFAULT_BANK, ...(data.bankDetails || {}) };

  const calc = calculateInvoice(data);
  const {
    splitPercent,
    billsTotal,
    matiasBillsShare,
    rekaBillsShare
  } = calc;
  const rekaPercent = Math.round((100 - splitPercent) * 100) / 100;
  const hasBillDiscounts = calc.billDiscountLines.length > 0;
  // Only 'All' discounts remove money from the bills total; bills discounted
  // for one flatmate are still charged in full (to the other flatmate).
  const hasWaivedBills = billsTotal !== calc.billsRawTotal;
  // Bills discounted for one flatmate are itemized on the other's card.
  const discountBillsPaidBy = (personKey) => {
    const otherKey = personKey === 'matias' ? 'reka' : 'matias';
    return calc.billDiscountLines.filter((line) => line.from === otherKey);
  };

  // Each person's itemized extras: their own share of items they added
  // (the item's %), plus the charged remainder of the other's items.
  // Zero-share lines are omitted. Amounts come from extraShares so the
  // lines sum to the card total exactly.
  const extraLinesFor = (personKey) => {
    const otherKey = personKey === 'matias' ? 'reka' : 'matias';
    return [
      ...mergedExtras(data, personKey).map((e) => {
        const { total, own, other } = extraShares(e);
        return {
          item: e,
          pct: extraPercent(e),
          total,
          amount: own,
          otherAmount: other,
          addedBy: names[personKey]
        };
      }),
      ...mergedExtras(data, otherKey).map((e) => {
        const { total, own, other } = extraShares(e);
        return {
          item: e,
          pct: Math.round((100 - extraPercent(e)) * 100) / 100,
          total,
          amount: other,
          otherAmount: own,
          addedBy: names[otherKey]
        };
      })
    ].filter((line) => line.pct > 0);
  };

  const dueSections = [
    {
      key: 'matias',
      name: names.matias,
      pct: splitPercent,
      otherName: names.reka,
      sharedShare: calc.matiasSharedShare,
      discountBills: discountBillsPaidBy('matias'),
      extraLines: extraLinesFor('matias'),
      before: calc.matiasBeforeDiscounts,
      discounts: data.matiasDiscounts || [],
      extrasShare: calc.matiasShareExtras,
      deductionsTotal: calc.matiasDeductionsTotal,
      dueTotal: calc.matiasEffectiveDue,
      note: data.matiasNote
    },
    {
      key: 'reka',
      name: names.reka,
      pct: rekaPercent,
      otherName: names.matias,
      sharedShare: calc.rekaSharedShare,
      discountBills: discountBillsPaidBy('reka'),
      extraLines: extraLinesFor('reka'),
      before: calc.rekaBeforeDiscounts,
      discounts: data.rekaDiscounts || [],
      extrasShare: calc.rekaShareExtras,
      deductionsTotal: calc.rekaDeductionsTotal,
      dueTotal: calc.netTransfer,
      note: data.rekaNote
    }
  ];

  const periodDate = data.period ? new Date(data.period + '-01T00:00:00Z') : null;
  const periodLabel = periodDate && !isNaN(periodDate)
    ? periodDate.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', timeZone: 'UTC' })
    : 'Monthly';

  return (
    <div className="invoice-frame" ref={ref} id="invoice-preview">
      {/* Animated on screen only — the PNG capture removes this whole
          layer, so downloads stay static and identical everywhere */}
      <div className="invoice-orb-layer" aria-hidden="true">
        <span className="invoice-lava invoice-lava-lime"><span className="invoice-orb invoice-orb-lime" /></span>
        <span className="invoice-lava invoice-lava-pink"><span className="invoice-orb invoice-orb-pink" /></span>
        <span className="invoice-lava invoice-lava-bubble"><span className="invoice-orb invoice-orb-bubble" /></span>
      </div>
      <div className="invoice-card">
      {/* Saved invoices marked as paid wear the same stamp as rent receipts */}
      {data.paidDate && (
        <div className="paid-stamp" aria-hidden="true">
          <span>
            PAID
            <span className="paid-stamp-date">{formatDay(data.paidDate)}</span>
          </span>
        </div>
      )}
      <div className="invoice-header">
        <h2>{periodLabel} Bills</h2>
        <div className="text-muted invoice-meta">
          <span>Issued on: <strong>{(data.timestamp ? new Date(data.timestamp) : new Date()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></span>
          {/* The meta row is space-between, so this sits at the right edge */}
          {data.paidDate ? (
            <span>Paid on: <strong>{new Date(data.paidDate + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong></span>
          ) : (
            <span>Payment due</span>
          )}
        </div>
      </div>

      <div className="invoice-section">
        <div className="due-card due-card-bills">
          <div className="due-card-name">Bills</div>
          {data.bills.map((bill) => {
            const from = billDiscountFrom(bill);
            const percent = billDiscountPercent(bill);
            const pctLabel = percent === 100 ? 'discounted' : `${percent}% discounted`;
            return (
              <div className={`due-line${from === 'na' && percent === 100 ? ' due-line-discounted' : ''}`} key={bill.id}>
                <span>
                  {bill.thing}
                  {from === 'na' ? ` · ${pctLabel}` : from ? ` · ${pctLabel} for ${names[from]}` : ''}
                </span>
                <span>{formatCurrency(bill.amount)}</span>
              </div>
            );
          })}
          <div className="due-card-total due-card-total-secondary due-card-total-first">
            <span>{names.matias} pays{hasBillDiscounts ? '' : ` (${splitPercent}%)`}</span>
            <span>{formatCurrency(matiasBillsShare)}</span>
          </div>
          <div className="due-card-total due-card-total-secondary">
            <span>{names.reka} pays{hasBillDiscounts ? '' : ` (${rekaPercent}%)`}</span>
            <span>{formatCurrency(rekaBillsShare)}</span>
          </div>
          <div className="due-card-total">
            <span>Bills total{hasWaivedBills ? ' (after discounts)' : ''}</span>
            <span>{formatCurrency(billsTotal)}</span>
          </div>
        </div>
      </div>

      <div className="invoice-section">
        {dueSections.map((person) => (
          <div className={`due-card due-card-summary due-card-summary-${person.key}`} key={person.key}>
            <div className="due-card-name">{person.name} Total</div>
            <div className="due-line">
              <span>Share of bills ({person.pct}%)</span>
              <span>{formatCurrency(person.sharedShare)}</span>
            </div>
            {person.discountBills.map((line) => (
              <div className="due-item" key={line.id}>
                <div className="due-line">
                  <span>{line.thing}{line.percent === 100 ? '' : ` · ${line.percent}% of ${formatCurrency(line.amount)}`}</span>
                  <span>{formatCurrency(line.portion)}</span>
                </div>
                <div className="due-item-sub">
                  Discounted for {names[line.from]} — {person.name} covers {line.percent === 100 ? 'it in full' : `${line.percent}%`}
                </div>
              </div>
            ))}
            {person.extraLines.map(({ item, pct, total, amount, otherAmount, addedBy }) => (
              <div className="due-item" key={item.id}>
                <div className="due-line">
                  <span>{formatExtraLabel(item)} · {`${pct}% of ${formatCurrency(total)}`}</span>
                  <span>{formatCurrency(amount)}</span>
                </div>
                <div className="due-item-sub">
                  Added by {addedBy} — {person.otherName} {`pays ${formatCurrency(otherAmount)}`}
                </div>
                {item.boughtDate && (
                  <div className="due-item-sub">
                    Bought on {new Date(item.boughtDate + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}
                  </div>
                )}
              </div>
            ))}
            {person.discounts.filter((d) => parseAmount(d.value) !== 0).map((d) => (
              <div className="due-line" key={d.id}>
                <span>{d.thing?.trim() || 'Discount'}{d.type === 'percent' ? ` (${parseAmount(d.value)}%)` : ''}</span>
                <span>−{formatCurrency(discountAmount(d, person.before))}</span>
              </div>
            ))}
            <div className="due-card-total due-card-total-secondary due-card-total-first">
              <span>Extras share</span>
              <span>{formatCurrency(person.extrasShare)}</span>
            </div>
            <div className="due-card-total due-card-total-secondary">
              <span>Net total</span>
              <span>{formatCurrency(person.before)}</span>
            </div>
            <div className="due-card-total">
              <span>Discounts total</span>
              <span>{person.deductionsTotal > 0 ? '−' : ''}{formatCurrency(person.deductionsTotal)}</span>
            </div>
            <div className="due-card-total due-card-total-secondary">
              <span>{person.name} total due</span>
              <span>{formatCurrency(person.dueTotal)}</span>
            </div>
            <div className="due-item-sub">The total amount to transfer</div>
          </div>
        ))}

        <div className="due-card due-card-total-grand">
          <div className="due-card-total grand-total-line">
            <span>Grand total (bills + all extras)</span>
            <span className="grand-total-amount">{formatCurrency(calc.grandTotal)}</span>
          </div>
          <div className="due-item-sub">
            Everything spent this month: {formatCurrency(billsTotal)} bills{calc.extrasTotal > 0 ? ` + ${formatCurrency(calc.extrasTotal)} extras` : ''}
          </div>
        </div>

        <SpendingTrendCard history={history} currentCalc={calc} currentPeriod={data.period} />

        {dueSections.filter((person) => person.note?.trim()).map((person) => (
          <div className={`due-card due-card-note due-card-note-${person.key}`} key={`${person.key}-note`}>
            <div className="due-card-name">{person.name} Note</div>
            <p className="due-note-text">{person.note}</p>
          </div>
        ))}
      </div>

      <div className="invoice-section">
        <div className="due-card due-card-bank">
          <div className="due-card-name">Bank Details</div>
          <div className="due-line due-line-text">
            <span>Name:</span>
            <span>{bank.name}</span>
          </div>
          <div className="due-line due-line-text">
            <span>Bank name:</span>
            <span>{bank.bankName}</span>
          </div>
          <div className="due-line due-line-text">
            <span>Sort code:</span>
            <span>{bank.sortCode}</span>
          </div>
          <div className="due-line due-line-text">
            <span>Account number:</span>
            <span>{bank.accountNumber}</span>
          </div>
        </div>
      </div>

      <div className="invoice-footer">
        <p>Thank you for settling the bills promptly!</p>
        <p>Please send your total due to the account above and remittance of payment via WhatsApp</p>
        {data.dueDate && (
          <p className="invoice-due-date">
            Due by: {new Date(data.dueDate + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}
          </p>
        )}
        {/* Spelled out as text — the invoice travels as a PNG, so a
            clickable link wouldn't survive the download */}
        <p className="invoice-legend">
          To add items to the invoice visit <strong><em>http://flatbrain.local/billsplitter/flatmate2</em></strong> while connected to the Wi-Fi in the flat.
        </p>
      </div>
      </div>
    </div>
  );
});

export default InvoicePreview;
