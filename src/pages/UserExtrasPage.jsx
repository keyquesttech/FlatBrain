import React, { useState, useRef, useEffect } from 'react';
import { getDraft, updateDraft, getHistory } from '../api';
import { clampSplitPercent, extraTotal, formatCurrency, formatExtraLabel, getInvoiceExtrasSection } from '../utils/calculations';
import { DEFAULT_NAMES } from '../utils/defaults';
import { newExtra } from '../utils/id';
import Navigation from '../components/Navigation';
import ExtrasInputList from '../components/ExtrasInputList';
import SpendingChart from '../components/SpendingChart';

const POLL_MS = 3000;
const SAVE_DEBOUNCE_MS = 600;

export default function UserExtrasPage({ personKey }) {
  const extrasKey = `${personKey}Extras`;
  const fullPriceKey = `${personKey}FullPriceExtras`;
  const noteKey = `${personKey}Note`;
  const otherKey = personKey === 'matias' ? 'reka' : 'matias';
  const flatmateLabel = personKey === 'matias' ? 'Flatmate 1' : 'Flatmate 2';
  const otherFlatmateLabel = personKey === 'matias' ? 'Flatmate 2' : 'Flatmate 1';
  const [extras, setExtras] = useState([]);
  const [fullPriceExtras, setFullPriceExtras] = useState([]);
  const [note, setNote] = useState('');
  const [splitPercent, setSplitPercent] = useState(50);
  const [otherFullPriceExtras, setOtherFullPriceExtras] = useState([]);
  const [otherInvoiceItems, setOtherInvoiceItems] = useState([]);
  const [names, setNames] = useState(DEFAULT_NAMES);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const lastEditRef = useRef(0);
  const pendingRef = useRef({});
  const saveTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const applyDraft = (draft) => {
      setExtras(draft[extrasKey] || []);
      setFullPriceExtras(draft[fullPriceKey] || []);
      setNote(draft[noteKey] || '');
      setSplitPercent(clampSplitPercent(draft.splitPercent ?? 50));
      setOtherFullPriceExtras(draft[`${otherKey}FullPriceExtras`] || []);
      setNames({ ...DEFAULT_NAMES, ...(draft.names || {}) });
      setOtherInvoiceItems(getInvoiceExtrasSection(otherKey, draft).items);
      setLoading(false);
    };

    getDraft().then((draft) => { if (!cancelled) applyDraft(draft); }).catch(() => {});
    // History only changes when an invoice is saved on the main page, so one
    // fetch on load is enough — no need to poll it.
    getHistory().then((h) => { if (!cancelled) setHistory(h); }).catch(() => {});

    // Poll the shared draft, but never overwrite the lists while this person
    // is typing or has unsaved edits queued. If a previous save failed, the
    // pending changes are still queued — retry them instead of polling.
    const intervalId = setInterval(() => {
      if (Object.keys(pendingRef.current).length > 0) {
        if (!saveTimerRef.current) flushPending();
        return;
      }
      getDraft().then((draft) => {
        if (cancelled || Object.keys(pendingRef.current).length > 0) return;
        if (Date.now() - lastEditRef.current < POLL_MS) return;
        applyDraft(draft);
      }).catch(() => {});
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      clearTimeout(saveTimerRef.current);
      flushPending();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personKey, extrasKey, fullPriceKey, otherKey]);

  // Merge queued list changes into the latest server draft, so edits made at
  // the same time on other pages aren't lost. On failure the changes are
  // re-queued (newer edits win) and the poller retries them.
  const flushPending = () => {
    const changes = pendingRef.current;
    if (Object.keys(changes).length === 0) return;
    pendingRef.current = {};
    getDraft()
      .then((draft) => updateDraft({ ...draft, ...changes }))
      .catch(() => {
        pendingRef.current = { ...changes, ...pendingRef.current };
      });
  };

  // Queue one or more draft-key changes for the next debounced write.
  const saveDraftChanges = (changes) => {
    lastEditRef.current = Date.now();
    pendingRef.current = { ...pendingRef.current, ...changes };
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      flushPending();
    }, SAVE_DEBOUNCE_MS);
  };

  const saveListToDraft = (key, newList, setter) => {
    setter(newList);
    saveDraftChanges({ [key]: newList });
  };

  // The card shows both lists as one; each row's selector decides whether the
  // item lives in the shared-split list or the 100% (full price) list.
  const combinedExtras = [
    ...extras.map((e) => ({ ...e, split: 'shared' })),
    ...fullPriceExtras.map((e) => ({ ...e, split: 'full' }))
  ];

  const updateCombined = (id, field, value) => {
    if (extras.some((e) => e.id === id)) {
      saveListToDraft(extrasKey, extras.map((e) => (e.id === id ? { ...e, [field]: value } : e)), setExtras);
    } else {
      saveListToDraft(fullPriceKey, fullPriceExtras.map((e) => (e.id === id ? { ...e, [field]: value } : e)), setFullPriceExtras);
    }
  };

  const removeCombined = (id) => {
    if (extras.some((e) => e.id === id)) {
      saveListToDraft(extrasKey, extras.filter((e) => e.id !== id), setExtras);
    } else {
      saveListToDraft(fullPriceKey, fullPriceExtras.filter((e) => e.id !== id), setFullPriceExtras);
    }
  };

  const setSplitCombined = (id, split) => {
    const inShared = extras.some((e) => e.id === id);
    if ((split === 'full') !== inShared) return; // already in the right list
    const fromList = inShared ? extras : fullPriceExtras;
    const item = fromList.find((e) => e.id === id);
    if (!item) return;
    const newShared = inShared ? extras.filter((e) => e.id !== id) : [...extras, item];
    const newFull = inShared ? [...fullPriceExtras, item] : fullPriceExtras.filter((e) => e.id !== id);
    setExtras(newShared);
    setFullPriceExtras(newFull);
    saveDraftChanges({ [extrasKey]: newShared, [fullPriceKey]: newFull });
  };

  const otherDisplayName = names[otherKey].trim() || otherFlatmateLabel;
  const displayName = names[personKey].trim() || flatmateLabel;

  // This person's share of the split (the main page sets flatmate 1's share).
  const myPct = personKey === 'matias' ? splitPercent : Math.round((100 - splitPercent) * 100) / 100;
  const otherPct = Math.round((100 - myPct) * 100) / 100;

  const otherFullPricePreviewItems = otherFullPriceExtras.map((extra) => ({
    ...extra,
    fullPriceFrom: otherKey
  }));

  if (loading) return <div className="page-loading">Loading…</div>;

  return (
    <div className="container container-narrow animate-fade-in">
      <Navigation activeTab={personKey === 'matias' ? 'flatmate1' : 'flatmate2'} names={names} />

      <div className="page-header">
        <h1>{displayName}'s Extras</h1>
        <p className="text-muted">Add items you bought for the flat — they sync live to the invoice.</p>
      </div>

      <div className="form-card-stack">
        <div className="glass-panel">
          <ExtrasInputList
            title={`${displayName}'s Extras`}
            description={`Per item: ${myPct}/${otherPct} split with ${otherDisplayName}, or 100% charged to ${otherDisplayName}.`}
            extras={combinedExtras}
            onAdd={() => saveListToDraft(extrasKey, [...extras, newExtra()], setExtras)}
            onUpdate={updateCombined}
            onRemove={removeCombined}
            splitOptions={[
              { value: 'shared', label: `${myPct}/${otherPct}` },
              { value: 'full', label: '100%' }
            ]}
            onSplitChange={setSplitCombined}
          />
        </div>

        <div className="glass-panel">
          <h3 className="invoice-section-title">Your notes</h3>
          <p className="section-desc">Optional. Shown on the invoice under your total.</p>
          <textarea
            value={note}
            onChange={(e) => saveListToDraft(noteKey, e.target.value, setNote)}
            placeholder="Optional note shown on the invoice"
            rows={2}
            maxLength={300}
            aria-label="Your note"
          />
        </div>

        <div className="glass-panel">
          <h3 className="invoice-section-title">{otherDisplayName}'s invoice items</h3>
          <p className="section-desc">
            What {otherDisplayName} will be charged for, including your full price extras.
          </p>
          {otherInvoiceItems.map((extra) => (
            <div key={extra.id} className="preview-row">
              <span>{formatExtraLabel(extra, names)}</span>
              <span>{formatCurrency(extraTotal(extra))}</span>
            </div>
          ))}
        </div>

        <div className="glass-panel">
          <h3 className="invoice-section-title">Charged to you</h3>
          <p className="section-desc">
            Full price extras added by {otherDisplayName} that will appear on your invoice.
          </p>
          {otherFullPricePreviewItems.map((extra) => (
            <div key={extra.id} className="preview-row">
              <span>{formatExtraLabel(extra, names)}</span>
              <span>{formatCurrency(extraTotal(extra))}</span>
            </div>
          ))}
        </div>

        <div className="glass-panel">
          <h3 className="invoice-section-title">History</h3>
          <p className="section-desc">Bills total per month from saved invoices.</p>
          <SpendingChart history={history} />
        </div>
      </div>
    </div>
  );
}
