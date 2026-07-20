import React, { useEffect, useRef, useState } from 'react';
import { CalendarClock, Download, KeyRound, Landmark, Plus, X } from 'lucide-react';
import Navigation from '../components/Navigation';
import CollapsibleCard from '../components/CollapsibleCard';
import CurrencyInput from '../components/CurrencyInput';
import DatePicker from '../components/DatePicker';
import MonthPicker from '../components/MonthPicker';
import RentInvoicePreview from '../components/RentInvoicePreview';
import SelectMenu from '../components/SelectMenu';
import { appAlert, appToast } from '../components/Dialog';
import { getDraft, getRent, updateRent } from '../api';
import { formatCurrency } from '../utils/calculations';
import { captureInvoicePng } from '../utils/invoicePng';
import { newId } from '../utils/id';
import { formatDay, monthAfterPeriod, monthsOf, periodLabel, periodTotal, rentTotals, todayISO } from '../utils/rent';
import { playSuccess } from '../utils/sound';

const SAVE_DEBOUNCE_MS = 600;
const MONTH_OPTIONS = [1, 2, 3, 4, 6, 12].map((n) => ({ value: n, label: `${n} mo` }));

function normalizeRent(r) {
  return {
    name: r?.name || 'Rent',
    monthlyAmount: r?.monthlyAmount || '',
    deposit: { amount: r?.deposit?.amount || '', paidDate: r?.deposit?.paidDate || '' },
    payments: Array.isArray(r?.payments) ? r.payments : [],
    charges: Array.isArray(r?.charges) ? r.charges : []
  };
}

// Paid ⇄ unpaid toggle, shown as the sheet's Status column: an outline
// button before payment, a lime chip with the date once marked.
function PaidToggle({ paidDate, onChange }) {
  return paidDate ? (
    <button
      type="button"
      className="paid-chip"
      onClick={() => onChange('')}
      title="Tap to mark as not paid"
    >
      Paid {formatDay(paidDate)}
    </button>
  ) : (
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(todayISO())}>
      Mark paid
    </button>
  );
}

// Rent tracker — the app version of the tenancy spreadsheet: deposit and
// the rent payment schedule in month-blocks, each row with a paid status,
// plus a downloadable invoice that itemizes every payment.
export default function RentPage() {
  const [rent, setRent] = useState(null);
  const [bank, setBank] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const [busy, setBusy] = useState(false);
  const dataRef = useRef(null);
  const saveTimerRef = useRef(null);
  const pendingRef = useRef(false);
  const previewRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getRent()
      .then((r) => {
        if (cancelled) return;
        dataRef.current = normalizeRent(r);
        setRent(dataRef.current);
      })
      .catch(() => {});
    // The invoice's bank details are the same account Bill Splitter uses —
    // read them from its draft rather than keeping a second copy.
    getDraft()
      .then((d) => { if (!cancelled) setBank(d?.bankDetails || null); })
      .catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(saveTimerRef.current);
      if (pendingRef.current) flushSave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flushSave = async () => {
    pendingRef.current = false;
    try {
      await updateRent(dataRef.current);
      setSaveError(false);
    } catch {
      pendingRef.current = true;
      setSaveError(true);
    }
  };

  // Instant UI, debounced write — same pattern as the Bill Splitter draft.
  const update = (changes) => {
    const next = { ...dataRef.current, ...changes };
    dataRef.current = next;
    setRent(next);
    pendingRef.current = true;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  };

  if (!rent) return <div className="page-loading">Loading…</div>;

  const updatePayment = (id, changes) => {
    update({ payments: rent.payments.map((p) => (p.id === id ? { ...p, ...changes } : p)) });
  };

  // New payment rows continue the schedule: the next block starts the month
  // after the previous one ends, due on the 1st of that month (the sheet's
  // pattern), keeping the same monthly amount and block length.
  const addPayment = () => {
    const last = rent.payments[rent.payments.length - 1];
    let row;
    if (last?.periodStart) {
      const start = monthAfterPeriod(last.periodStart, last.months);
      row = {
        id: newId(),
        dueDate: start ? `${start}-01` : '',
        periodStart: start,
        months: monthsOf(last),
        amount: last.amount,
        paidDate: ''
      };
    } else {
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      row = {
        id: newId(),
        dueDate: todayISO(),
        periodStart: thisMonth,
        months: 2,
        amount: rent.monthlyAmount,
        paidDate: ''
      };
    }
    update({ payments: [...rent.payments, row] });
  };

  const downloadInvoice = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await captureInvoicePng(previewRef.current, `Rent-${(rent.name || 'Schedule').trim().replace(/\s+/g, '-')}.png`);
      playSuccess();
      appToast('Rent invoice downloaded.');
    } catch (err) {
      console.error('Error generating rent invoice image', err);
      appAlert('Failed to generate the invoice image. See the browser console for details.', { title: 'Download failed', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const totals = rentTotals(rent);
  const nextDue = rent.payments
    .filter((p) => !p.paidDate && p.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  return (
    <div className="container animate-fade-in">
      <Navigation showTabs={false} appLabel="Rent" />

      <div className="page-toolbar">
        <div className="page-toolbar-actions">
          <button className="btn btn-primary" onClick={downloadInvoice} disabled={busy}>
            <Download size={18} />
            {busy ? 'Generating…' : 'Download invoice'}
          </button>
        </div>
      </div>

      <div className="main-content">
        <div className="form-card-stack">
          <CollapsibleCard title={<span className="stat-title"><CalendarClock size={15} /> Overview</span>} storageKey="rent-overview">
            <div className="sys-rows">
              <div className="sys-row">
                <span className="sys-row-label">Next due</span>
                <span className="sys-row-value">
                  {nextDue
                    ? `${periodLabel(nextDue.periodStart, nextDue.months) || 'Rent'} — ${formatCurrency(periodTotal(nextDue))} on ${formatDay(nextDue.dueDate)}`
                    : 'Nothing outstanding'}
                </span>
              </div>
              <div className="sys-row">
                <span className="sys-row-label">Rent outstanding</span>
                <span className="sys-row-value">{formatCurrency(totals.rentOutstanding)}</span>
              </div>
              <div className="sys-row">
                <span className="sys-row-label">Deposit</span>
                <span className="sys-row-value">
                  {totals.depositAmount > 0
                    ? `${formatCurrency(totals.depositAmount)}${rent.deposit.paidDate ? ` — paid ${formatDay(rent.deposit.paidDate)}` : ' — not paid'}`
                    : '—'}
                </span>
              </div>
            </div>
          </CollapsibleCard>

          <CollapsibleCard title={<span className="stat-title"><KeyRound size={15} /> Tenancy</span>} storageKey="rent-tenancy">
            <div className="rent-tenancy-row">
              <label className="fld rent-fld-name">
                <span className="fld-label">Name</span>
                <input
                  type="text"
                  value={rent.name}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder="e.g. Réka rent"
                  maxLength={60}
                />
              </label>
              <label className="fld rent-fld-money">
                <span className="fld-label">Monthly rent</span>
                <CurrencyInput
                  formatted
                  value={rent.monthlyAmount}
                  onChange={(e) => update({ monthlyAmount: e.target.value })}
                  aria-label="Monthly rent"
                />
              </label>
              <label className="fld rent-fld-money">
                <span className="fld-label">Deposit</span>
                <CurrencyInput
                  formatted
                  value={rent.deposit.amount}
                  onChange={(e) => update({ deposit: { ...rent.deposit, amount: e.target.value } })}
                  aria-label="Deposit amount"
                />
              </label>
              <div className="rent-tenancy-status">
                <PaidToggle
                  paidDate={rent.deposit.paidDate}
                  onChange={(paidDate) => update({ deposit: { ...rent.deposit, paidDate } })}
                />
              </div>
            </div>
          </CollapsibleCard>

          <CollapsibleCard
            title={<span className="stat-title"><Landmark size={15} /> Rent payments</span>}
            storageKey="rent-payments"
            actions={(
              <button className="btn btn-primary btn-sm" onClick={addPayment}>
                <Plus size={16} /> Add payment
              </button>
            )}
          >
            <p className="section-desc">
              Amount is the monthly rent; each payment covers a block of months, so the transfer due is amount × months. Adding a payment continues the schedule from the last block.
            </p>
            {rent.payments.length === 0 && (
              <p className="section-desc">No payments yet — set the monthly rent above, then add the first payment.</p>
            )}
            {rent.payments.map((p) => (
              <div className="rent-row" key={p.id}>
                <div className="rent-fields">
                  <label className="fld">
                    <span className="fld-label">Due date</span>
                    <DatePicker value={p.dueDate} onChange={(v) => updatePayment(p.id, { dueDate: v })} />
                  </label>
                  <label className="fld">
                    <span className="fld-label">Period start</span>
                    <MonthPicker value={p.periodStart} onChange={(v) => updatePayment(p.id, { periodStart: v })} />
                  </label>
                  <label className="fld fld-months">
                    <span className="fld-label">Months</span>
                    <SelectMenu
                      value={monthsOf(p)}
                      onChange={(v) => updatePayment(p.id, { months: v })}
                      options={MONTH_OPTIONS}
                      width="88px"
                    />
                  </label>
                  <label className="fld rent-fld-money">
                    <span className="fld-label">Monthly £</span>
                    <CurrencyInput
                      formatted
                      value={p.amount}
                      onChange={(e) => updatePayment(p.id, { amount: e.target.value })}
                      aria-label="Monthly rent amount"
                    />
                  </label>
                </div>
                <div className="rent-row-meta">
                  <span className="rent-period">
                    {periodLabel(p.periodStart, p.months) || 'Pick a period'} · <strong>{formatCurrency(periodTotal(p))}</strong>
                  </span>
                  <span className="rent-row-actions">
                    <PaidToggle paidDate={p.paidDate} onChange={(paidDate) => updatePayment(p.id, { paidDate })} />
                    <button
                      className="btn-icon btn-icon-danger"
                      onClick={() => update({ payments: rent.payments.filter((x) => x.id !== p.id) })}
                      aria-label="Remove payment"
                      title="Remove this payment"
                    >
                      <X size={16} />
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </CollapsibleCard>

          {saveError && (
            <p className="section-desc stat-detail-warn">Changes aren’t saving — check the server.</p>
          )}
        </div>

        <div className="preview-column">
          <RentInvoicePreview rent={rent} bank={bank} ref={previewRef} />
        </div>
      </div>
    </div>
  );
}
