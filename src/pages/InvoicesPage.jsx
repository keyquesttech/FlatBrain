import React, { useEffect, useRef, useState } from 'react';
import { Download, FileText, Landmark, Plus, RotateCcw, X } from 'lucide-react';
import Navigation from '../components/Navigation';
import CollapsibleCard from '../components/CollapsibleCard';
import CurrencyInput from '../components/CurrencyInput';
import CustomInvoicePreview from '../components/CustomInvoicePreview';
import DatePicker from '../components/DatePicker';
import { appAlert, appConfirm, appToast } from '../components/Dialog';
import { getInvoicesDoc, updateInvoicesDoc } from '../api';
import { captureInvoicePng } from '../utils/invoicePng';
import { currencySymbol } from '../utils/currency';
import { newId } from '../utils/id';
import { playSuccess } from '../utils/sound';

const SAVE_DEBOUNCE_MS = 600;

// Bank details are typed fresh per invoice and cleared with the rest of
// the form — the preview shows its placeholders until they're filled.
const EMPTY_BANK = {
  name: '',
  bankName: '',
  sortCode: '',
  accountNumber: ''
};

// Items are Bill Splitter-style lines: description, units and the TOTAL
// price for the line (the per-unit price is derived, never entered).
function normalizeDoc(d) {
  return {
    title: d?.title || '',
    dueDate: d?.dueDate || '',
    items: (Array.isArray(d?.items) ? d.items : []).map((i) => ({
      id: i.id || newId(),
      thing: i.thing || '',
      units: i.units ?? 1,
      amount: i.amount || ''
    })),
    bankDetails: { ...EMPTY_BANK, ...(d?.bankDetails || {}) }
  };
}

// Custom one-off invoice generator: build an itemized invoice like Bill
// Splitter's and download it as a PNG. Deliberately no history — the
// draft persists on the server so it survives reloads, but downloading
// is the whole job.
export default function InvoicesPage() {
  const [doc, setDoc] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const [busy, setBusy] = useState(false);
  const dataRef = useRef(null);
  const saveTimerRef = useRef(null);
  const pendingRef = useRef(false);
  const previewRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getInvoicesDoc()
      .then((d) => {
        if (cancelled) return;
        dataRef.current = normalizeDoc(d);
        setDoc(dataRef.current);
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
      await updateInvoicesDoc(dataRef.current);
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
    setDoc(next);
    pendingRef.current = true;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  };

  if (!doc) return <div className="page-loading">Loading…</div>;

  const updateItem = (id, changes) => {
    update({ items: doc.items.map((i) => (i.id === id ? { ...i, ...changes } : i)) });
  };

  const addItem = () => {
    update({ items: [...doc.items, { id: newId(), thing: '', units: 1, amount: '' }] });
  };

  // Everything clears, bank details included — they're per-invoice, not
  // standing settings, so nothing lingers after a download or reset.
  const resetDoc = () => update({ title: '', dueDate: '', items: [], bankDetails: { ...EMPTY_BANK } });

  const downloadInvoice = async () => {
    if (busy) return;
    if (doc.items.length === 0) {
      appAlert('Add at least one item before generating.', { title: 'Nothing to invoice' });
      return;
    }
    setBusy(true);
    try {
      await captureInvoicePng(previewRef.current, `Invoice-${(doc.title || 'Custom').trim().replace(/\s+/g, '-')}.png`);
      resetDoc();
      playSuccess();
      appToast('Invoice downloaded — form reset for the next one.');
    } catch (err) {
      console.error('Error generating invoice image', err);
      appAlert('Failed to generate the invoice image. See the browser console for details.', { title: 'Download failed', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const clearForm = async () => {
    if (busy) return;
    if (!await appConfirm('Reset the invoice? Title, due date, items and bank details will be cleared.', { title: 'Reset invoice', okLabel: 'Reset', danger: true })) return;
    resetDoc();
  };

  return (
    <div className="container animate-fade-in">
      <Navigation showTabs={false} appLabel="Invoices" />

      <div className="page-toolbar">
        <div className="page-toolbar-actions">
          <button className="btn btn-secondary" onClick={clearForm} disabled={busy}>
            <RotateCcw size={16} />
            Reset invoice
          </button>
          <button className="btn btn-primary" onClick={downloadInvoice} disabled={busy}>
            <Download size={18} />
            {busy ? 'Generating…' : 'Download invoice'}
          </button>
        </div>
      </div>

      <div className="main-content">
        <div className="form-card-stack">
          <CollapsibleCard title={<span className="stat-title"><FileText size={15} /> Invoice Details</span>} storageKey="inv-details">
            <div className="form-group">
              <label>Invoice title</label>
              <input
                type="text"
                value={doc.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="e.g. September Deposit, Garden repairs"
                maxLength={80}
              />
            </div>
            <div className="form-group">
              <label>Due Date</label>
              <DatePicker value={doc.dueDate} onChange={(v) => update({ dueDate: v })} />
            </div>
          </CollapsibleCard>

          <CollapsibleCard
            title={<span className="stat-title"><Landmark size={15} /> Items</span>}
            storageKey="inv-items"
            actions={(
              <button className="btn btn-primary btn-sm" onClick={addItem}>
                <Plus size={16} /> Add Item
              </button>
            )}
          >
            <p className="section-desc">
              Enter the units and the total for each line — the per-unit price works itself out.
            </p>
            {doc.items.length === 0 && (
              <p className="section-desc">No items yet — add the first one.</p>
            )}
            {doc.items.length > 0 && (
              <div className="input-row extras-row row-labels" aria-hidden="true">
                <span className="rl-over-input">Item</span>
                <span className="packs-input">Units</span>
                <span className="currency-input rl-over-pill">Total {currencySymbol()}</span>
                <span className="row-labels-action" />
              </div>
            )}
            {doc.items.map((i) => (
              <div key={i.id} className="input-row extras-row">
                <input
                  type="text"
                  value={i.thing}
                  onChange={(e) => updateItem(i.id, { thing: e.target.value })}
                  placeholder="Item"
                  aria-label="Item description"
                  maxLength={80}
                />
                <input
                  type="number"
                  className="packs-input"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={i.units}
                  onChange={(e) => updateItem(i.id, { units: e.target.value })}
                  placeholder="1"
                  aria-label="Units"
                />
                <CurrencyInput
                  formatted
                  value={i.amount}
                  onChange={(e) => updateItem(i.id, { amount: e.target.value })}
                  placeholder="Total"
                  aria-label="Item total price"
                />
                <button
                  className="btn btn-danger action-btn"
                  onClick={() => update({ items: doc.items.filter((x) => x.id !== i.id) })}
                  aria-label="Remove item"
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </CollapsibleCard>

          <CollapsibleCard title={<span className="stat-title"><Landmark size={15} /> Bank Details</span>} storageKey="inv-bank">
            <p className="section-desc">Printed on the invoice — cleared after every download or reset, so each invoice starts blank.</p>
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
                  value={doc.bankDetails[key]}
                  onChange={(e) => update({ bankDetails: { ...doc.bankDetails, [key]: e.target.value } })}
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
          <CustomInvoicePreview doc={doc} ref={previewRef} />
        </div>
      </div>
    </div>
  );
}
