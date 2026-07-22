import React, { useEffect, useState } from 'react';
import SelectMenu from './SelectMenu';
import { getPayments } from '../api';

// Dropdown of the bank accounts saved in the Payments app. Picking one
// fills the host app's bank-details fields (they stay editable — this
// copies values, it doesn't link them). Renders nothing until at least
// one account exists, so apps look unchanged before Payments is set up.
export default function BankAccountPicker({ bankDetails, onPick }) {
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    getPayments()
      .then((p) => setAccounts(Array.isArray(p?.accounts) ? p.accounts : []))
      .catch(() => {});
  }, []);

  if (accounts.length === 0) return null;

  const current = accounts.find((a) =>
    a.name === bankDetails?.name &&
    a.bankName === bankDetails?.bankName &&
    a.sortCode === bankDetails?.sortCode &&
    a.accountNumber === bankDetails?.accountNumber
  );

  return (
    <div className="form-group">
      <label>Saved account</label>
      <SelectMenu
        value={current?.id || ''}
        onChange={(id) => {
          const a = accounts.find((x) => x.id === id);
          if (a) onPick({ name: a.name, bankName: a.bankName, sortCode: a.sortCode, accountNumber: a.accountNumber });
        }}
        options={[
          { value: '', label: 'Pick from Payments…' },
          ...accounts.map((a) => ({ value: a.id, label: a.label?.trim() || a.bankName?.trim() || 'Account' }))
        ]}
        width="100%"
      />
      <p className="section-desc split-desc">Fills the fields below from the Payments app — they stay editable.</p>
    </div>
  );
}
