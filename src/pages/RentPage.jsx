import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, Download, KeyRound, Landmark, Plus, Trash2, Wand2, X } from 'lucide-react';
import Navigation from '../components/Navigation';
import CollapsibleCard from '../components/CollapsibleCard';
import CurrencyInput from '../components/CurrencyInput';
import DatePicker from '../components/DatePicker';
import PaidControl from '../components/PaidControl';
import RentInvoicePreview from '../components/RentInvoicePreview';
import SelectMenu from '../components/SelectMenu';
import { appAlert, appConfirm, appToast } from '../components/Dialog';
import { getRent, updateRent } from '../api';
import { formatCurrency, parseAmount, round2 } from '../utils/calculations';
import { formatPeriod } from '../utils/dates';
import { captureInvoicePng } from '../utils/invoicePng';
import { newId } from '../utils/id';
import { playSuccess } from '../utils/sound';

const SAVE_DEBOUNCE_MS = 600;

const DEFAULT_RENT_BANK = {
  name: 'Your Name',
  bankName: 'Your Bank',
  sortCode: '00-00-00',
  accountNumber: '00000000'
};

const PAID_OPTIONS = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' }
];

function normalizePayment(p) {
  return {
    id: p?.id || newId(),
    paymentDate: p?.paymentDate || '',
    periodFrom: p?.periodFrom || '',
    periodTo: p?.periodTo || '',
    amount: p?.amount || '',
    dueDate: p?.dueDate || '',
    paid: p?.paid === true,
    include: p?.include === true
  };
}

function normalizeRent(r) {
  return {
    lodger: r?.lodger || '',
    deposit: r?.deposit || '',
    startDate: r?.startDate || '',
    endDate: r?.endDate || '',
    blocks: r?.blocks ?? 6,
    payments: (Array.isArray(r?.payments) ? r.payments : []).map(normalizePayment),
    bankDetails: { ...DEFAULT_RENT_BANK, ...(r?.bankDetails || {}) },
    history: Array.isArray(r?.history) ? r.history : []
  };
}

const pad = (n) => String(n).padStart(2, '0');

// Divide the tenancy into equal blocks of whole months: block 1 starts on
// the exact start date, later blocks on the 1st; each block's due date
// defaults to its first day and everything stays editable afterwards.
function buildSchedule(startISO, endISO, blocks) {
  const [sy, sm] = startISO.split('-').map(Number);
  const [ey, em] = endISO.split('-').map(Number);
  const startIdx = sy * 12 + (sm - 1);
  const endIdx = ey * 12 + (em - 1);
  const totalMonths = endIdx - startIdx + 1;
  const per = Math.max(1, Math.round(totalMonths / blocks));
  const rows = [];
  for (let i = 0; i < blocks; i++) {
    const fromIdx = startIdx + i * per;
    const fy = Math.floor(fromIdx / 12);
    const fm = (fromIdx % 12) + 1;
    const from = i === 0 ? startISO : `${fy}-${pad(fm)}-01`;
    let to;
    if (i === blocks - 1) {
      to = endISO;
    } else {
      const lastIdx = fromIdx + per - 1;
      const ly = Math.floor(lastIdx / 12);
      const lm = (lastIdx % 12) + 1;
      to = `${ly}-${pad(lm)}-${pad(new Date(Date.UTC(ly, lm, 0)).getUTCDate())}`;
    }
    rows.push({
      id: newId(),
      paymentDate: '',
      periodFrom: from,
      periodTo: to,
      amount: '',
      dueDate: from,
      paid: false,
      include: false
    });
  }
  return rows;
}

// Rent invoice generator, shaped like Bill Splitter: the Details card
// describes the tenancy and can build the payment schedule from it, the
// Payments card tracks every period, and ticking periods puts them on the
// invoice. Download & Save captures the PNG and files it in History,
// which remembers when each invoice was generated and paid.
export default function RentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') === 'history' ? 'history' : 'new';
  const setView = (v) => setSearchParams(v === 'history' ? { view: 'history' } : {});

  const [rent, setRent] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [historyDownload, setHistoryDownload] = useState(null);
  const dataRef = useRef(null);
  const saveTimerRef = useRef(null);
  const pendingRef = useRef(false);
  const previewRef = useRef(null);
  const historyPreviewRef = useRef(null);

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

  // Re-download a saved invoice: render its snapshot into a hidden
  // preview, capture that, then unmount it (Bill Splitter's pattern).
  useEffect(() => {
    if (!historyDownload) return;
    let cancelled = false;
    (async () => {
      try {
        await captureInvoicePng(
          historyPreviewRef.current,
          `Rent-${(historyDownload.lodger || 'Invoice').trim().replace(/\s+/g, '-')}.png`
        );
      } catch (err) {
        console.error('Error re-generating rent invoice image', err);
        if (!cancelled) appAlert('Failed to generate the invoice image. Please try again.', { title: 'Download failed', tone: 'error' });
      } finally {
        if (!cancelled) setHistoryDownload(null);
      }
    })();
    return () => { cancelled = true; };
  }, [historyDownload]);

  if (!rent) return <div className="page-loading">Loading…</div>;

  const updatePayment = (id, changes) => {
    update({ payments: rent.payments.map((p) => (p.id === id ? { ...p, ...changes } : p)) });
  };

  const addPayment = () => {
    update({ payments: [...rent.payments, normalizePayment({ include: true })] });
  };

  const rebuildSchedule = async () => {
    const blocks = Math.min(24, Math.max(1, parseInt(rent.blocks, 10) || 0));
    if (!rent.startDate || !rent.endDate || rent.endDate <= rent.startDate || blocks < 1) {
      appAlert('Fill in a start date, a later end date and the number of rent blocks first.', { title: 'Build schedule' });
      return;
    }
    if (rent.payments.length > 0 &&
      !await appConfirm('Rebuild the payment schedule from the tenancy details? The current payment rows will be replaced.', { title: 'Build schedule', okLabel: 'Rebuild', danger: true })) {
      return;
    }
    update({ blocks, payments: buildSchedule(rent.startDate, rent.endDate, blocks) });
    appToast(`Built ${blocks} payment period${blocks === 1 ? '' : 's'} — fill in the amounts.`);
  };

  const included = rent.payments.filter((p) => p.include);
  const invoiceTotal = included.reduce((sum, p) => round2(sum + round2(parseAmount(p.amount))), 0);
  const invoiceDoc = {
    lodger: rent.lodger,
    deposit: rent.deposit,
    startDate: rent.startDate,
    endDate: rent.endDate,
    items: included,
    bankDetails: rent.bankDetails
  };

  const downloadAndSave = async () => {
    if (busy) return;
    if (included.length === 0) {
      appAlert('Tick at least one period ("On invoice") before generating.', { title: 'Nothing to invoice' });
      return;
    }
    setBusy(true);
    try {
      await captureInvoicePng(previewRef.current, `Rent-${(rent.lodger || 'Invoice').trim().replace(/\s+/g, '-')}.png`);
      const sorted = [...included].sort((a, b) => (a.periodFrom || '').localeCompare(b.periodFrom || ''));
      const entry = {
        id: newId(),
        lodger: rent.lodger,
        deposit: rent.deposit,
        startDate: rent.startDate,
        endDate: rent.endDate,
        period: formatPeriod(sorted[0]?.periodFrom, sorted[sorted.length - 1]?.periodTo),
        items: included.map((p) => ({ ...p })),
        bankDetails: { ...rent.bankDetails },
        total: invoiceTotal,
        generatedAt: Date.now(),
        paidDate: ''
      };
      // The schedule stays; only the selection clears for the next invoice.
      update({
        history: [entry, ...rent.history],
        payments: rent.payments.map((p) => ({ ...p, include: false }))
      });
      playSuccess();
      appToast('Rent invoice downloaded and saved to history.');
    } catch (err) {
      console.error('Error generating rent invoice image', err);
      appAlert('Failed to generate the invoice image. See the browser console for details.', { title: 'Download failed', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const deleteEntry = async (id) => {
    if (!await appConfirm('Delete this invoice from the rent history?', { title: 'Delete invoice', okLabel: 'Delete', danger: true })) return;
    update({ history: rent.history.filter((h) => h.id !== id) });
    appToast('Invoice deleted.');
  };

  return (
    <div className="container animate-fade-in">
      <Navigation showTabs={false} appLabel="Rent" />

      <nav className="tabs rent-tabs" aria-label="Rent">
        <button type="button" className={`tab ${view === 'new' ? 'active' : ''}`} onClick={() => setView('new')}>
          <span>Generator</span>
        </button>
        <button type="button" className={`tab ${view === 'history' ? 'active' : ''}`} onClick={() => setView('history')}>
          <span>History</span>
        </button>
      </nav>

      {view === 'new' ? (
        <>
          <div className="page-toolbar">
            <div className="page-toolbar-actions">
              <button className="btn btn-primary" onClick={downloadAndSave} disabled={busy}>
                <Download size={18} />
                {busy ? 'Saving…' : 'Download & Save'}
              </button>
            </div>
          </div>

          <div className="main-content">
            <div className="form-card-stack">
              <CollapsibleCard
                title={<span className="stat-title"><KeyRound size={15} /> Details</span>}
                storageKey="rent-details"
                actions={(
                  <button className="btn btn-primary btn-sm" onClick={rebuildSchedule}>
                    <Wand2 size={16} /> Build schedule
                  </button>
                )}
              >
                <p className="section-desc">
                  The tenancy at a glance — Build schedule splits it into equal payment periods below.
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
                    <span className="fld-label">Rent blocks</span>
                    <input
                      type="number"
                      min="1"
                      max="24"
                      step="1"
                      inputMode="numeric"
                      value={rent.blocks}
                      onChange={(e) => update({ blocks: e.target.value })}
                      aria-label="Number of rent blocks"
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
                  One row per rent period. Tick the periods this invoice covers — the rest stay here for later invoices.
                </p>
                {rent.payments.length === 0 && (
                  <p className="section-desc">No payments yet — fill in the details and Build schedule, or add one by hand.</p>
                )}
                {rent.payments.map((p) => (
                  <div className="rent-row" key={p.id}>
                    <div className="rent-fields">
                      <label className="fld">
                        <span className="fld-label">Payment date</span>
                        <DatePicker value={p.paymentDate} onChange={(v) => updatePayment(p.id, { paymentDate: v })} placeholder="Select date" />
                      </label>
                      <label className="fld">
                        <span className="fld-label">Due date</span>
                        <DatePicker value={p.dueDate} onChange={(v) => updatePayment(p.id, { dueDate: v })} placeholder="Select date" />
                      </label>
                      <label className="fld">
                        <span className="fld-label">Period from</span>
                        <DatePicker value={p.periodFrom} onChange={(v) => updatePayment(p.id, { periodFrom: v })} placeholder="Select date" />
                      </label>
                      <label className="fld">
                        <span className="fld-label">Period to</span>
                        <DatePicker value={p.periodTo} onChange={(v) => updatePayment(p.id, { periodTo: v })} placeholder="Select date" />
                      </label>
                      <label className="fld">
                        <span className="fld-label">Payment total</span>
                        <CurrencyInput
                          formatted
                          value={p.amount}
                          onChange={(e) => updatePayment(p.id, { amount: e.target.value })}
                          aria-label="Payment total"
                        />
                      </label>
                      <label className="fld">
                        <span className="fld-label">Paid?</span>
                        <SelectMenu
                          value={p.paid ? 'yes' : 'no'}
                          onChange={(v) => updatePayment(p.id, { paid: v === 'yes' })}
                          options={PAID_OPTIONS}
                          width="100%"
                        />
                      </label>
                    </div>
                    <div className="rent-row-meta">
                      <label className="remember-checkbox rent-include">
                        <input
                          type="checkbox"
                          checked={p.include}
                          onChange={(e) => updatePayment(p.id, { include: e.target.checked })}
                        />
                        <span>On invoice</span>
                      </label>
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
                {included.length > 0 && (
                  <p className="section-desc rent-selected-total">
                    On this invoice: {included.length} period{included.length === 1 ? '' : 's'} · <strong>{formatCurrency(invoiceTotal)}</strong>
                  </p>
                )}
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
              <RentInvoicePreview doc={invoiceDoc} ref={previewRef} />
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="section-desc">
            Every generated rent invoice — when it was created, and when it was paid.
          </p>

          {rent.history.length === 0 && (
            <div className="glass-panel">
              <p className="text-muted" style={{ margin: 0 }}>
                No invoices yet — generate one from the Generator tab.
              </p>
            </div>
          )}

          <div className="form-card-stack">
            {rent.history.map((h) => (
              <div className="glass-panel" key={h.id}>
                <div className="rent-row-meta">
                  <div>
                    <div className="rent-history-title">{h.lodger?.trim() ? `${h.lodger.trim()} — Rent` : 'Rent'}</div>
                    <div className="rent-history-meta">
                      {h.period ? `${h.period} · ` : ''}
                      Generated {new Date(h.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}<strong>{formatCurrency(h.total)}</strong>
                    </div>
                  </div>
                  <span className="rent-row-actions">
                    <PaidControl
                      paidDate={h.paidDate}
                      onChange={(paidDate) => update({ history: rent.history.map((x) => (x.id === h.id ? { ...x, paidDate } : x)) })}
                    />
                    <button
                      className="btn-icon"
                      onClick={() => { if (!historyDownload) setHistoryDownload(h); }}
                      disabled={!!historyDownload}
                      title="Download this invoice again"
                      aria-label={`Download ${h.lodger || 'rent'} invoice`}
                    >
                      <Download size={16} />
                    </button>
                    <button
                      className="btn-icon btn-icon-danger"
                      onClick={() => deleteEntry(h.id)}
                      title="Delete this invoice from history"
                      aria-label={`Delete ${h.lodger || 'rent'} invoice`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {historyDownload && (
        <div style={{ position: 'fixed', left: '-10000px', top: 0, width: '720px' }} aria-hidden="true">
          <RentInvoicePreview doc={historyDownload} ref={historyPreviewRef} />
        </div>
      )}
    </div>
  );
}
