import React, { useEffect, useState } from 'react';
import { getPayments } from '../api';

// The bank accounts saved in the Payments app, shown as tappable cards.
// Tapping one copies its details into the host app (it doesn't link
// them). With no saved accounts it renders the emptyHint if given,
// otherwise nothing — so apps with their own fields look unchanged
// before Payments is set up.
export default function BankAccountPicker({ bankDetails, onPick, emptyHint }) {
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    getPayments()
      .then((p) => setAccounts(Array.isArray(p?.accounts) ? p.accounts : []))
      .catch(() => {});
  }, []);

  if (accounts.length === 0) {
    return emptyHint ? <p className="section-desc">{emptyHint}</p> : null;
  }

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
            title="Use this account on the invoice"
          >
            <span className="account-pick-label">{a.label?.trim() || a.bankName?.trim() || 'Account'}</span>
            <span className="account-pick-sub">{a.bankName?.trim() || '—'}</span>
            <span className="account-pick-rows">
              <span className="account-pick-row">
                <span>Name</span>
                <span>{a.name?.trim() || '—'}</span>
              </span>
              <span className="account-pick-row">
                <span>Sort code</span>
                <span>{a.sortCode?.trim() || '—'}</span>
              </span>
              <span className="account-pick-row">
                <span>Account</span>
                <span>{a.accountNumber?.trim() || '—'}</span>
              </span>
            </span>
          </button>
        ))}
      </div>
      <p className="section-desc split-desc">Tap a card to use that account on the invoice.</p>
    </div>
  );
}
