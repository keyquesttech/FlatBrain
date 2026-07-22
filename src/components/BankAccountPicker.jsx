import React, { useEffect, useState } from 'react';
import { getPayments } from '../api';

// The bank accounts saved in the Payments app, shown as tappable cards.
// Tapping one fills the host app's bank-details fields (they stay
// editable — this copies values, it doesn't link them). Renders nothing
// until at least one account exists, so apps look unchanged before
// Payments is set up.
export default function BankAccountPicker({ bankDetails, onPick }) {
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    getPayments()
      .then((p) => setAccounts(Array.isArray(p?.accounts) ? p.accounts : []))
      .catch(() => {});
  }, []);

  if (accounts.length === 0) return null;

  const isCurrent = (a) =>
    a.name === bankDetails?.name &&
    a.bankName === bankDetails?.bankName &&
    a.sortCode === bankDetails?.sortCode &&
    a.accountNumber === bankDetails?.accountNumber;

  return (
    <div className="form-group">
      <label>Saved accounts</label>
      <div className="account-pick-grid">
        {accounts.map((a) => (
          <button
            type="button"
            key={a.id}
            className={`account-pick ${isCurrent(a) ? 'account-pick-active' : ''}`}
            onClick={() => onPick({ name: a.name, bankName: a.bankName, sortCode: a.sortCode, accountNumber: a.accountNumber })}
            title="Fill the fields below with this account"
          >
            <span className="account-pick-label">{a.label?.trim() || a.bankName?.trim() || 'Account'}</span>
            <span className="account-pick-sub">
              {a.bankName?.trim() || '—'}
              {a.accountNumber ? ` · …${String(a.accountNumber).slice(-4)}` : ''}
            </span>
          </button>
        ))}
      </div>
      <p className="section-desc split-desc">Tap a card to fill the fields below — they stay editable.</p>
    </div>
  );
}
