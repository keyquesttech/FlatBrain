import React, { forwardRef } from 'react';
import {
  calculateInvoice,
  discountAmount,
  extraPercent,
  extraTotal,
  formatCurrency,
  formatExtraLabel,
  getInvoiceExtrasSection,
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
    billsTotalEach,
    matiasBillsShare,
    rekaBillsShare,
    netTotal
  } = calc;
  const rekaPercent = Math.round((100 - splitPercent) * 100) / 100;
  const isEvenSplit = splitPercent === 50;
  const hasDiscounts = calc.matiasDiscountTotal !== 0 || calc.rekaDiscountTotal !== 0;

  const extrasSections = [
    { key: 'matias', name: names.matias, otherName: names.reka, ...getInvoiceExtrasSection('matias', data) },
    { key: 'reka', name: names.reka, otherName: names.matias, ...getInvoiceExtrasSection('reka', data) }
  ].filter((person) => person.items.length > 0);

  const dueSections = [
    {
      key: 'matias',
      name: names.matias,
      pct: splitPercent,
      billsShare: matiasBillsShare,
      shareExtras: calc.matiasShareExtras,
      before: calc.matiasBeforeDiscounts,
      discounts: data.matiasDiscounts || [],
      total: calc.matiasTotalDue,
      note: data.matiasNote
    },
    {
      key: 'reka',
      name: names.reka,
      pct: rekaPercent,
      billsShare: rekaBillsShare,
      shareExtras: calc.rekaShareExtras,
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
          {data.bills.map((bill) => (
            <div className="due-line" key={bill.id}>
              <span>{bill.thing}</span>
              <span>{formatCurrency(bill.amount)}</span>
            </div>
          ))}
          <div className="due-card-total">
            <span>Bills total</span>
            <span>{formatCurrency(billsTotal)}</span>
          </div>
          {isEvenSplit ? (
            <div className="due-card-total due-card-total-secondary">
              <span>Bills total each</span>
              <span>{formatCurrency(billsTotalEach)}</span>
            </div>
          ) : (
            <>
              <div className="due-card-total due-card-total-secondary">
                <span>{names.matias} share ({splitPercent}%)</span>
                <span>{formatCurrency(matiasBillsShare)}</span>
              </div>
              <div className="due-card-total due-card-total-secondary">
                <span>{names.reka} share ({rekaPercent}%)</span>
                <span>{formatCurrency(rekaBillsShare)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {extrasSections.length > 0 && (
        <div className="invoice-section">
          {extrasSections.map((person) => (
            <div className="due-card due-card-extras" key={person.key}>
              <div className="due-card-name">{person.name} Extras</div>
              {person.items.map((extra) => (
                <div className="due-line" key={extra.id}>
                  <span>{formatExtraLabel(extra)} · {person.otherName} pays {extraPercent(extra)}% of {formatCurrency(extraTotal(extra))}</span>
                  <span>{formatCurrency(extraTotal(extra))}</span>
                </div>
              ))}
              <div className="due-card-total">
                <span>Total</span>
                <span>{formatCurrency(person.total)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="invoice-section">
        {dueSections.map((person) => (
          <div className="due-card due-card-summary" key={person.key}>
            <div className="due-card-name">{person.name} Total</div>
            <div className="due-line">
              <span>Share of bills ({person.pct}%)</span>
              <span>{formatCurrency(person.billsShare)}</span>
            </div>
            <div className="due-line">
              <span>Share of extras</span>
              <span>{formatCurrency(person.shareExtras)}</span>
            </div>
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
            <span>Grand total ({hasDiscounts ? 'bills + extras − discounts' : 'bills + all extras'})</span>
            <span className="grand-total-amount">{formatCurrency(netTotal)}</span>
          </div>
        </div>

        {dueSections.filter((person) => person.note?.trim()).map((person) => (
          <div className="due-card due-card-note" key={`${person.key}-note`}>
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
