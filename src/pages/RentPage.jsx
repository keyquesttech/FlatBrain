import React, { useEffect, useRef, useState } from 'react';
import { CalendarClock, KeyRound, Landmark, Plus, X } from 'lucide-react';
import Navigation from '../components/Navigation';
import CollapsibleCard from '../components/CollapsibleCard';
import CurrencyInput from '../components/CurrencyInput';
import DatePicker from '../components/DatePicker';
import MonthPicker from '../components/MonthPicker';
import SelectMenu from '../components/SelectMenu';
import { getRent, updateRent } from '../api';
import { formatCurrency, parseAmount, round2 } from '../utils/calculations';
import { newId } from '../utils/id';

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

const monthsOf = (p) => {
  const n = parseInt(p?.months, 10);
  return isNaN(n) || n < 1 ? 1 : n;
};

// Rent rows carry the MONTHLY amount (like the spreadsheet's Amount column);
// what's actually transferred per row is amount × months — the Period total.
const periodTotal = (p) => round2(parseAmount(p?.amount) * monthsOf(p));

const monthShort = (y, m) =>
  new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });

// "Jul – Aug 2026" from a period start (YYYY-MM) and a month count; spells
// both years out when a block crosses New Year.
function periodLabel(startYm, months) {
  const [y, m] = String(startYm || '').split('-').map(Number);
  if (!y || !m) return '';
  const n = Math.max(1, parseInt(months, 10) || 1);
  const endIndex = m - 1 + n - 1;
  const ey = y + Math.floor(endIndex / 12);
  const em = (endIndex % 12) + 1;
  if (n === 1) return `${monthShort(y, m)} ${y}`;
  return ey === y
    ? `${monthShort(y, m)} – ${monthShort(ey, em)} ${y}`
    : `${monthShort(y, m)} ${y} – ${monthShort(ey, em)} ${ey}`;
}

// The month after a period ends, as YYYY-MM — used to suggest the next row.
function monthAfterPeriod(startYm, months) {
  const [y, m] = String(startYm || '').split('-').map(Number);
  if (!y || !m) return '';
  const idx = m - 1 + Math.max(1, parseInt(months, 10) || 1);
  return `${y + Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDay(iso) {
  const d = iso ? new Date(iso + 'T00:00:00Z') : null;
  return d && !isNaN(d)
    ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : '';
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

// Rent tracker — the app version of the tenancy spreadsheet: deposit,
// the rent payment schedule in month-blocks, and building charges
// (service charge, ground rent), each row with a paid status.
export default function RentPage() {
  const [rent, setRent] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const dataRef = useRef(null);
  const saveTimerRef = useRef(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getRent()
      .then((r) => {
        if (cancelled) return;
        dataRef.current = normalizeRent(r);
        setRent(dataRef.current);
      })
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

  const updateCharge = (id, changes) => {
    update({ charges: rent.charges.map((c) => (c.id === id ? { ...c, ...changes } : c)) });
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

  const addCharge = () => {
    update({ charges: [...rent.charges, { id: newId(), thing: '', dueDate: '', amount: '', paidDate: '' }] });
  };

  // Overview numbers: what's still owed and what comes due next.
  const unpaidPayments = rent.payments.filter((p) => !p.paidDate);
  const unpaidCharges = rent.charges.filter((c) => !c.paidDate);
  const rentOutstanding = unpaidPayments.reduce((s, p) => round2(s + periodTotal(p)), 0);
  const chargesOutstanding = unpaidCharges.reduce((s, c) => round2(s + round2(parseAmount(c.amount))), 0);
  const nextDue = [
    ...unpaidPayments.map((p) => ({
      dueDate: p.dueDate,
      label: `${periodLabel(p.periodStart, p.months) || 'rent'} rent`,
      amount: periodTotal(p)
    })),
    ...unpaidCharges.map((c) => ({
      dueDate: c.dueDate,
      label: c.thing?.trim() || 'Charge',
      amount: round2(parseAmount(c.amount))
    }))
  ]
    .filter((d) => d.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  return (
    <div className="container container-narrow animate-fade-in">
      <Navigation showTabs={false} appLabel="Rent" />

      <div className="page-header">
        <h1>Rent</h1>
        <p className="text-muted">
          {saveError ? 'Changes aren’t saving — check the server.' : 'Deposit, rent schedule and building charges.'}
        </p>
      </div>

      <div className="form-card-stack">
        <CollapsibleCard title={<span className="stat-title"><CalendarClock size={15} /> Overview</span>} storageKey="rent-overview">
          <div className="sys-rows">
            <div className="sys-row">
              <span className="sys-row-label">Next due</span>
              <span className="sys-row-value">
                {nextDue ? `${nextDue.label} — ${formatCurrency(nextDue.amount)} on ${formatDay(nextDue.dueDate)}` : 'Nothing outstanding'}
              </span>
            </div>
            <div className="sys-row">
              <span className="sys-row-label">Rent outstanding</span>
              <span className="sys-row-value">{formatCurrency(rentOutstanding)}</span>
            </div>
            <div className="sys-row">
              <span className="sys-row-label">Charges outstanding</span>
              <span className="sys-row-value">{formatCurrency(chargesOutstanding)}</span>
            </div>
            <div className="sys-row">
              <span className="sys-row-label">Deposit</span>
              <span className="sys-row-value">
                {parseAmount(rent.deposit.amount) > 0
                  ? `${formatCurrency(rent.deposit.amount)}${rent.deposit.paidDate ? ` — paid ${formatDay(rent.deposit.paidDate)}` : ' — not paid'}`
                  : '—'}
              </span>
            </div>
          </div>
        </CollapsibleCard>

        <CollapsibleCard title={<span className="stat-title"><KeyRound size={15} /> Tenancy</span>} storageKey="rent-tenancy">
          <div className="input-row rent-fields">
            <label className="fld">
              <span className="fld-label">Name</span>
              <input
                type="text"
                value={rent.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="e.g. Réka rent"
                maxLength={60}
              />
            </label>
            <label className="fld">
              <span className="fld-label">Monthly rent</span>
              <CurrencyInput
                value={rent.monthlyAmount}
                onChange={(e) => update({ monthlyAmount: e.target.value })}
                aria-label="Monthly rent"
              />
            </label>
          </div>
          <div className="rent-row-meta">
            <label className="fld rent-deposit-fld">
              <span className="fld-label">Deposit</span>
              <CurrencyInput
                value={rent.deposit.amount}
                onChange={(e) => update({ deposit: { ...rent.deposit, amount: e.target.value } })}
                aria-label="Deposit amount"
              />
            </label>
            <PaidToggle
              paidDate={rent.deposit.paidDate}
              onChange={(paidDate) => update({ deposit: { ...rent.deposit, paidDate } })}
            />
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
                    width="100%"
                  />
                </label>
                <label className="fld">
                  <span className="fld-label">Monthly £</span>
                  <CurrencyInput
                    value={p.amount}
                    onChange={(e) => updatePayment(p.id, { amount: e.target.value })}
                    aria-label="Monthly rent amount"
                  />
                </label>
                <button
                  className="btn btn-danger action-btn rent-remove"
                  onClick={() => update({ payments: rent.payments.filter((x) => x.id !== p.id) })}
                  aria-label="Remove payment"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="rent-row-meta">
                <span className="rent-period">
                  {periodLabel(p.periodStart, p.months) || 'Pick a period'} · <strong>{formatCurrency(periodTotal(p))}</strong>
                </span>
                <PaidToggle paidDate={p.paidDate} onChange={(paidDate) => updatePayment(p.id, { paidDate })} />
              </div>
            </div>
          ))}
        </CollapsibleCard>

        <CollapsibleCard
          title={<span className="stat-title"><Landmark size={15} /> Other charges</span>}
          storageKey="rent-charges"
          actions={(
            <button className="btn btn-primary btn-sm" onClick={addCharge}>
              <Plus size={16} /> Add charge
            </button>
          )}
        >
          <p className="section-desc">Service charge halves, ground rent — anything owed besides the rent itself.</p>
          {rent.charges.length === 0 && (
            <p className="section-desc">No charges yet.</p>
          )}
          {rent.charges.map((c) => (
            <div className="rent-row" key={c.id}>
              <div className="rent-fields">
                <label className="fld rent-charge-name">
                  <span className="fld-label">Charge</span>
                  <input
                    type="text"
                    value={c.thing}
                    onChange={(e) => updateCharge(c.id, { thing: e.target.value })}
                    placeholder="e.g. Half service charge 2026"
                    maxLength={100}
                  />
                </label>
                <label className="fld">
                  <span className="fld-label">Due date</span>
                  <DatePicker value={c.dueDate} onChange={(v) => updateCharge(c.id, { dueDate: v })} />
                </label>
                <label className="fld">
                  <span className="fld-label">Amount</span>
                  <CurrencyInput
                    value={c.amount}
                    onChange={(e) => updateCharge(c.id, { amount: e.target.value })}
                    aria-label="Charge amount"
                  />
                </label>
                <button
                  className="btn btn-danger action-btn rent-remove"
                  onClick={() => update({ charges: rent.charges.filter((x) => x.id !== c.id) })}
                  aria-label="Remove charge"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="rent-row-meta">
                <span className="rent-period">{c.dueDate ? `Due ${formatDay(c.dueDate)}` : 'Pick a due date'}</span>
                <PaidToggle paidDate={c.paidDate} onChange={(paidDate) => updateCharge(c.id, { paidDate })} />
              </div>
            </div>
          ))}
        </CollapsibleCard>
      </div>
    </div>
  );
}
