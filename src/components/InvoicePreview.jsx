import React, { forwardRef } from 'react';
import {
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

const InvoicePreview = forwardRef(({ data }, ref) => {
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

  // Each person's itemized extras: their remainder of items they added, plus
  // their charged share of the other's items. Zero-share lines are omitted.
  // Amounts come from extraShares so the lines sum to the card total exactly.
  const extraLinesFor = (personKey) => {
    const otherKey = personKey === 'matias' ? 'reka' : 'matias';
    return [
      ...mergedExtras(data, personKey).map((e) => {
        const { total, charged, remainder } = extraShares(e);
        return {
          item: e,
          pct: Math.round((100 - extraPercent(e)) * 100) / 100,
          total,
          amount: remainder,
          otherAmount: charged,
          addedBy: names[personKey]
        };
      }),
      ...mergedExtras(data, otherKey).map((e) => {
        const { total, charged, remainder } = extraShares(e);
        return {
          item: e,
          pct: extraPercent(e),
          total,
          amount: charged,
          otherAmount: remainder,
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
      total: calc.matiasTotalDue,
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
      total: calc.rekaTotalDue,
      note: data.rekaNote
    }
  ];

  const periodDate = data.period ? new Date(data.period + '-01T00:00:00Z') : null;
  const periodLabel = periodDate && !isNaN(periodDate)
    ? periodDate.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', timeZone: 'UTC' })
    : 'Monthly';

  return (
    <div className="invoice-frame" ref={ref} id="invoice-preview">
      <div className="invoice-orb invoice-orb-lime" aria-hidden="true" />
      <div className="invoice-orb invoice-orb-pink" aria-hidden="true" />
      <div className="invoice-card">
      <div className="invoice-header">
        <h2>{periodLabel} Bills</h2>
        <div className="text-muted invoice-meta">
          <span>Issued on: <strong>{(data.timestamp ? new Date(data.timestamp) : new Date()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></span>
        </div>
      </div>

      <div className="invoice-section">
        <div className="due-card due-card-bills">
          <div className="due-card-name">Bills</div>
          {data.bills.map((bill) => {
            const from = bill.discounted ? (bill.discountedFrom || 'na') : null;
            return (
              <div className={`due-line${from === 'na' ? ' due-line-discounted' : ''}`} key={bill.id}>
                <span>
                  {bill.thing}
                  {from === 'na' ? ' · discounted' : from ? ` · discounted for ${names[from]}` : ''}
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
              <div className="due-line" key={line.id}>
                <span>{line.thing} · discounted for {names[line.from]}</span>
                <span>{formatCurrency(line.amount)}</span>
              </div>
            ))}
            {person.extraLines.map(({ item, pct, total, amount, otherAmount, addedBy }) => (
              <div className="due-item" key={item.id}>
                <div className="due-line">
                  <span>{formatExtraLabel(item)} · {pct}% of {formatCurrency(total)}</span>
                  <span>{formatCurrency(amount)}</span>
                </div>
                <div className="due-item-sub">
                  Added by {addedBy} — {person.otherName} pays {formatCurrency(otherAmount)}
                </div>
              </div>
            ))}
            {person.discounts.filter((d) => parseAmount(d.value) !== 0).map((d) => (
              <div className="due-line" key={d.id}>
                <span>{d.thing?.trim() || 'Discount'}{d.type === 'percent' ? ` (${parseAmount(d.value)}%)` : ''}</span>
                <span>−{formatCurrency(discountAmount(d, person.before))}</span>
              </div>
            ))}
            <div className="due-card-total">
              <span>Total due</span>
              <span>{formatCurrency(person.total)}</span>
            </div>
          </div>
        ))}

        <div className="due-card due-card-total-grand">
          <div className="due-card-total grand-total-line">
            <span>Total extras</span>
            <span className="grand-total-amount">{formatCurrency(calc.extrasTotal)}</span>
          </div>
          <div className="due-card-total grand-total-line">
            <span>Grand total (bills + all extras)</span>
            <span className="grand-total-amount">{formatCurrency(calc.grandTotal)}</span>
          </div>
        </div>

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
        <p>Send your Total due to the account above.</p>
        {data.dueDate && (
          <p className="invoice-due-date">
            Due by: {new Date(data.dueDate + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}
          </p>
        )}
      </div>
      </div>
    </div>
  );
});

export default InvoicePreview;
