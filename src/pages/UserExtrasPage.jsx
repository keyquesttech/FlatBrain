import React, { useState, useRef, useEffect } from 'react';
import { getDraft, patchDraft, getHistory } from '../api';
import { extraPercent, extraShares, formatCurrency, formatExtraLabel, mergedExtras } from '../utils/calculations';
import { flatmateNames } from '../utils/panelSettings';
import { newExtra } from '../utils/id';
import Navigation from '../components/Navigation';
import ExtrasInputList from '../components/ExtrasInputList';
import SpendingChart from '../components/SpendingChart';
import CollapsibleCard from '../components/CollapsibleCard';
import { ArrowRightLeft, BarChart3, Plus, Receipt, ShoppingBag, StickyNote } from 'lucide-react';

const POLL_MS = 3000;
const SAVE_DEBOUNCE_MS = 600;

export default function UserExtrasPage({ personKey }) {
  const extrasKey = `${personKey}Extras`;
  const fullPriceKey = `${personKey}FullPriceExtras`;
  const noteKey = `${personKey}Note`;
  const otherKey = personKey === 'matias' ? 'reka' : 'matias';
  const [extras, setExtras] = useState([]);
  const [otherExtras, setOtherExtras] = useState([]);
  const [note, setNote] = useState('');
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

  // Send only the changed keys; the server merges them into the latest
  // draft atomically, so edits made at the same time on other pages aren't
  // lost. On failure the changes are re-queued (newer edits win) and the
  // poller retries them.
  const flushPending = () => {
    const changes = pendingRef.current;
    if (Object.keys(changes).length === 0) return;
    pendingRef.current = {};
    patchDraft(changes).catch(() => {
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

  // Panel-wide names from Settings' Flatmates card (already fall back to
  // the defaults, so no per-key fallback needed here).
  const names = flatmateNames();
  const otherDisplayName = names[otherKey];
  const displayName = names[personKey];

  const fmtPct = (n) => Math.round(n * 100) / 100;

  // What the other flatmate pays: the charged remainder of items added here
  // (100 − your %), plus their own share of items they added themselves.
  // Amounts use the same rounded parts as the invoice so every page shows
  // identical pennies.
  const chargedToOther = [
    ...extras
      .map((e) => ({ ...e, addedByYou: true, pct: fmtPct(100 - extraPercent(e)), share: extraShares(e).other }))
      .filter((e) => e.pct > 0),
    ...otherExtras
      .map((e) => ({ ...e, addedByYou: false, pct: fmtPct(extraPercent(e)), share: extraShares(e).own }))
      .filter((e) => e.pct > 0)
  ];

  // Items the other flatmate added that charge this person (their remainder).
  const chargedToYou = otherExtras
    .map((e) => ({ ...e, pct: fmtPct(100 - extraPercent(e)), share: extraShares(e).other }))
    .filter((e) => e.pct > 0);

  if (loading) return <div className="page-loading">Loading…</div>;

  return (
    <div className="container container-narrow animate-fade-in">
      <Navigation activeTab={personKey === 'matias' ? 'flatmate1' : 'flatmate2'} names={names} appLabel="Bill Splitter" />

      <div className="page-header">
        <h1>{displayName}'s Extras</h1>
        <p className="text-muted">Things you bought sync straight to this month's invoice.</p>
      </div>

      <div className="form-card-stack">
        <CollapsibleCard
          title={<span className="stat-title"><ShoppingBag size={15} /> {displayName}'s Extras</span>}
          storageKey="fm-extras"
          actions={(
            <button className="btn btn-primary btn-sm" onClick={() => saveExtras([...extras, newExtra()])}>
              <Plus size={16} /> Add Item
            </button>
          )}
        >
          <ExtrasInputList
            description={`Enter the units in the pack and the total you paid — the per-unit price works itself out. The % is the share you keep: at 10%, you pay 10% and ${otherDisplayName} pays the rest.`}
            extras={extras}
            onUpdate={(id, field, value) => saveExtras(extras.map((e) => (e.id === id ? { ...e, [field]: value } : e)))}
            onRemove={(id) => saveExtras(extras.filter((e) => e.id !== id))}
            percentPayer={displayName}
            percentOther={otherDisplayName}
            showAddButton={false}
          />
        </CollapsibleCard>

        <CollapsibleCard title={<span className="stat-title"><StickyNote size={15} /> Your notes</span>} storageKey="fm-notes">
          <p className="section-desc">Optional — anything written here appears on the invoice.</p>
          <div className="form-group">
            <label htmlFor="flatmate-note">Note</label>
            <textarea
              id="flatmate-note"
              value={note}
              onChange={(e) => saveNote(e.target.value)}
              placeholder="Optional note shown on the invoice"
              rows={2}
              maxLength={300}
            />
          </div>
        </CollapsibleCard>

        <CollapsibleCard title={<span className="stat-title"><ArrowRightLeft size={15} /> Charged to {otherDisplayName}</span>} storageKey="fm-charged-other">
          <p className="section-desc">Everything {otherDisplayName} is paying towards extras this month.</p>
          {chargedToOther.map((extra) => {
            const total = extraShares(extra).total;
            return (
              <div key={extra.id} className="preview-item">
                <div className="preview-item-main">
                  <span>{formatExtraLabel(extra)}</span>
                  <span>{formatCurrency(extra.share)}</span>
                </div>
                <div className="preview-item-sub">
                  Added by {extra.addedByYou ? 'you' : otherDisplayName} — {otherDisplayName} pays {`${extra.pct}% of ${formatCurrency(total)}`}
                </div>
              </div>
            );
          })}
        </CollapsibleCard>

        <CollapsibleCard title={<span className="stat-title"><Receipt size={15} /> Charged to you</span>} storageKey="fm-charged-you">
          <p className="section-desc">Your share of the extras {otherDisplayName} added.</p>
          {chargedToYou.map((extra) => {
            const total = extraShares(extra).total;
            return (
              <div key={extra.id} className="preview-item">
                <div className="preview-item-main">
                  <span>{formatExtraLabel(extra)}</span>
                  <span>{formatCurrency(extra.share)}</span>
                </div>
                <div className="preview-item-sub">
                  Added by {otherDisplayName} — you pay {`${extra.pct}% of ${formatCurrency(total)}`}
                </div>
              </div>
            );
          })}
        </CollapsibleCard>

        <CollapsibleCard title={<span className="stat-title"><BarChart3 size={15} /> History</span>} storageKey="fm-history">
          <p className="section-desc">Monthly bill totals from the saved invoices.</p>
          <SpendingChart history={history} />
        </CollapsibleCard>
      </div>
    </div>
  );
}
