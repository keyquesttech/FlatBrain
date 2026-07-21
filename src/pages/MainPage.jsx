import React, { useState, useRef, useEffect } from 'react';
import { Download, RotateCcw, FileDown, FileUp } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import Navigation from '../components/Navigation';
import InvoiceForm from '../components/InvoiceForm';
import InvoicePreview from '../components/InvoicePreview';
import InvoiceHistory from '../components/InvoiceHistory';
import BillsBreakdownChart from '../components/BillsBreakdownChart';
import SelectMenu from '../components/SelectMenu';
import { getDraft, updateDraft, patchDraft, resetDraft, getHistory, saveInvoice, importHistory, deleteInvoice } from '../api';
import { calculateInvoice } from '../utils/calculations';
import { normalizeDraft } from '../utils/defaults';
import { prefillBillsFromHistory } from '../utils/standingCharges';
import { newId } from '../utils/id';
import { captureInvoicePng } from '../utils/invoicePng';
import { historyToCSV, csvToHistory } from '../utils/historyCsv';
import { playSuccess } from '../utils/sound';
import { appAlert, appConfirm, appToast } from '../components/Dialog';

const POLL_MS = 3000;
const SAVE_DEBOUNCE_MS = 600;

export default function MainPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') === 'history' ? 'history' : 'new';
  const setView = (newView) => {
    setSearchParams(newView === 'history' ? { view: 'history' } : {});
  };
  const [formData, setFormData] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [chartMonths, setChartMonths] = useState(6);
  const [busy, setBusy] = useState(false);
  const [historyDownload, setHistoryDownload] = useState(null);
  const previewRef = useRef(null);
  const historyPreviewRef = useRef(null);
  const importInputRef = useRef(null);

  // Refs so the poller and the debounced save always see the latest state
  // without re-subscribing on every keystroke.
  const formDataRef = useRef(null);
  const lastEditRef = useRef(0);
  const saveTimerRef = useRef(null);
  const savePendingRef = useRef(false);
  // Which top-level draft keys have unsaved edits: the debounced write sends
  // only these (via PATCH), so extras added from a flatmate page in the same
  // window survive instead of being overwritten by a whole-draft write.
  const pendingKeysRef = useRef(new Set());
  const editSeqRef = useRef(0);
  // Set while an invoice loaded from history is in the generator, so saving
  // can update that invoice instead of duplicating its month.
  const loadedInvoiceRef = useRef(null);

  const applyDraft = (draft) => {
    const normalized = normalizeDraft(draft);
    formDataRef.current = normalized;
    setFormData(normalized);
  };

  useEffect(() => {
    let cancelled = false;

    getDraft().then((d) => { if (!cancelled) applyDraft(d); }).catch(() => {});
    getHistory().then((h) => { if (!cancelled) setInvoices(h); }).catch(() => {});

    // Poll for changes made from the flatmate pages, but never clobber the
    // form while the user is typing here or has a save in flight. If a
    // previous save failed, retry the queued keys instead of polling.
    const intervalId = setInterval(() => {
      if (savePendingRef.current) {
        if (!saveTimerRef.current) flushPendingKeys();
        return;
      }
      getDraft().then((d) => {
        if (cancelled || savePendingRef.current) return;
        if (Date.now() - lastEditRef.current < POLL_MS) return;
        const normalized = normalizeDraft(d);
        if (JSON.stringify(normalized) !== JSON.stringify(formDataRef.current)) {
          formDataRef.current = normalized;
          setFormData(normalized);
        }
      }).catch(() => {});
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      // Don't lose the last keystrokes when navigating away mid-debounce.
      flushPendingKeys();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Write the queued keys — and only those — so the server merges them into
  // the latest draft. On failure everything stays queued; the poller and the
  // next edit retry.
  const flushPendingKeys = async () => {
    const seq = editSeqRef.current;
    const keys = [...pendingKeysRef.current];
    if (keys.length === 0) {
      savePendingRef.current = false;
      return;
    }
    const local = formDataRef.current;
    const changes = {};
    keys.forEach((k) => { changes[k] = local[k]; });
    // Extras keys travel with their legacy full-price companions cleared so
    // a pre-migration draft on disk can't re-fold old items into the lists.
    if ('matiasExtras' in changes) changes.matiasFullPriceExtras = [];
    if ('rekaExtras' in changes) changes.rekaFullPriceExtras = [];
    try {
      await patchDraft(changes);
      // Only mark clean if nothing changed while the request was in flight;
      // newer edits already re-queued keys and scheduled another flush.
      if (editSeqRef.current === seq) {
        pendingKeysRef.current.clear();
        savePendingRef.current = false;
      }
    } catch {
      savePendingRef.current = true;
    }
  };

  // Update the UI instantly but debounce the network/disk write, tracking
  // which draft keys the edit touched.
  const handleFormChange = (newData) => {
    const prev = formDataRef.current;
    Object.keys(newData).forEach((key) => {
      if (!prev || JSON.stringify(newData[key]) !== JSON.stringify(prev[key])) {
        pendingKeysRef.current.add(key);
      }
    });
    editSeqRef.current++;
    formDataRef.current = newData;
    lastEditRef.current = Date.now();
    setFormData(newData);
    savePendingRef.current = true;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      flushPendingKeys();
    }, SAVE_DEBOUNCE_MS);
  };

  // Cancel any queued draft write so it can't fire after a reset and
  // resurrect the data we just cleared.
  const cancelPendingSave = () => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    savePendingRef.current = false;
    pendingKeysRef.current.clear();
    editSeqRef.current++;
  };

  // After a failed whole-draft write (reset/save flows), queue every key so
  // the retry path sends the full draft.
  const markAllPending = () => {
    Object.keys(formDataRef.current || {}).forEach((k) => pendingKeysRef.current.add(k));
    savePendingRef.current = true;
  };

  const saveToHistory = async () => {
    const data = formDataRef.current;
    const calc = calculateInvoice(data);
    // If this draft was loaded from a saved invoice and still covers the
    // same period, offer to update that invoice in place — otherwise a fixed
    // typo would leave two invoices for the same month.
    const loaded = loadedInvoiceRef.current;
    const updating = !!loaded && loaded.period === data.period &&
      await appConfirm('This invoice was loaded from history. Update the saved invoice, or save it as a new one?', {
        title: 'Update saved invoice?',
        okLabel: 'Update',
        cancelLabel: 'Save as new'
      });
    const newInvoice = {
      ...data,
      id: updating ? loaded.id : newId(),
      timestamp: updating ? (loaded.timestamp || Date.now()) : Date.now(),
      netTotal: calc.grandTotal,
      eachNetTotal: calc.matiasTotalDue,
      matiasTotalDue: calc.matiasTotalDue,
      rekaTotalDue: calc.rekaTotalDue
    };

    const res = await saveInvoice(newInvoice);
    setInvoices(res.history);
    loadedInvoiceRef.current = null;

    // Reset the draft for next month, but keep the standing settings —
    // bank details, names and the bills split — so they never have to be
    // re-entered. The bills come back pre-filled from the rolling average
    // of recent invoices (standing charges memory), so the next invoice
    // starts nearly done; extras, notes and discounts start fresh.
    cancelPendingSave();
    const reset = await resetDraft();
    const prefilled = prefillBillsFromHistory(res.history);
    const nextDraft = {
      ...reset.draft,
      ...(prefilled ? { bills: prefilled } : {}),
      bankDetails: data.bankDetails,
      names: data.names,
      splitPercent: data.splitPercent ?? 50
    };
    applyDraft(nextDraft);
    try {
      await updateDraft(nextDraft);
    } catch {
      // The invoice IS saved — don't surface this as a save failure. Queue
      // the whole draft like any edit; it retries on the next change, poll
      // or unmount, and the pending flag stops the poller clobbering the form.
      markAllPending();
    }
    appToast(`Invoice downloaded, ${updating ? 'updated in' : 'saved to'} history — next month's bills pre-filled from recent averages.`);
  };

  // Single action: download the PNG first (while the invoice is still on
  // screen), then save it to history and reset the draft for next month.
  // The busy flag stops a double-click from saving the invoice twice.
  const saveAndDownload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const downloaded = await generateImage();
      if (downloaded) {
        await saveToHistory();
        playSuccess();
      }
    } catch (err) {
      console.error('Error saving invoice', err);
      appAlert('The image was downloaded, but saving to history failed. Check the server and try again.', { title: 'Save failed', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteInvoice = async (id) => {
    if (!await appConfirm('Delete this invoice from history?', { title: 'Delete invoice', okLabel: 'Delete', danger: true })) return;
    try {
      const res = await deleteInvoice(id);
      setInvoices(res.history);
      appToast('Invoice deleted.');
    } catch (err) {
      console.error('Error deleting invoice', err);
      appAlert('Failed to delete the invoice. Check the server and try again.', { title: 'Delete failed', tone: 'error' });
    }
  };

  const loadInvoice = async (invoice) => {
    if (!await appConfirm('Load this invoice into the generator? The current draft will be replaced.', { title: 'Load invoice', okLabel: 'Load' })) return;
    loadedInvoiceRef.current = { id: invoice.id, period: invoice.period, timestamp: invoice.timestamp };
    const loadedDraft = normalizeDraft({
      period: invoice.period,
      dueDate: invoice.dueDate,
      names: invoice.names,
      bills: invoice.bills,
      matiasExtras: invoice.matiasExtras || [],
      rekaExtras: invoice.rekaExtras || [],
      matiasFullPriceExtras: invoice.matiasFullPriceExtras || [],
      rekaFullPriceExtras: invoice.rekaFullPriceExtras || [],
      matiasNote: invoice.matiasNote || '',
      rekaNote: invoice.rekaNote || '',
      matiasDiscounts: invoice.matiasDiscounts || [],
      rekaDiscounts: invoice.rekaDiscounts || [],
      splitPercent: invoice.splitPercent ?? 50,
      bankDetails: invoice.bankDetails
    });
    handleFormChange(loadedDraft);
    setView('new');
  };

  const exportHistoryCSV = () => {
    const csv = historyToCSV(invoices);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `billsplitter-history-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    try {
      const imported = csvToHistory(await file.text());
      if (!await appConfirm(`Import ${imported.length} invoice${imported.length === 1 ? '' : 's'}? Existing invoices with the same id will be updated; everything else is kept.`, { title: 'Import CSV', okLabel: 'Import' })) return;
      const res = await importHistory(imported);
      setInvoices(res.history);
      appToast(`Imported ${res.imported} invoice${res.imported === 1 ? '' : 's'}.`);
    } catch (err) {
      console.error('Error importing history', err);
      appAlert(err.message || 'Failed to import the file.', { title: 'Import failed', tone: 'error' });
    }
  };

  const generateImage = async () => {
    try {
      await captureInvoicePng(previewRef.current, `Invoice-${formDataRef.current.period || 'Draft'}.png`);
      return true;
    } catch (err) {
      console.error('Error generating image', err);
      appAlert('Failed to generate the invoice image. See the browser console for details.', { title: 'Download failed', tone: 'error' });
      return false;
    }
  };

  // Re-download a saved invoice's PNG without touching the current draft:
  // render it into a hidden preview, capture that, then unmount it.
  const downloadFromHistory = (invoice) => {
    if (historyDownload) return;
    setHistoryDownload(invoice);
  };

  useEffect(() => {
    if (!historyDownload) return;
    let cancelled = false;
    (async () => {
      try {
        await captureInvoicePng(
          historyPreviewRef.current,
          `Invoice-${historyDownload.period || 'Saved'}.png`
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

  const clearForm = async () => {
    if (busy) return;
    if (!await appConfirm('Reset the whole form? All bills and extras in the current draft will be cleared. Names, bills split and bank details are kept.', { title: 'Reset form', okLabel: 'Reset', danger: true })) return;
    cancelPendingSave();
    loadedInvoiceRef.current = null;
    try {
      const current = formDataRef.current;
      const res = await resetDraft();
      // Same as after a save: standing settings survive the reset.
      const nextDraft = {
        ...res.draft,
        bankDetails: current?.bankDetails ?? res.draft.bankDetails,
        names: current?.names ?? res.draft.names,
        splitPercent: current?.splitPercent ?? 50
      };
      applyDraft(nextDraft);
      // Same as after a save: a failed settings write isn't a failed reset.
      try {
        await updateDraft(nextDraft);
      } catch {
        markAllPending();
      }
    } catch (err) {
      console.error('Error resetting draft', err);
      appAlert('Failed to reset the form. Check the server and try again.', { title: 'Reset failed', tone: 'error' });
    }
  };

  if (!formData) return <div className="page-loading">Loading…</div>;

  return (
    <div className="container animate-fade-in">
      <Navigation activeTab={view === 'history' ? 'history' : 'generator'} names={formData.names} appLabel="Bill Splitter" />

      {view === 'new' ? (
        <>
          <div className="page-toolbar">
            <div className="page-toolbar-actions">
              <button className="btn btn-secondary" onClick={clearForm} disabled={busy}>
                <RotateCcw size={16} />
                Reset form
              </button>
              <button className="btn btn-primary" onClick={saveAndDownload} disabled={busy}>
                <Download size={18} />
                {busy ? 'Saving…' : 'Download & Save'}
              </button>
            </div>
          </div>

          <div className="main-content">
            <InvoiceForm data={formData} onChange={handleFormChange} />
            <div className="preview-column">
              <InvoicePreview data={formData} history={invoices} ref={previewRef} />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="page-toolbar">
            <div className="page-toolbar-actions">
              <button className="btn btn-secondary" onClick={exportHistoryCSV} disabled={invoices.length === 0}>
                <FileDown size={16} />
                Export CSV
              </button>
              <button className="btn btn-secondary" onClick={() => importInputRef.current?.click()}>
                <FileUp size={16} />
                Import CSV
              </button>
              <input
                type="file"
                accept=".csv,text/csv"
                ref={importInputRef}
                onChange={handleImportFile}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          <p className="section-desc">
            Tap an invoice to open it in the generator. Export CSV saves the whole history; Import CSV brings it back.
          </p>

          <InvoiceHistory
            invoices={invoices}
            onDelete={handleDeleteInvoice}
            onLoad={loadInvoice}
            onDownload={downloadFromHistory}
            downloadingId={historyDownload?.id}
          />

          {invoices.length > 0 && (
            <div className="glass-panel chart-panel">
              <div className="section-header">
                <h3 className="invoice-section-title">Bills breakdown</h3>
                <label className="chart-months-select">
                  Months
                  <SelectMenu
                    value={chartMonths}
                    onChange={setChartMonths}
                    options={[
                      { value: 3, label: '3' },
                      { value: 6, label: '6' },
                      { value: 12, label: '12' },
                      { value: 0, label: 'All' }
                    ]}
                  />
                </label>
              </div>
              <p className="section-desc">Each month's bills, stacked bill by bill — waived amounts left out.</p>
              <BillsBreakdownChart history={invoices} months={chartMonths} />
            </div>
          )}
        </>
      )}

      {historyDownload && (
        <div style={{ position: 'fixed', left: '-10000px', top: 0, width: '720px' }} aria-hidden="true">
          <InvoicePreview
            data={{ ...normalizeDraft(historyDownload), timestamp: historyDownload.timestamp }}
            history={invoices}
            ref={historyPreviewRef}
          />
        </div>
      )}
    </div>
  );
}
