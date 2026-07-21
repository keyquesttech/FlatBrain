import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, FileText, Landmark, Plus, Trash2, X } from 'lucide-react';
import Navigation from '../components/Navigation';
import CollapsibleCard from '../components/CollapsibleCard';
import CurrencyInput from '../components/CurrencyInput';
import CustomInvoicePreview from '../components/CustomInvoicePreview';
import DatePicker from '../components/DatePicker';
import PaidControl from '../components/PaidControl';
import { appAlert, appConfirm, appToast } from '../components/Dialog';
import { getInvoicesDoc, updateInvoicesDoc } from '../api';
import { formatCurrency, parseAmount, round2 } from '../utils/calculations';
import { captureInvoicePng } from '../utils/invoicePng';
import { newId } from '../utils/id';
import { playSuccess } from '../utils/sound';

const SAVE_DEBOUNCE_MS = 600;

const DEFAULT_INV_BANK = {
  name: 'Your Name',
  bankName: 'Your Bank',
  sortCode: '00-00-00',
  accountNumber: '00000000'
};

function normalizeDoc(d) {
  return {
    title: d?.title || '',
    items: Array.isArray(d?.items) ? d.items : [],
    bankDetails: { ...DEFAULT_INV_BANK, ...(d?.bankDetails || {}) },
    history: Array.isArray(d?.history) ? d.history : []
  };
}

// Custom invoice generator, shaped like Bill Splitter: keep a list of
// anything owed (each line with a due date, amount and paid status), tick
// the lines a given invoice should cover, download it as a PNG — and the
// History tab remembers every generated invoice with when it was created
// and when it got paid.
export default function InvoicesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') === 'history' ? 'history' : 'new';
  const setView = (v) => setSearchParams(v === 'history' ? { view: 'history' } : {});

  const [doc, setDoc] = useState(null);
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

  // Re-download a saved invoice: render its snapshot into a hidden
  // preview, capture that, then unmount it (Bill Splitter's pattern).
  useEffect(() => {
    if (!historyDownload) return;
    let cancelled = false;
    (async () => {
      try {
        await captureInvoicePng(
          historyPreviewRef.current,
          `Invoice-${(historyDownload.title || 'Custom').trim().replace(/\s+/g, '-')}.png`
        );
      } catch (err) {
        console.error('Error re-generating invoice image', err);
        if (!cancelled) appAlert('Failed to generate the invoice image. Please try again.', { title: 'Download failed', tone: 'error' });
      } finally {
        if (!cancelled) setHistoryDownload(null);
      }
    })();
    return () => { cancelled = true; };
  }, [historyDownload]);

  if (!doc) return <div className="page-loading">Loading…</div>;

  const updateItem = (id, changes) => {
    update({ items: doc.items.map((i) => (i.id === id ? { ...i, ...changes } : i)) });
  };

  const addItem = () => {
    update({ items: [...doc.items, { id: newId(), thing: '', dueDate: '', amount: '', paidDate: '', include: true }] });
  };

  const included = doc.items.filter((i) => i.include !== false);
  const invoiceTotal = included.reduce((sum, i) => round2(sum + round2(parseAmount(i.amount))), 0);
  const invoiceDoc = { title: doc.title, items: included, bankDetails: doc.bankDetails };

  const downloadAndSave = async () => {
    if (busy) return;
    if (included.length === 0) {
      appAlert('Tick at least one item ("On invoice") before generating.', { title: 'Nothing to invoice' });
      return;
    }
    setBusy(true);
    try {
      await captureInvoicePng(previewRef.current, `Invoice-${(doc.title || 'Custom').trim().replace(/\s+/g, '-')}.png`);
      const entry = {
        id: newId(),
        title: doc.title,
        items: included.map((i) => ({ ...i })),
        bankDetails: { ...doc.bankDetails },
        total: invoiceTotal,
        generatedAt: Date.now(),
        paidDate: ''
      };
      update({ history: [entry, ...doc.history] });
      playSuccess();
      appToast('Invoice downloaded and saved to history.');
    } catch (err) {
      console.error('Error generating invoice image', err);
      appAlert('Failed to generate the invoice image. See the browser console for details.', { title: 'Download failed', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const deleteEntry = async (id) => {
    if (!await appConfirm('Delete this invoice from the history?', { title: 'Delete invoice', okLabel: 'Delete', danger: true })) return;
    update({ history: doc.history.filter((h) => h.id !== id) });
    appToast('Invoice deleted.');
  };

  return (
    <div className="container animate-fade-in">
      <Navigation showTabs={false} appLabel="Invoices" />

      <nav className="tabs inv-tabs" aria-label="Invoices">
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
                title={<span className="stat-title"><FileText size={15} /> Items</span>}
                storageKey="inv-items"
                actions={(
                  <button className="btn btn-primary btn-sm" onClick={addItem}>
                    <Plus size={16} /> Add item
                  </button>
                )}
              >
                <p className="section-desc">
                  List anything owed — each line has a due date, amount and its own paid status. Tick the lines this invoice covers; the rest stay here for later invoices.
                </p>
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
                {doc.items.length === 0 && (
                  <p className="section-desc">No items yet — add the first one.</p>
                )}
                {doc.items.map((i) => (
                  <div className="inv-row" key={i.id}>
                    <div className="inv-fields">
                      <label className="fld inv-fld-thing">
                        <span className="fld-label">Description</span>
                        <input
                          type="text"
                          value={i.thing}
                          onChange={(e) => updateItem(i.id, { thing: e.target.value })}
                          placeholder="What this line charges for"
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
                          aria-label="Item amount"
                        />
                      </label>
                    </div>
                    <div className="inv-row-meta">
                      <label className="remember-checkbox inv-include">
                        <input
                          type="checkbox"
                          checked={i.include !== false}
                          onChange={(e) => updateItem(i.id, { include: e.target.checked })}
                        />
                        <span>On invoice</span>
                      </label>
                      <span className="inv-row-actions">
                        <PaidControl paidDate={i.paidDate} onChange={(paidDate) => updateItem(i.id, { paidDate })} />
                        <button
                          className="btn-icon btn-icon-danger"
                          onClick={() => update({ items: doc.items.filter((x) => x.id !== i.id) })}
                          aria-label="Remove item"
                          title="Remove this item"
                        >
                          <X size={16} />
                        </button>
                      </span>
                    </div>
                  </div>
                ))}
                {included.length > 0 && (
                  <p className="section-desc inv-included-total">
                    On this invoice: {included.length} item{included.length === 1 ? '' : 's'} · <strong>{formatCurrency(invoiceTotal)}</strong>
                  </p>
                )}
              </CollapsibleCard>

              <CollapsibleCard title={<span className="stat-title"><Landmark size={15} /> Bank details</span>} storageKey="inv-bank">
                <p className="section-desc">Shown on the invoice — separate from Bill Splitter's account details.</p>
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
              <CustomInvoicePreview doc={invoiceDoc} ref={previewRef} />
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="section-desc">
            Every generated invoice — when it was created, and when it was paid.
          </p>

          {doc.history.length === 0 && (
            <div className="glass-panel">
              <p className="text-muted" style={{ margin: 0 }}>
                No invoices yet — generate one from the Generator tab.
              </p>
            </div>
          )}

          <div className="form-card-stack">
            {doc.history.map((h) => (
              <div className="glass-panel inv-history-card" key={h.id}>
                <div className="inv-row-meta">
                  <div>
                    <div className="inv-history-title">{h.title?.trim() || 'Invoice'}</div>
                    <div className="inv-history-meta">
                      Generated {new Date(h.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}{h.items?.length || 0} item{(h.items?.length || 0) === 1 ? '' : 's'}
                      {' · '}<strong>{formatCurrency(h.total)}</strong>
                    </div>
                  </div>
                  <span className="inv-row-actions">
                    <PaidControl
                      paidDate={h.paidDate}
                      onChange={(paidDate) => update({ history: doc.history.map((x) => (x.id === h.id ? { ...x, paidDate } : x)) })}
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
          <CustomInvoicePreview doc={historyDownload} ref={historyPreviewRef} />
        </div>
      )}
    </div>
  );
}
