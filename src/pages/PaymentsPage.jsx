import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Landmark, Plus, Wallet, X } from 'lucide-react';
import Navigation from '../components/Navigation';
import CollapsibleCard from '../components/CollapsibleCard';
import CurrencyInput from '../components/CurrencyInput';
import DatePicker from '../components/DatePicker';
import PaidControl from '../components/PaidControl';
import SelectMenu from '../components/SelectMenu';
import { getPayments, updatePayments } from '../api';
import { formatCurrency, parseAmount, round2 } from '../utils/calculations';
import { formatDay } from '../utils/dates';
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

function normalizeFlow(f) {
  return {
    id: f?.id || newId(),
    thing: f?.thing || '',
    amount: f?.amount || '',
    date: f?.date || '',
    accountId: f?.accountId || '',
    paidDate: f?.paidDate || ''
  };
}

function normalizePayments(p) {
  return {
    accounts: (Array.isArray(p?.accounts) ? p.accounts : []).map(normalizeAccount),
    incoming: (Array.isArray(p?.incoming) ? p.incoming : []).map(normalizeFlow),
    outgoing: (Array.isArray(p?.outgoing) ? p.outgoing : []).map(normalizeFlow)
  };
}

const pendingSum = (flows) => flows
  .filter((f) => !f.paidDate)
  .reduce((sum, f) => round2(sum + round2(parseAmount(f.amount))), 0);

// Payments: what's landing in the account and what has to leave it. The
// pending totals only count entries without a settled date, and the bank
// accounts saved here feed the other apps' bank-details pickers.
export default function PaymentsPage() {
  const [doc, setDoc] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const dataRef = useRef(null);
  const saveTimerRef = useRef(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getPayments()
      .then((p) => {
        if (cancelled) return;
        dataRef.current = normalizePayments(p);
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

  // Instant UI, debounced write — same pattern as the other apps.
  const update = (changes) => {
    const next = { ...dataRef.current, ...changes };
    dataRef.current = next;
    setDoc(next);
    pendingRef.current = true;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  };

  if (!doc) return <div className="page-loading">Loading…</div>;

  const updateIn = (listKey) => (id, changes) => {
    update({ [listKey]: doc[listKey].map((f) => (f.id === id ? { ...f, ...changes } : f)) });
  };
  const updateIncoming = updateIn('incoming');
  const updateOutgoing = updateIn('outgoing');

  const updateAccount = (id, changes) => {
    update({ accounts: doc.accounts.map((a) => (a.id === id ? { ...a, ...changes } : a)) });
  };

  const inPending = pendingSum(doc.incoming);
  const outPending = pendingSum(doc.outgoing);
  const net = round2(inPending - outPending);
  const nextOut = doc.outgoing
    .filter((f) => !f.paidDate && f.date)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  const accountOptions = [
    { value: '', label: 'No account' },
    ...doc.accounts.map((a) => ({ value: a.id, label: a.label?.trim() || a.bankName?.trim() || 'Account' }))
  ];

  const renderFlows = (listKey, updateFlow, emptyHint) => (
    <>
      {doc[listKey].length === 0 && <p className="section-desc">{emptyHint}</p>}
      {doc[listKey].map((f) => (
        <div className="rent-row" key={f.id}>
          <div className="rent-fields">
            <label className="fld rent-fld-wide">
              <span className="fld-label">What</span>
              <input
                type="text"
                value={f.thing}
                onChange={(e) => updateFlow(f.id, { thing: e.target.value })}
                placeholder={listKey === 'incoming' ? 'e.g. Salary, Réka rent' : 'e.g. Service charge, Electricity'}
                maxLength={80}
              />
            </label>
            <label className="fld">
              <span className="fld-label">Amount</span>
              <CurrencyInput
                formatted
                value={f.amount}
                onChange={(e) => updateFlow(f.id, { amount: e.target.value })}
                aria-label="Amount"
              />
            </label>
            <label className="fld">
              <span className="fld-label">{listKey === 'incoming' ? 'Expected on' : 'Due on'}</span>
              <DatePicker value={f.date} onChange={(v) => updateFlow(f.id, { date: v })} placeholder="Select date" />
            </label>
            {doc.accounts.length > 0 && (
              <label className="fld rent-fld-wide">
                <span className="fld-label">Account</span>
                <SelectMenu
                  value={f.accountId}
                  onChange={(v) => updateFlow(f.id, { accountId: v })}
                  options={accountOptions}
                  width="100%"
                />
              </label>
            )}
          </div>
          <div className="rent-row-meta">
            <span className="rent-period">
              {f.date ? `${listKey === 'incoming' ? 'Expected' : 'Due'} ${formatDay(f.date)}` : 'Pick a date'}
              {f.paidDate ? ` · settled ${formatDay(f.paidDate)}` : ''}
            </span>
            <span className="rent-row-actions">
              <PaidControl paidDate={f.paidDate} onChange={(d) => updateFlow(f.id, { paidDate: d })} />
              <button
                className="btn-icon btn-icon-danger"
                onClick={() => update({ [listKey]: doc[listKey].filter((x) => x.id !== f.id) })}
                aria-label="Remove entry"
                title="Remove this entry"
              >
                <X size={16} />
              </button>
            </span>
          </div>
        </div>
      ))}
    </>
  );

  return (
    <div className="container container-narrow animate-fade-in">
      <Navigation showTabs={false} appLabel="Payments" />

      <div className="form-card-stack">
        <CollapsibleCard title={<span className="stat-title"><Wallet size={15} /> Overview</span>} storageKey="pay-overview">
          <div className="sys-rows">
            <div className="sys-row">
              <span className="sys-row-label">Money coming in</span>
              <span className="sys-row-value">{formatCurrency(inPending)}</span>
            </div>
            <div className="sys-row">
              <span className="sys-row-label">Payments going out</span>
              <span className="sys-row-value">{formatCurrency(outPending)}</span>
            </div>
            <div className="sys-row">
              <span className="sys-row-label">Needed on the account</span>
              <span className="sys-row-value">{formatCurrency(outPending)}</span>
            </div>
            <div className="sys-row">
              <span className="sys-row-label">Net once it all clears</span>
              <span className={`sys-row-value ${net < 0 ? 'pay-net-negative' : ''}`}>{formatCurrency(net)}</span>
            </div>
            <div className="sys-row">
              <span className="sys-row-label">Next payment out</span>
              <span className="sys-row-value">
                {nextOut ? `${nextOut.thing?.trim() || 'Payment'} — ${formatCurrency(nextOut.amount)} on ${formatDay(nextOut.date)}` : 'Nothing due'}
              </span>
            </div>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          title={<span className="stat-title"><Landmark size={15} /> Bank accounts</span>}
          storageKey="pay-accounts"
          actions={(
            <button className="btn btn-primary btn-sm" onClick={() => update({ accounts: [...doc.accounts, normalizeAccount({})] })}>
              <Plus size={16} /> Add account
            </button>
          )}
        >
          <p className="section-desc">
            Saved once here, then picked from the bank-details cards of Bill Splitter, Rent and the invoice generator.
          </p>
          {doc.accounts.length === 0 && <p className="section-desc">No accounts yet — add the first one.</p>}
          {doc.accounts.map((a) => (
            <div className="rent-row" key={a.id}>
              <div className="rent-fields">
                <label className="fld rent-fld-wide">
                  <span className="fld-label">Label</span>
                  <input
                    type="text"
                    value={a.label}
                    onChange={(e) => updateAccount(a.id, { label: e.target.value })}
                    placeholder="e.g. Joint account, Monzo"
                    maxLength={60}
                  />
                </label>
                <label className="fld">
                  <span className="fld-label">Name</span>
                  <input
                    type="text"
                    value={a.name}
                    onChange={(e) => updateAccount(a.id, { name: e.target.value })}
                    placeholder="Account holder name"
                    maxLength={80}
                  />
                </label>
                <label className="fld">
                  <span className="fld-label">Bank name</span>
                  <input
                    type="text"
                    value={a.bankName}
                    onChange={(e) => updateAccount(a.id, { bankName: e.target.value })}
                    placeholder="Bank name"
                    maxLength={80}
                  />
                </label>
                <label className="fld">
                  <span className="fld-label">Sort code</span>
                  <input
                    type="text"
                    value={a.sortCode}
                    onChange={(e) => updateAccount(a.id, { sortCode: e.target.value })}
                    placeholder="00-00-00"
                    maxLength={20}
                  />
                </label>
                <label className="fld">
                  <span className="fld-label">Account number</span>
                  <input
                    type="text"
                    value={a.accountNumber}
                    onChange={(e) => updateAccount(a.id, { accountNumber: e.target.value })}
                    placeholder="12345678"
                    maxLength={20}
                  />
                </label>
              </div>
              <div className="rent-row-meta">
                <span className="rent-period">{a.label?.trim() || a.bankName?.trim() || 'New account'}</span>
                <span className="rent-row-actions">
                  <button
                    className="btn-icon btn-icon-danger"
                    onClick={() => update({ accounts: doc.accounts.filter((x) => x.id !== a.id) })}
                    aria-label="Remove account"
                    title="Remove this account"
                  >
                    <X size={16} />
                  </button>
                </span>
              </div>
            </div>
          ))}
        </CollapsibleCard>

        <CollapsibleCard
          title={<span className="stat-title"><ArrowDownToLine size={15} /> Money in</span>}
          storageKey="pay-in"
          actions={(
            <button className="btn btn-primary btn-sm" onClick={() => update({ incoming: [...doc.incoming, normalizeFlow({})] })}>
              <Plus size={16} /> Add income
            </button>
          )}
        >
          <p className="section-desc">
            Everything expected to land in the account — marking it settled drops it from the totals.
          </p>
          {renderFlows('incoming', updateIncoming, 'Nothing expected yet — add the first one.')}
        </CollapsibleCard>

        <CollapsibleCard
          title={<span className="stat-title"><ArrowUpFromLine size={15} /> Money out</span>}
          storageKey="pay-out"
          actions={(
            <button className="btn btn-primary btn-sm" onClick={() => update({ outgoing: [...doc.outgoing, normalizeFlow({})] })}>
              <Plus size={16} /> Add payment
            </button>
          )}
        >
          <p className="section-desc">
            Everything that has to leave the account — the money that needs to be there when each payment lands.
          </p>
          {renderFlows('outgoing', updateOutgoing, 'Nothing due yet — add the first one.')}
        </CollapsibleCard>

        {saveError && (
          <p className="section-desc stat-detail-warn">Changes aren’t saving — check the server.</p>
        )}
      </div>
    </div>
  );
}
