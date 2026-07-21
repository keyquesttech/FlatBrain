import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, Download, KeyRound, Landmark, Plus, RotateCcw, X } from 'lucide-react';
import Navigation from '../components/Navigation';
import CollapsibleCard from '../components/CollapsibleCard';
import CurrencyInput from '../components/CurrencyInput';
import DatePicker from '../components/DatePicker';
import PaidControl from '../components/PaidControl';
import RentInvoicePreview from '../components/RentInvoicePreview';
import { appAlert, appConfirm, appToast } from '../components/Dialog';
import { getRent, updateRent } from '../api';
import { formatCurrency } from '../utils/calculations';
import { formatDay, formatPeriod, monthsBetween } from '../utils/dates';
import { captureInvoicePng } from '../utils/invoicePng';
import { newId } from '../utils/id';

const SAVE_DEBOUNCE_MS = 600;

const DEFAULT_RENT_BANK = {
  name: 'Your Name',
  bankName: 'Your Bank',
  sortCode: '00-00-00',
  accountNumber: '00000000'
};

// A period is paid exactly when its payment date is filled in — there is
// no separate flag to keep in sync.
function normalizePayment(p) {
  return {
    id: p?.id || newId(),
    paymentDate: p?.paymentDate || '',
    periodFrom: p?.periodFrom || '',
    periodTo: p?.periodTo || '',
    amount: p?.amount || '',
    dueDate: p?.dueDate || ''
  };
}

function normalizeRent(r) {
  return {
    lodger: r?.lodger || '',
    deposit: r?.deposit || '',
    startDate: r?.startDate || '',
    endDate: r?.endDate || '',
    payments: (Array.isArray(r?.payments) ? r.payments : []).map(normalizePayment),
    bankDetails: { ...DEFAULT_RENT_BANK, ...(r?.bankDetails || {}) }
  };
}

const pad = (n) => String(n).padStart(2, '0');
const byPeriod = (a, b) => (a.periodFrom || '').localeCompare(b.periodFrom || '');

// The next block after `last`: same length, same period total, starting
// the month after the previous period ends, due on its first day.
function continueFrom(last) {
  const months = monthsBetween(last.periodFrom, last.periodTo);
  const [ty, tm] = String(last.periodTo || '').split('-').map(Number);
  if (!months || !ty || !tm) return normalizePayment({ amount: last.amount });
  const fromIdx = ty * 12 + (tm - 1) + 1;
  const fy = Math.floor(fromIdx / 12);
  const fm = (fromIdx % 12) + 1;
  const from = `${fy}-${pad(fm)}-01`;
  const lastIdx = fromIdx + months - 1;
  const ly = Math.floor(lastIdx / 12);
  const lm = (lastIdx % 12) + 1;
  const to = `${ly}-${pad(lm)}-${pad(new Date(Date.UTC(ly, lm, 0)).getUTCDate())}`;
  return normalizePayment({ periodFrom: from, periodTo: to, dueDate: from, amount: last.amount });
}

// Rent, shaped like Bill Splitter: the Generator holds the tenancy details
// and the payment schedule (each row one rent period), everything saving
// as it's typed; filling a payment date is what marks a period paid. The
// History tab shows one invoice per period with a live thumbnail —
// downloadable any time, markable as paid when the money lands.
export default function RentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') === 'history' ? 'history' : 'new';
  const setView = (v) => setSearchParams(v === 'history' ? { view: 'history' } : {});

  const [rent, setRent] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const [periodDownload, setPeriodDownload] = useState(null);
  const dataRef = useRef(null);
  const saveTimerRef = useRef(null);
  const pendingRef = useRef(false);
  const downloadPreviewRef = useRef(null);

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

  // Download one period's invoice: render it into a hidden preview,
  // capture that, then unmount it (Bill Splitter's pattern).
  useEffect(() => {
    if (!periodDownload) return;
    let cancelled = false;
    (async () => {
      try {
        await captureInvoicePng(
          downloadPreviewRef.current,
          `Rent-${(dataRef.current?.lodger || 'period').trim().replace(/\s+/g, '-')}-${periodDownload.periodFrom || 'period'}.png`
        );
      } catch (err) {
        console.error('Error generating rent invoice image', err);
        if (!cancelled) appAlert('Failed to generate the invoice image. Please try again.', { title: 'Download failed', tone: 'error' });
      } finally {
        if (!cancelled) setPeriodDownload(null);
      }
    })();
    return () => { cancelled = true; };
  }, [periodDownload]);

  if (!rent) return <div className="page-loading">Loading…</div>;

  const updatePayment = (id, changes) => {
    update({ payments: rent.payments.map((p) => (p.id === id ? { ...p, ...changes } : p)) });
  };

  // New rows continue the schedule: same block length and period total as
  // the last row, starting where its period ends.
  const addPayment = () => {
    const last = rent.payments[rent.payments.length - 1];
    update({ payments: [...rent.payments, last ? continueFrom(last) : normalizePayment({})] });
  };

  const clearForm = async () => {
    if (!await appConfirm('Reset the whole form? The tenancy details and every payment period will be cleared. Bank details are kept.', { title: 'Reset form', okLabel: 'Reset', danger: true })) return;
    update({ lodger: '', deposit: '', startDate: '', endDate: '', payments: [] });
    appToast('Form reset — bank details kept.');
  };

  const sortedPayments = [...rent.payments].sort(byPeriod);
  // The generator's live preview shows the invoice you'd send next: the
  // earliest unpaid period (or the last one once everything is paid).
  const previewPeriod = sortedPayments.find((p) => !p.paymentDate) || sortedPayments[sortedPayments.length - 1] || null;
  const docFor = (period) => ({
    lodger: rent.lodger,
    deposit: rent.deposit,
    startDate: rent.startDate,
    endDate: rent.endDate,
    items: period ? [period] : [],
    bankDetails: rent.bankDetails
  });

  return (
    <div className="container animate-fade-in">
      <Navigation
        appLabel="Rent"
        customTabs={[
          { id: 'new', label: 'Generator', active: view === 'new', onClick: () => setView('new') },
          { id: 'history', label: 'History', active: view === 'history', onClick: () => setView('history') }
        ]}
      />

      {view === 'new' ? (
        <>
          <div className="page-toolbar">
            <div className="page-toolbar-actions">
              <button className="btn btn-secondary" onClick={clearForm}>
                <RotateCcw size={16} />
                Reset form
              </button>
            </div>
          </div>

          <div className="main-content">
            <div className="form-card-stack">
              <CollapsibleCard title={<span className="stat-title"><KeyRound size={15} /> Details</span>} storageKey="rent-details">
                <p className="section-desc">
                  The tenancy at a glance — printed on every period's invoice.
                </p>
                <div className="rent-fields">
                  <label className="fld rent-fld-wide">
                    <span className="fld-label">Lodger name</span>
                    <input
                      type="text"
                      value={rent.lodger}
                      onChange={(e) => update({ lodger: e.target.value })}
                      placeholder="Who pays the rent"
                      maxLength={60}
                    />
                  </label>
                  <label className="fld">
                    <span className="fld-label">Deposit amount</span>
                    <CurrencyInput
                      formatted
                      value={rent.deposit}
                      onChange={(e) => update({ deposit: e.target.value })}
                      aria-label="Deposit amount"
                    />
                  </label>
                  <label className="fld">
                    <span className="fld-label">Start date</span>
                    <DatePicker value={rent.startDate} onChange={(v) => update({ startDate: v })} placeholder="Select date" />
                  </label>
                  <label className="fld">
                    <span className="fld-label">End date</span>
                    <DatePicker value={rent.endDate} onChange={(v) => update({ endDate: v })} placeholder="Select date" />
                  </label>
                </div>
              </CollapsibleCard>

              <CollapsibleCard
                title={<span className="stat-title"><CalendarClock size={15} /> Payments</span>}
                storageKey="rent-payments"
                actions={(
                  <button className="btn btn-primary btn-sm" onClick={addPayment}>
                    <Plus size={16} /> Add payment
                  </button>
                )}
              >
                <p className="section-desc">
                  One row per rent period — filling the payment date is what marks it paid. Add payment continues the schedule from the last block.
                </p>
                {rent.payments.length === 0 && (
                  <p className="section-desc">No payments yet — add the first period.</p>
                )}
                {rent.payments.map((p) => (
                  <div className="rent-row" key={p.id}>
                    <div className="rent-fields">
                      <label className="fld">
                        <span className="fld-label">Period from</span>
                        <DatePicker value={p.periodFrom} onChange={(v) => updatePayment(p.id, { periodFrom: v })} placeholder="Select date" />
                      </label>
                      <label className="fld">
                        <span className="fld-label">Period to</span>
                        <DatePicker value={p.periodTo} onChange={(v) => updatePayment(p.id, { periodTo: v })} placeholder="Select date" />
                      </label>
                      <label className="fld">
                        <span className="fld-label">Due date</span>
                        <DatePicker value={p.dueDate} onChange={(v) => updatePayment(p.id, { dueDate: v })} placeholder="Select date" />
                      </label>
                      <label className="fld">
                        <span className="fld-label">Period total</span>
                        <CurrencyInput
                          formatted
                          value={p.amount}
                          onChange={(e) => updatePayment(p.id, { amount: e.target.value })}
                          aria-label="Period total"
                        />
                      </label>
                      <label className="fld rent-fld-wide">
                        <span className="fld-label">Payment date — filling it marks the period paid</span>
                        <DatePicker value={p.paymentDate} onChange={(v) => updatePayment(p.id, { paymentDate: v })} placeholder="Not paid yet" />
                      </label>
                    </div>
                    <div className="rent-row-meta">
                      <span className="rent-period">
                        {formatPeriod(p.periodFrom, p.periodTo) || 'Pick the period dates'}
                        {monthsBetween(p.periodFrom, p.periodTo) > 0 ? ` · ${monthsBetween(p.periodFrom, p.periodTo)} mo block` : ''}
                        {p.paymentDate ? ` · paid ${formatDay(p.paymentDate)}` : ''}
                      </span>
                      <span className="rent-row-actions">
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

              <CollapsibleCard title={<span className="stat-title"><Landmark size={15} /> Bank Details</span>} storageKey="rent-bank">
                <p className="section-desc">Printed on the invoice — kept separate from the other apps' account details.</p>
                {[
                  ['name', 'Name', 'Account holder name'],
                  ['bankName', 'Bank Name', 'Bank name'],
                  ['sortCode', 'Sort Code', '00-00-00'],
                  ['accountNumber', 'Account Number', '12345678']
                ].map(([key, label, ph]) => (
                  <div className="form-group" key={key}>
                    <label>{label}</label>
                    <input
                      type="text"
                      value={rent.bankDetails[key]}
                      onChange={(e) => update({ bankDetails: { ...rent.bankDetails, [key]: e.target.value } })}
                      placeholder={ph}
                    />
                  </div>
                ))}
              </CollapsibleCard>

              {saveError && (
                <p className="section-desc stat-detail-warn">Changes aren’t saving — check the server.</p>
              )}
            </div>

            <div className="preview-column">
              <RentInvoicePreview doc={docFor(previewPeriod)} />
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="section-desc">
            One invoice per rent period, always up to date with the schedule — download it, or mark it paid when the money lands.
          </p>

          {sortedPayments.length === 0 && (
            <div className="glass-panel">
              <p className="text-muted" style={{ margin: 0 }}>
                No periods yet — add them on the Generator tab.
              </p>
            </div>
          )}

          <div className="form-card-stack">
            {sortedPayments.map((p) => (
              <div className="glass-panel" key={p.id}>
                <div className="rent-history-row">
                  <div className="rent-thumb" aria-hidden="true">
                    <div className="rent-thumb-inner">
                      <RentInvoicePreview doc={docFor(p)} />
                    </div>
                  </div>
                  <div className="rent-history-info">
                    <div className="rent-history-title">
                      {formatPeriod(p.periodFrom, p.periodTo) || 'Period'}
                    </div>
                    <div className="rent-history-meta">
                      {p.dueDate ? `Due ${formatDay(p.dueDate)} · ` : ''}
                      {monthsBetween(p.periodFrom, p.periodTo) > 0 ? `${monthsBetween(p.periodFrom, p.periodTo)} mo block · ` : ''}
                      <strong>{formatCurrency(p.amount)}</strong>
                    </div>
                  </div>
                  <span className="rent-row-actions">
                    <PaidControl
                      paidDate={p.paymentDate}
                      onChange={(d) => updatePayment(p.id, { paymentDate: d })}
                    />
                    <button
                      className="btn-icon"
                      onClick={() => { if (!periodDownload) setPeriodDownload(p); }}
                      disabled={!!periodDownload}
                      title="Download this period's invoice"
                      aria-label={`Download invoice for ${formatPeriod(p.periodFrom, p.periodTo) || 'this period'}`}
                    >
                      <Download size={16} />
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {periodDownload && (
        <div style={{ position: 'fixed', left: '-10000px', top: 0, width: '720px' }} aria-hidden="true">
          <RentInvoicePreview doc={docFor(periodDownload)} ref={downloadPreviewRef} />
        </div>
      )}
    </div>
  );
}
