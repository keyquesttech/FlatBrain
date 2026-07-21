import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, Download, KeyRound, Landmark, Pencil, RotateCcw, Save, Trash2 } from 'lucide-react';
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
import { formatDay, formatPeriod, monthsBetween, periodUnits, periodUnitsLabel } from '../utils/dates';
import { captureInvoicePng } from '../utils/invoicePng';
import { newId } from '../utils/id';

const SAVE_DEBOUNCE_MS = 600;

const DEFAULT_RENT_BANK = {
  name: 'Your Name',
  bankName: 'Your Bank',
  sortCode: '00-00-00',
  accountNumber: '00000000'
};

const UNIT_OPTIONS = [
  { value: 'month', label: 'Per month' },
  { value: 'week', label: 'Per week' },
  { value: 'day', label: 'Per day' }
];

// Period total = the 1× period rent × how many units the period spans,
// in whatever unit rent is charged per. Null when it can't be computed.
function autoTotal(rate, unit, fromISO, toISO) {
  const rateN = parseAmount(rate);
  const units = periodUnits(fromISO, toISO, unit);
  if (rateN <= 0 || units <= 0) return null;
  return String(round2(rateN * units));
}

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
    unitRent: r?.unitRent || '',
    unitPeriod: ['month', 'week', 'day'].includes(r?.unitPeriod) ? r.unitPeriod : 'month',
    payments: (Array.isArray(r?.payments) ? r.payments : []).map(normalizePayment),
    // The one period currently being composed (or edited) in the generator
    draftPayment: normalizePayment(r?.draftPayment ?? {}),
    editingId: typeof r?.editingId === 'string' ? r.editingId : '',
    bankDetails: { ...DEFAULT_RENT_BANK, ...(r?.bankDetails || {}) }
  };
}

const pad = (n) => String(n).padStart(2, '0');
const byPeriod = (a, b) => (a.periodFrom || '').localeCompare(b.periodFrom || '');

// The next block after `last`: same length, starting the month after the
// previous period ends, due on its first day.
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

// Rent, shaped like Bill Splitter: the Generator composes ONE period at a
// time — fill the dates (the total fills itself from the 1× period rent),
// Save payment files it in History, and the form rolls on to the next
// block. History shows every saved period as a tile with a live invoice
// thumbnail; from there each one can be edited, downloaded, marked paid
// or deleted. Filling a payment date is what marks a period paid.
export default function RentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') === 'history' ? 'history' : 'new';
  const setView = (v) => setSearchParams(v === 'history' ? { view: 'history' } : {});

  const [rent, setRent] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const [periodDownload, setPeriodDownload] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
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

  const draft = rent.draftPayment;
  const editing = rent.editingId ? rent.payments.find((p) => p.id === rent.editingId) : null;

  // Editing the draft's period recomputes its total from the 1× period
  // rent; the total stays hand-editable afterwards.
  const updateDraft = (changes) => {
    const next = { ...draft, ...changes };
    if ('periodFrom' in changes || 'periodTo' in changes) {
      const auto = autoTotal(rent.unitRent, rent.unitPeriod, next.periodFrom, next.periodTo);
      if (auto != null) next.amount = auto;
    }
    update({ draftPayment: next });
  };

  // Changing the rate (or its unit) refills the draft and every saved period.
  const updateRate = (changes) => {
    const merged = { ...rent, ...changes };
    const refill = (p) => {
      const auto = autoTotal(merged.unitRent, merged.unitPeriod, p.periodFrom, p.periodTo);
      return auto != null ? { ...p, amount: auto } : p;
    };
    update({
      ...changes,
      draftPayment: refill(draft),
      payments: rent.payments.map(refill)
    });
  };

  const updatePayment = (id, changes) => {
    update({ payments: rent.payments.map((p) => (p.id === id ? { ...p, ...changes } : p)) });
  };

  // Save the composed period into History. A fresh save rolls the form on
  // to the next block; updating an edited period clears the form instead.
  const saveDraft = () => {
    if (!draft.periodFrom || !draft.periodTo) {
      appAlert('Pick the period dates before saving.', { title: 'Save payment' });
      return;
    }
    if (editing) {
      update({
        payments: rent.payments.map((p) => (p.id === editing.id ? { ...draft, id: editing.id } : p)),
        draftPayment: normalizePayment({}),
        editingId: ''
      });
      appToast('Period updated in history.');
    } else {
      const saved = { ...draft, id: newId() };
      const next = continueFrom(saved);
      const auto = autoTotal(rent.unitRent, rent.unitPeriod, next.periodFrom, next.periodTo);
      if (auto != null) next.amount = auto;
      update({
        payments: [...rent.payments, saved],
        draftPayment: next
      });
      appToast('Period saved to history — form moved on to the next block.');
    }
  };

  const editPayment = (p) => {
    update({ draftPayment: normalizePayment({ ...p }), editingId: p.id });
    setView('new');
  };

  const cancelEdit = () => {
    update({ draftPayment: normalizePayment({}), editingId: '' });
  };

  const deletePayment = async (p) => {
    if (!await appConfirm(`Delete the ${formatPeriod(p.periodFrom, p.periodTo) || 'selected'} period from history?`, { title: 'Delete period', okLabel: 'Delete', danger: true })) return;
    update({
      payments: rent.payments.filter((x) => x.id !== p.id),
      ...(rent.editingId === p.id ? { draftPayment: normalizePayment({}), editingId: '' } : {})
    });
    setSelected((s) => { const next = new Set(s); next.delete(p.id); return next; });
    appToast('Period deleted.');
  };

  // Bulk selection on the History tab: tick tiles (or Select all), then
  // delete them in one confirmed sweep.
  const toggleSelect = (id) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!await appConfirm(`Delete ${selected.size} selected period${selected.size === 1 ? '' : 's'} from history? This can't be undone.`, { title: 'Delete selected', okLabel: 'Delete', danger: true })) return;
    update({
      payments: rent.payments.filter((p) => !selected.has(p.id)),
      ...(selected.has(rent.editingId) ? { draftPayment: normalizePayment({}), editingId: '' } : {})
    });
    setSelected(new Set());
    appToast('Selected periods deleted.');
  };

  const clearForm = async () => {
    if (!await appConfirm('Reset the form? The tenancy details and the period being composed will be cleared — saved periods and bank details are kept.', { title: 'Reset form', okLabel: 'Reset', danger: true })) return;
    update({
      lodger: '',
      deposit: '',
      startDate: '',
      endDate: '',
      unitRent: '',
      unitPeriod: 'month',
      draftPayment: normalizePayment({}),
      editingId: ''
    });
    appToast('Form reset — saved periods and bank details kept.');
  };

  const sortedPayments = [...rent.payments].sort(byPeriod);
  const draftHasContent = draft.periodFrom || draft.periodTo || parseAmount(draft.amount) > 0;
  const docFor = (period) => ({
    lodger: rent.lodger,
    deposit: rent.deposit,
    startDate: rent.startDate,
    endDate: rent.endDate,
    unitPeriod: rent.unitPeriod,
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
              <button className="btn btn-primary" onClick={saveDraft}>
                <Save size={16} />
                {editing ? 'Update payment' : 'Save payment'}
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
                    <span className="fld-label">Start date</span>
                    <DatePicker value={rent.startDate} onChange={(v) => update({ startDate: v })} placeholder="Select date" />
                  </label>
                  <label className="fld">
                    <span className="fld-label">End date</span>
                    <DatePicker value={rent.endDate} onChange={(v) => update({ endDate: v })} placeholder="Select date" />
                  </label>
                  <label className="fld">
                    <span className="fld-label">1× period rent</span>
                    <CurrencyInput
                      formatted
                      value={rent.unitRent}
                      onChange={(e) => updateRate({ unitRent: e.target.value })}
                      aria-label="Rent for one charging period"
                    />
                  </label>
                  <label className="fld">
                    <span className="fld-label">Charged</span>
                    <SelectMenu
                      value={rent.unitPeriod}
                      onChange={(v) => updateRate({ unitPeriod: v })}
                      options={UNIT_OPTIONS}
                      width="100%"
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
                </div>
              </CollapsibleCard>

              <CollapsibleCard
                title={<span className="stat-title"><CalendarClock size={15} /> Payment</span>}
                storageKey="rent-payments"
                actions={editing ? (
                  <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>
                    Cancel edit
                  </button>
                ) : undefined}
              >
                <p className="section-desc">
                  One period at a time — the total works itself out from the 1× period rent, and filling the payment date marks it paid. Save payment files it in History and rolls the form on to the next block.
                </p>
                {editing && (
                  <p className="section-desc stat-detail-warn">
                    Editing {formatPeriod(editing.periodFrom, editing.periodTo) || 'a saved period'} — Save updates it in place.
                  </p>
                )}
                <div className="rent-fields">
                  <label className="fld">
                    <span className="fld-label">Period from</span>
                    <DatePicker value={draft.periodFrom} onChange={(v) => updateDraft({ periodFrom: v })} placeholder="Select date" />
                  </label>
                  <label className="fld">
                    <span className="fld-label">Period to</span>
                    <DatePicker value={draft.periodTo} onChange={(v) => updateDraft({ periodTo: v })} placeholder="Select date" />
                  </label>
                  <label className="fld">
                    <span className="fld-label">Due date</span>
                    <DatePicker value={draft.dueDate} onChange={(v) => updateDraft({ dueDate: v })} placeholder="Select date" />
                  </label>
                  <div className="fld">
                    <span className="fld-label">Period total — automatic</span>
                    <div
                      className="rent-total-display"
                      title="1× period rent × the period's length"
                      aria-label="Period total"
                    >
                      {parseAmount(draft.amount) > 0
                        ? formatCurrency(draft.amount)
                        : parseAmount(rent.unitRent) > 0 ? '—' : 'Set the 1× period rent'}
                    </div>
                  </div>
                  <label className="fld rent-fld-wide">
                    <span className="fld-label">Payment date — filling it marks the period paid</span>
                    <DatePicker value={draft.paymentDate} onChange={(v) => updateDraft({ paymentDate: v })} placeholder="Not paid yet" />
                  </label>
                </div>
                <div className="rent-row-meta">
                  <span className="rent-period">
                    {formatPeriod(draft.periodFrom, draft.periodTo) || 'Pick the period dates'}
                    {periodUnitsLabel(draft.periodFrom, draft.periodTo, rent.unitPeriod) ? ` · ${periodUnitsLabel(draft.periodFrom, draft.periodTo, rent.unitPeriod)} block` : ''}
                    {draft.paymentDate ? ` · paid ${formatDay(draft.paymentDate)}` : ''}
                  </span>
                </div>
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
              <RentInvoicePreview doc={docFor(draftHasContent ? { ...draft, id: 'draft' } : null)} />
            </div>
          </div>
        </>
      ) : (
        <>
          {sortedPayments.length > 0 && (
            <div className="page-toolbar">
              <div className="page-toolbar-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => setSelected(selected.size === sortedPayments.length ? new Set() : new Set(sortedPayments.map((p) => p.id)))}
                >
                  {selected.size === sortedPayments.length ? 'Clear selection' : 'Select all'}
                </button>
                <button className="btn btn-danger" onClick={deleteSelected} disabled={selected.size === 0}>
                  <Trash2 size={16} />
                  Delete selected{selected.size > 0 ? ` (${selected.size})` : ''}
                </button>
              </div>
            </div>
          )}

          <p className="section-desc">
            Every saved period as its own invoice — tap the pencil to edit it in the generator, download it, or mark it paid when the money lands. Tick tiles to delete several at once.
          </p>

          {sortedPayments.length === 0 && (
            <div className="glass-panel">
              <p className="text-muted" style={{ margin: 0 }}>
                No periods yet — compose the first one on the Generator tab.
              </p>
            </div>
          )}

          <div className="rent-grid">
            {sortedPayments.map((p) => (
              <div className={`glass-panel rent-tile ${selected.has(p.id) ? 'rent-tile-selected' : ''}`} key={p.id}>
                <label className="remember-checkbox rent-tile-select" title="Select this period">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleSelect(p.id)}
                    aria-label={`Select ${formatPeriod(p.periodFrom, p.periodTo) || 'this period'}`}
                  />
                </label>
                <div className="rent-thumb" aria-hidden="true">
                  <div className="rent-thumb-inner">
                    <RentInvoicePreview doc={docFor(p)} />
                  </div>
                </div>
                <div>
                  <div className="rent-tile-title">
                    {formatPeriod(p.periodFrom, p.periodTo) || 'Period'}
                  </div>
                  <div className="rent-tile-meta">
                    {p.dueDate ? `Due ${formatDay(p.dueDate)}` : 'No due date'}
                  </div>
                  <div className="rent-tile-meta">
                    {periodUnitsLabel(p.periodFrom, p.periodTo, rent.unitPeriod) ? `${periodUnitsLabel(p.periodFrom, p.periodTo, rent.unitPeriod)} · ` : ''}
                    <strong>{formatCurrency(p.amount)}</strong>
                  </div>
                </div>
                <div className="rent-tile-actions">
                  <PaidControl
                    paidDate={p.paymentDate}
                    onChange={(d) => updatePayment(p.id, { paymentDate: d })}
                  />
                  <span className="rent-row-actions">
                    <button
                      className="btn-icon"
                      onClick={() => editPayment(p)}
                      title="Edit this period in the generator"
                      aria-label={`Edit ${formatPeriod(p.periodFrom, p.periodTo) || 'this period'}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => { if (!periodDownload) setPeriodDownload(p); }}
                      disabled={!!periodDownload}
                      title="Download this period's invoice"
                      aria-label={`Download invoice for ${formatPeriod(p.periodFrom, p.periodTo) || 'this period'}`}
                    >
                      <Download size={15} />
                    </button>
                    <button
                      className="btn-icon btn-icon-danger"
                      onClick={() => deletePayment(p)}
                      title="Delete this period"
                      aria-label={`Delete ${formatPeriod(p.periodFrom, p.periodTo) || 'this period'}`}
                    >
                      <Trash2 size={15} />
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
