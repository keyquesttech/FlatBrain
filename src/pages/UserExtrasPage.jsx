import React, { useState, useRef, useEffect } from 'react';
import { getDraft, updateDraft, getHistory } from '../api';
import { extraPercent, extraTotal, formatCurrency, formatExtraLabel, mergedExtras } from '../utils/calculations';
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
  const [otherExtras, setOtherExtras] = useState([]);
  const [note, setNote] = useState('');
  const [names, setNames] = useState(DEFAULT_NAMES);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const lastEditRef = useRef(0);
  const pendingRef = useRef({});
  const saveTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const applyDraft = (draft) => {
      setExtras(mergedExtras(draft, personKey));
      setOtherExtras(mergedExtras(draft, otherKey));
      setNote(draft[noteKey] || '');
      setNames({ ...DEFAULT_NAMES, ...(draft.names || {}) });
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
  }, [personKey, extrasKey, fullPriceKey, noteKey, otherKey]);

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

  // Writes always clear the legacy full-price list: its items were folded
  // into the merged list on read, so leaving them behind would duplicate.
  const saveExtras = (newList) => {
    setExtras(newList);
    saveDraftChanges({ [extrasKey]: newList, [fullPriceKey]: [] });
  };

  const saveNote = (value) => {
    setNote(value);
    saveDraftChanges({ [noteKey]: value });
  };

  const otherDisplayName = names[otherKey].trim() || otherFlatmateLabel;
  const displayName = names[personKey].trim() || flatmateLabel;

  const fmtPct = (n) => Math.round(n * 100) / 100;

  // What the other flatmate pays: their share of items added here, plus
  // their remainder of items they added themselves.
  const chargedToOther = [
    ...extras
      .map((e) => ({ ...e, addedByYou: true, pct: fmtPct(extraPercent(e)) }))
      .filter((e) => e.pct > 0),
    ...otherExtras
      .map((e) => ({ ...e, addedByYou: false, pct: fmtPct(100 - extraPercent(e)) }))
      .filter((e) => e.pct > 0)
  ];

  // Items the other flatmate added that charge this person.
  const chargedToYou = otherExtras
    .map((e) => ({ ...e, pct: fmtPct(extraPercent(e)) }))
    .filter((e) => e.pct > 0);

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
            description={`Each item's % is charged to ${otherDisplayName}; you pay the rest. Default 50%.`}
            extras={extras}
            onAdd={() => saveExtras([...extras, newExtra()])}
            onUpdate={(id, field, value) => saveExtras(extras.map((e) => (e.id === id ? { ...e, [field]: value } : e)))}
            onRemove={(id) => saveExtras(extras.filter((e) => e.id !== id))}
            percentTo={otherDisplayName}
          />
        </div>

        <div className="glass-panel">
          <h3 className="invoice-section-title">Your notes</h3>
          <p className="section-desc">Optional. Shown on the invoice under your total.</p>
          <textarea
            value={note}
            onChange={(e) => saveNote(e.target.value)}
            placeholder="Optional note shown on the invoice"
            rows={2}
            maxLength={300}
            aria-label="Your note"
          />
        </div>

        <div className="glass-panel">
          <h3 className="invoice-section-title">Charged to {otherDisplayName}</h3>
          <p className="section-desc">
            {otherDisplayName}'s share of every extra, including items they added.
          </p>
          {chargedToOther.map((extra) => {
            const total = extraTotal(extra);
            return (
              <div key={extra.id} className="preview-item">
                <div className="preview-item-main">
                  <span>{formatExtraLabel(extra)}</span>
                  <span>{formatCurrency((total * extra.pct) / 100)}</span>
                </div>
                <div className="preview-item-sub">
                  Added by {extra.addedByYou ? 'you' : otherDisplayName} — {otherDisplayName} pays {extra.pct}% of {formatCurrency(total)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="glass-panel">
          <h3 className="invoice-section-title">Charged to you</h3>
          <p className="section-desc">
            Your share of items {otherDisplayName} added. You also pay the remaining % of your own items above.
          </p>
          {chargedToYou.map((extra) => {
            const total = extraTotal(extra);
            return (
              <div key={extra.id} className="preview-item">
                <div className="preview-item-main">
                  <span>{formatExtraLabel(extra)}</span>
                  <span>{formatCurrency((total * extra.pct) / 100)}</span>
                </div>
                <div className="preview-item-sub">
                  Added by {otherDisplayName} — you pay {extra.pct}% of {formatCurrency(total)}
                </div>
              </div>
            );
          })}
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
