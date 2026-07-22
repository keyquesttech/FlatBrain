import React, { useEffect, useRef, useState } from 'react';
import { Landmark, Pencil, Save, Trash2 } from 'lucide-react';
import Navigation from '../components/Navigation';
import CollapsibleCard from '../components/CollapsibleCard';
import { appAlert, appConfirm, appToast } from '../components/Dialog';
import { getPayments, updatePayments } from '../api';
import { newId } from '../utils/id';

const SAVE_DEBOUNCE_MS = 600;

function normalizeAccount(a) {
  return {
    id: a?.id || newId(),
    label: a?.label || '',
    name: a?.name || '',
    bankName: a?.bankName || '',
    sortCode: a?.sortCode || '',
    accountNumber: a?.accountNumber || ''
  };
}

// Settings: panel-wide information the apps share. The bank accounts live
// in payments.json (one source of truth — the Payments app tags its
// entries with them and every bank-details picker reads them); this page
// is where they're managed.
export default function SettingsPage() {
  const [doc, setDoc] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const [accDraft, setAccDraft] = useState(() => normalizeAccount({}));
  const [accEditing, setAccEditing] = useState('');
  const dataRef = useRef(null);
  const saveTimerRef = useRef(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getPayments()
      .then((p) => {
        if (cancelled) return;
        dataRef.current = {
          ...p,
          accounts: (Array.isArray(p?.accounts) ? p.accounts : []).map(normalizeAccount)
        };
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
      await updatePayments(dataRef.current);
      setSaveError(false);
    } catch {
      pendingRef.current = true;
      setSaveError(true);
    }
  };

  // Only the accounts are edited here; the rest of the payments document
  // rides along untouched.
  const updateAccounts = (accounts) => {
    const next = { ...dataRef.current, accounts };
    dataRef.current = next;
    setDoc(next);
    pendingRef.current = true;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  };

  if (!doc) return <div className="page-loading">Loading…</div>;

  const saveAccount = () => {
    if (!accDraft.label.trim() && !accDraft.bankName.trim()) {
      appAlert('Give the account at least a label or a bank name.', { title: 'Save account' });
      return;
    }
    if (accEditing && doc.accounts.some((a) => a.id === accEditing)) {
      updateAccounts(doc.accounts.map((a) => (a.id === accEditing ? { ...accDraft, id: accEditing } : a)));
      appToast('Account updated.');
    } else {
      updateAccounts([...doc.accounts, { ...accDraft, id: newId() }]);
      appToast('Account saved.');
    }
    setAccDraft(normalizeAccount({}));
    setAccEditing('');
  };

  const editAccount = (a) => {
    setAccDraft(normalizeAccount(a));
    setAccEditing(a.id);
  };

  const deleteAccount = async (a) => {
    if (!await appConfirm(`Delete "${a.label?.trim() || a.bankName?.trim() || 'this account'}"? Apps that already copied its details keep them.`, { title: 'Delete account', okLabel: 'Delete', danger: true })) return;
    updateAccounts(doc.accounts.filter((x) => x.id !== a.id));
    if (accEditing === a.id) {
      setAccDraft(normalizeAccount({}));
      setAccEditing('');
    }
  };

  return (
    <div className="container container-narrow animate-fade-in">
      <Navigation showTabs={false} appLabel="Settings" />

      <div className="form-card-stack">
        <CollapsibleCard
          title={<span className="stat-title"><Landmark size={15} /> Bank accounts</span>}
          storageKey="pay-accounts"
          actions={(
            <div className="backup-header-actions">
              {accEditing && (
                <button className="btn btn-secondary btn-sm" onClick={() => { setAccDraft(normalizeAccount({})); setAccEditing(''); }}>
                  Cancel edit
                </button>
              )}
              <button className="btn btn-primary btn-sm" onClick={saveAccount}>
                <Save size={16} /> {accEditing ? 'Update account' : 'Save account'}
              </button>
            </div>
          )}
        >
          <p className="section-desc">
            Fill the details and save — each account becomes a card here, ready to pick from the bank-details cards of Bill Splitter, Rent and the invoice generator, and to tag Payments entries.
          </p>
          {accEditing && (
            <p className="section-desc stat-detail-warn">
              Editing "{doc.accounts.find((a) => a.id === accEditing)?.label?.trim() || 'a saved account'}" — Save updates its card.
            </p>
          )}
          <div className="rent-fields">
            <label className="fld rent-fld-wide">
              <span className="fld-label">Label</span>
              <input
                type="text"
                value={accDraft.label}
                onChange={(e) => setAccDraft({ ...accDraft, label: e.target.value })}
                placeholder="e.g. Joint account, Monzo"
                maxLength={60}
              />
            </label>
            <label className="fld">
              <span className="fld-label">Name</span>
              <input
                type="text"
                value={accDraft.name}
                onChange={(e) => setAccDraft({ ...accDraft, name: e.target.value })}
                placeholder="Account holder name"
                maxLength={80}
              />
            </label>
            <label className="fld">
              <span className="fld-label">Bank name</span>
              <input
                type="text"
                value={accDraft.bankName}
                onChange={(e) => setAccDraft({ ...accDraft, bankName: e.target.value })}
                placeholder="Bank name"
                maxLength={80}
              />
            </label>
            <label className="fld">
              <span className="fld-label">Sort code</span>
              <input
                type="text"
                value={accDraft.sortCode}
                onChange={(e) => setAccDraft({ ...accDraft, sortCode: e.target.value })}
                placeholder="00-00-00"
                maxLength={20}
              />
            </label>
            <label className="fld">
              <span className="fld-label">Account number</span>
              <input
                type="text"
                value={accDraft.accountNumber}
                onChange={(e) => setAccDraft({ ...accDraft, accountNumber: e.target.value })}
                placeholder="12345678"
                maxLength={20}
              />
            </label>
          </div>

          {doc.accounts.length > 0 && (
            <div className="history-grid account-grid">
              {doc.accounts.map((a) => (
                <div className="glass-panel history-card account-card" key={a.id}>
                  <div className="history-card-head">
                    <div>
                      <h3 className="history-card-title">{a.label?.trim() || a.bankName?.trim() || 'Account'}</h3>
                      <div className="text-muted history-card-date">{a.bankName?.trim() || '—'}</div>
                    </div>
                    <div className="history-card-actions">
                      <button
                        className="btn-icon"
                        onClick={() => editAccount(a)}
                        title="Edit this account"
                        aria-label={`Edit ${a.label || 'account'}`}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="btn-icon btn-icon-danger"
                        onClick={() => deleteAccount(a)}
                        title="Delete this account"
                        aria-label={`Delete ${a.label || 'account'}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="history-card-totals">
                    <div className="history-total-row">
                      <span className="text-muted">Name</span>
                      <span className="account-card-value">{a.name?.trim() || '—'}</span>
                    </div>
                    <div className="history-total-row">
                      <span className="text-muted">Sort code</span>
                      <span className="account-card-value">{a.sortCode?.trim() || '—'}</span>
                    </div>
                    <div className="history-total-row">
                      <span className="text-muted">Account</span>
                      <span className="account-card-value">{a.accountNumber?.trim() || '—'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleCard>

        {saveError && (
          <p className="section-desc stat-detail-warn">Changes aren’t saving — check the server.</p>
        )}
      </div>
    </div>
  );
}
