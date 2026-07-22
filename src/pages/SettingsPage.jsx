import React, { useEffect, useRef, useState } from 'react';
import { Coins, Eye, EyeOff, KeyRound, Landmark, LayoutGrid, Pencil, Save, Trash2 } from 'lucide-react';
import Navigation from '../components/Navigation';
import CollapsibleCard from '../components/CollapsibleCard';
import SelectMenu from '../components/SelectMenu';
import { appAlert, appConfirm, appToast } from '../components/Dialog';
import { changePassword, getPanelSettings, getPayments, updatePanelSettings, updatePayments } from '../api';
import { newId } from '../utils/id';
import { syncRememberedPassword } from '../utils/authStorage';
import { CURRENCIES, currencySymbolFor } from '../utils/currency';
import { DEFAULT_NAMES } from '../utils/defaults';
import { applyPanelSettings, normalizePanelSettings } from '../utils/panelSettings';

const SAVE_DEBOUNCE_MS = 600;

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({
  value: c.code,
  label: `${currencySymbolFor(c.code)} ${c.name}`
}));

// Every page that can go on the custom hub, grouped by app for the
// checkbox list. Keys match PasswordGate's pageKey per route; a ticked
// page gets a hub tile AND opens without the password.
const HUB_GROUPS = [
  {
    app: 'Bill Splitter',
    pages: [
      { key: 'billsplitter', label: 'Generator' },
      { key: 'flatmate1', label: `${DEFAULT_NAMES.matias}'s page` },
      { key: 'flatmate2', label: `${DEFAULT_NAMES.reka}'s page` }
    ]
  },
  { app: 'Rent', pages: [{ key: 'rent', label: 'Rent' }] },
  { app: 'Invoice generator', pages: [{ key: 'invoices', label: 'Invoice generator' }] },
  { app: 'Settings', pages: [{ key: 'settings', label: 'Settings' }] },
  { app: 'Server status', pages: [{ key: 'status', label: 'Server status' }] }
];

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

// A stacked-label password field with the login gate's show/hide eye.
function PasswordField({ label, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <label className="fld">
      <span className="fld-label">{label}</span>
      <div className="password-input">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="password-toggle-btn"
          onClick={() => setShow(!show)}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </label>
  );
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
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [prefs, setPrefs] = useState(null);
  const [prefsError, setPrefsError] = useState(false);
  const dataRef = useRef(null);
  const saveTimerRef = useRef(null);
  const pendingRef = useRef(false);
  const prefsRef = useRef(null);
  const prefsTimerRef = useRef(null);
  const prefsPendingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getPanelSettings()
      .then((s) => {
        if (cancelled) return;
        prefsRef.current = normalizePanelSettings(s);
        setPrefs(prefsRef.current);
      })
      .catch(() => {});
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
      clearTimeout(prefsTimerRef.current);
      if (prefsPendingRef.current) flushPrefs();
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

  const flushPrefs = async () => {
    prefsPendingRef.current = false;
    try {
      await updatePanelSettings(prefsRef.current);
      setPrefsError(false);
    } catch {
      prefsPendingRef.current = true;
      setPrefsError(true);
    }
  };

  // Currency and hub changes apply to the running app instantly via
  // applyPanelSettings; the write is debounced because the hub name is
  // typed, not tapped.
  const updatePrefs = (changes) => {
    const next = { ...prefsRef.current, ...changes };
    prefsRef.current = next;
    setPrefs(next);
    applyPanelSettings(next);
    prefsPendingRef.current = true;
    clearTimeout(prefsTimerRef.current);
    prefsTimerRef.current = setTimeout(flushPrefs, SAVE_DEBOUNCE_MS);
  };

  if (!doc || !prefs) return <div className="page-loading">Loading…</div>;

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

  // The server rejects unusable new passwords too; the checks here just
  // catch typos before the round-trip.
  const savePassword = async () => {
    if (pwSaving) return;
    const next = pwNew.trim();
    if (next.length < 4) {
      appAlert('Use at least 4 characters for the new password.', { title: 'Change password' });
      return;
    }
    if (next !== pwConfirm.trim()) {
      appAlert('The new passwords don’t match.', { title: 'Change password' });
      return;
    }
    setPwSaving(true);
    try {
      const res = await changePassword(next);
      if (res.success) {
        syncRememberedPassword(next);
        setPwNew('');
        setPwConfirm('');
        appToast('Password changed.');
      } else {
        appAlert(res.error || 'The password could not be changed.', { title: 'Change password' });
      }
    } catch {
      appAlert('The password could not be changed — check the server.', { title: 'Change password' });
    } finally {
      setPwSaving(false);
    }
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

        <CollapsibleCard
          title={<span className="stat-title"><Coins size={15} /> Currency</span>}
          storageKey="settings-currency"
        >
          <p className="section-desc">
            Sets the symbol on every amount, invoice and chart — nothing is converted, the numbers stay as typed.
          </p>
          <div className="rent-fields">
            <label className="fld rent-fld-wide">
              <span className="fld-label">Currency</span>
              <SelectMenu
                value={prefs.currency}
                onChange={(v) => updatePrefs({ currency: v })}
                options={CURRENCY_OPTIONS}
                width="100%"
              />
            </label>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          title={<span className="stat-title"><LayoutGrid size={15} /> Custom hub</span>}
          storageKey="settings-custom-hub"
        >
          <p className="section-desc">
            The password-free landing page at /hub — Guest login on the lock screen leads there. Ticked pages get a hub tile and open without the password; everything else stays locked.
          </p>
          <div className="rent-fields">
            <label className="fld rent-fld-wide">
              <span className="fld-label">Hub name</span>
              <input
                type="text"
                value={prefs.hub.name}
                onChange={(e) => updatePrefs({ hub: { ...prefs.hub, name: e.target.value } })}
                placeholder="FlatBrain"
                maxLength={40}
              />
            </label>
          </div>
          {HUB_GROUPS.map(({ app, pages }) => (
            <div className="hub-group" key={app}>
              <span className="fld-label hub-group-label">{app}</span>
              <div className="rent-fields app-locks">
                {pages.map(({ key, label }) => (
                  <label className="remember-checkbox" key={key}>
                    <input
                      type="checkbox"
                      checked={prefs.hub.tiles[key]}
                      onChange={(e) => updatePrefs({ hub: { ...prefs.hub, tiles: { ...prefs.hub.tiles, [key]: e.target.checked } } })}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </CollapsibleCard>

        <CollapsibleCard
          title={<span className="stat-title"><KeyRound size={15} /> Password</span>}
          storageKey="settings-password"
          actions={(
            <button className="btn btn-primary btn-sm" onClick={savePassword} disabled={pwSaving}>
              <Save size={16} /> {pwSaving ? 'Changing…' : 'Change password'}
            </button>
          )}
        >
          <p className="section-desc">
            One shared password unlocks every locked app — change it here and let your flatmate know. Devices already unlocked stay unlocked.
          </p>
          <div className="rent-fields">
            <PasswordField label="New password" value={pwNew} onChange={setPwNew} autoComplete="new-password" />
            <PasswordField label="Confirm new password" value={pwConfirm} onChange={setPwConfirm} autoComplete="new-password" />
          </div>
        </CollapsibleCard>

        {prefsError && (
          <p className="section-desc stat-detail-warn">Currency or hub changes aren’t saving — check the server.</p>
        )}
        {saveError && (
          <p className="section-desc stat-detail-warn">Changes aren’t saving — check the server.</p>
        )}
      </div>
    </div>
  );
}
