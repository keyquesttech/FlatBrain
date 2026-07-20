import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, Download, Landmark, Plus, Trash2, X } from 'lucide-react';
import Navigation from '../components/Navigation';
import CollapsibleCard from '../components/CollapsibleCard';
import CurrencyInput from '../components/CurrencyInput';
import DatePicker from '../components/DatePicker';
import RentInvoicePreview from '../components/RentInvoicePreview';
import { appAlert, appConfirm, appToast } from '../components/Dialog';
import { getRent, updateRent } from '../api';
import { formatCurrency, parseAmount, round2 } from '../utils/calculations';
import { captureInvoicePng } from '../utils/invoicePng';
import { newId } from '../utils/id';
import { periodLabel, periodTotal } from '../utils/rent';
import { playSuccess } from '../utils/sound';

const SAVE_DEBOUNCE_MS = 600;

const DEFAULT_RENT_BANK = {
  name: 'Your Name',
  bankName: 'Your Bank',
  sortCode: '00-00-00',
  accountNumber: '00000000'
};

// Pre-redesign rent data stored a block-based schedule (deposit + payments
// with periodStart/months/monthly amount + charges). Fold all of it into
// free-form items once, so nothing already entered is lost.
function migrateV1Items(r) {
  const items = [];
  if (parseAmount(r?.deposit?.amount) > 0) {
    items.push({
      id: newId(),
      thing: 'Deposit',
      dueDate: '',
      amount: String(round2(parseAmount(r.deposit.amount))),
      paidDate: r.deposit.paidDate || '',
      include: true
    });
  }
  (r?.payments || []).forEach((p) => items.push({
    id: p.id || newId(),
    thing: `Rent ${periodLabel(p.periodStart, p.months)}`.trim(),
    dueDate: p.dueDate || '',
    amount: String(periodTotal(p)),
    paidDate: p.paidDate || '',
    include: true
  }));
  (r?.charges || []).forEach((c) => items.push({
    id: c.id || newId(),
    thing: c.thing || 'Charge',
    dueDate: c.dueDate || '',
    amount: String(round2(parseAmount(c.amount))),
    paidDate: c.paidDate || '',
    include: false
  }));
  return items;
}

function normalizeRent(r) {
  const migrated = !Array.isArray(r?.items);
  return {
    title: (migrated ? r?.name : r?.title) || 'Rent',
    items: migrated ? migrateV1Items(r) : r.items,
    bankDetails: { ...DEFAULT_RENT_BANK, ...(r?.bankDetails || {}) },
    history: Array.isArray(r?.history) ? r.history : []
  };
}

// A paid status as a date picker, so anything can be marked paid on ANY
// date: unpaid shows a "Mark paid…" trigger that opens the calendar; once
// set it turns into a lime chip showing the date (still tappable to change
// it) with a small × to unmark.
function PaidControl({ paidDate, onChange }) {
  return (
    <span className={`paid-picker ${paidDate ? 'is-paid' : ''}`}>
      {paidDate && <span className="paid-picker-tag">Paid</span>}
      <DatePicker value={paidDate} onChange={onChange} placeholder="Mark paid…" />
      {paidDate && (
        <button
          type="button"
          className="btn-icon btn-icon-danger"
          onClick={() => onChange('')}
          title="Mark as not paid"
          aria-label="Mark as not paid"
        >
          <X size={14} />
        </button>
      )}
    </span>
  );
}

// Rent invoice generator, shaped like Bill Splitter: keep a list of every
// payment owed (rent blocks, deposit, anything with a due date), tick the
// ones a given invoice should cover, download it as a PNG — and the
// History tab remembers every generated invoice with when it was created
// and when it got paid.
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
          `Rent-${(historyDownload.title || 'Invoice').trim().replace(/\s+/g, '-')}.png`
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

  const updateItem = (id, changes) => {
    update({ items: rent.items.map((i) => (i.id === id ? { ...i, ...changes } : i)) });
  };

  const addItem = () => {
    update({ items: [...rent.items, { id: newId(), thing: '', dueDate: '', amount: '', paidDate: '', include: true }] });
  };

  const included = rent.items.filter((i) => i.include !== false);
  const invoiceTotal = included.reduce((sum, i) => round2(sum + round2(parseAmount(i.amount))), 0);
  const invoiceDoc = { title: rent.title, items: included, bankDetails: rent.bankDetails };

  const downloadAndSave = async () => {
    if (busy) return;
    if (included.length === 0) {
      appAlert('Tick at least one payment ("On invoice") before generating.', { title: 'Nothing to invoice' });
      return;
    }
    setBusy(true);
    try {
      await captureInvoicePng(previewRef.current, `Rent-${(rent.title || 'Invoice').trim().replace(/\s+/g, '-')}.png`);
      const entry = {
        id: newId(),
        title: rent.title,
        items: included.map((i) => ({ ...i })),
        bankDetails: { ...rent.bankDetails },
        total: invoiceTotal,
        generatedAt: Date.now(),
        paidDate: ''
      };
      update({ history: [entry, ...rent.history] });
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
                title={<span className="stat-title"><CalendarClock size={15} /> Payments</span>}
                storageKey="rent-payments"
                actions={(
                  <button className="btn btn-primary btn-sm" onClick={addItem}>
                    <Plus size={16} /> Add payment
                  </button>
                )}
              >
                <p className="section-desc">
                  List every payment owed — rent periods, deposit, anything with a due date. Tick the ones this invoice covers; the rest stay here for later invoices.
                </p>
                <div className="form-group">
                  <label>Invoice title</label>
                  <input
                    type="text"
                    value={rent.title}
                    onChange={(e) => update({ title: e.target.value })}
                    placeholder="e.g. Réka rent — Sep – Oct 2026"
                    maxLength={80}
                  />
                </div>
                {rent.items.length === 0 && (
                  <p className="section-desc">No payments yet — add the first one.</p>
                )}
                {rent.items.map((i) => (
                  <div className="rent-row" key={i.id}>
                    <div className="rent-fields rent-item-fields">
                      <label className="fld rent-fld-thing">
                        <span className="fld-label">Payment</span>
                        <input
                          type="text"
                          value={i.thing}
                          onChange={(e) => updateItem(i.id, { thing: e.target.value })}
                          placeholder="e.g. Rent Jul – Aug 2026, Deposit"
                          maxLength={80}
                        />
                      </label>
                      <label className="fld">
                        <span className="fld-label">Due date</span>
                        <DatePicker value={i.dueDate} onChange={(v) => updateItem(i.id, { dueDate: v })} />
                      </label>
                      <label className="fld">
                        <span className="fld-label">Amount</span>
                        <CurrencyInput
                          formatted
                          value={i.amount}
                          onChange={(e) => updateItem(i.id, { amount: e.target.value })}
                          aria-label="Payment amount"
                        />
                      </label>
                    </div>
                    <div className="rent-row-meta">
                      <label className="remember-checkbox rent-include">
                        <input
                          type="checkbox"
                          checked={i.include !== false}
                          onChange={(e) => updateItem(i.id, { include: e.target.checked })}
                        />
                        <span>On invoice</span>
                      </label>
                      <span className="rent-row-actions">
                        <PaidControl paidDate={i.paidDate} onChange={(paidDate) => updateItem(i.id, { paidDate })} />
                        <button
                          className="btn-icon btn-icon-danger"
                          onClick={() => update({ items: rent.items.filter((x) => x.id !== i.id) })}
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
                  <p className="section-desc rent-included-total">
                    On this invoice: {included.length} payment{included.length === 1 ? '' : 's'} · <strong>{formatCurrency(invoiceTotal)}</strong>
                  </p>
                )}
              </CollapsibleCard>

              <CollapsibleCard title={<span className="stat-title"><Landmark size={15} /> Bank details</span>} storageKey="rent-bank">
                <p className="section-desc">Shown on the rent invoice — separate from Bill Splitter's account details.</p>
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
              <div className="glass-panel rent-history-card" key={h.id}>
                <div className="rent-row-meta">
                  <div>
                    <div className="rent-history-title">{h.title?.trim() || 'Rent'}</div>
                    <div className="rent-period">
                      Generated {new Date(h.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}{h.items?.length || 0} payment{(h.items?.length || 0) === 1 ? '' : 's'}
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
                      aria-label={`Download ${h.title || 'invoice'}`}
                    >
                      <Download size={16} />
                    </button>
                    <button
                      className="btn-icon btn-icon-danger"
                      onClick={() => deleteEntry(h.id)}
                      title="Delete this invoice from history"
                      aria-label={`Delete ${h.title || 'invoice'}`}
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
