import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// A glass-panel card whose body collapses behind its title. Open state
// persists per card (storageKey) so e.g. Bank Details can stay tucked away
// forever. The body animates via the grid-template-rows 0fr/1fr trick — no
// height measuring. Header action buttons (like "Add Item") live in
// `actions`; using one while the card is collapsed opens it, so nothing
// ever happens invisibly.
export default function CollapsibleCard({ title, storageKey, actions, defaultOpen = true, children }) {
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(`bs-card-${storageKey}`);
      return saved == null ? defaultOpen : saved === '1';
    } catch {
      return defaultOpen;
    }
  });
  // While the height transition runs, the body must clip its content; once
  // an EXPANDED card settles, overflow is released again so the picker
  // dropdowns inside can escape the card edge.
  const [settling, setSettling] = useState(false);

  const setAndSave = (next) => {
    setOpen(next);
    setSettling(true);
    try {
      localStorage.setItem(`bs-card-${storageKey}`, next ? '1' : '0');
    } catch { /* private mode — state just won't persist */ }
  };

  return (
    <section className={`glass-panel collapsible-card ${open ? 'is-open' : 'is-closed'}${settling ? ' is-settling' : ''}`}>
      <div className="collapsible-head">
        <button
          type="button"
          className="collapsible-toggle"
          onClick={() => setAndSave(!open)}
          aria-expanded={open}
        >
          <ChevronDown size={16} className="collapsible-chevron" aria-hidden="true" />
          <span className="invoice-section-title collapsible-title">{title}</span>
        </button>
        {actions && (
          <div className="collapsible-actions" onClick={() => { if (!open) setAndSave(true); }}>
            {actions}
          </div>
        )}
      </div>
      <div
        className="collapsible-body"
        onTransitionEnd={(e) => { if (e.target === e.currentTarget) setSettling(false); }}
      >
        <div className="collapsible-inner">{children}</div>
      </div>
    </section>
  );
}
