import React from 'react';
import MonthPicker from './MonthPicker';
import DatePicker from './DatePicker';
import ExtrasInputList from './ExtrasInputList';
import CurrencyInput from './CurrencyInput';
import { DEFAULT_NAMES } from '../utils/defaults';
import { newExtra } from '../utils/id';

export default function InvoiceForm({ data, onChange }) {
  const names = { ...DEFAULT_NAMES, ...(data.names || {}) };

  const updateField = (field, value) => {
    onChange({ ...data, [field]: value });
  };

  // Picking a period auto-fills the due date with the 7th of the following
  // month; the due-date picker stays editable for manual overrides.
  const updatePeriod = (period) => {
    const [y, m] = period.split('-').map(Number);
    let dueDate = data.dueDate;
    if (y && m) {
      const nextYear = m === 12 ? y + 1 : y;
      const nextMonth = m === 12 ? 1 : m + 1;
      dueDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-07`;
    }
    onChange({ ...data, period, dueDate });
  };

  const updateName = (key, value) => {
    onChange({ ...data, names: { ...names, [key]: value } });
  };

  const updateBank = (field, value) => {
    onChange({ ...data, bankDetails: { ...data.bankDetails, [field]: value } });
  };

  const updateBill = (id, field, value) => {
    const newBills = data.bills.map((b) =>
      b.id === id ? { ...b, [field]: value } : b
    );
    updateField('bills', newBills);
  };

  const updateExtra = (listKey, id, field, value) => {
    const newExtras = data[listKey].map((e) =>
      e.id === id ? { ...e, [field]: value } : e
    );
    updateField(listKey, newExtras);
  };

  const addExtra = (listKey) => {
    updateField(listKey, [...data[listKey], newExtra()]);
  };

  const removeExtra = (listKey, id) => {
    updateField(listKey, data[listKey].filter((e) => e.id !== id));
  };

  const otherName = (personKey) => {
    const otherKey = personKey === 'flatmate1' ? 'flatmate2' : 'flatmate1';
    const flatmateLabel = personKey === 'flatmate1' ? 'Flatmate 2' : 'Flatmate 1';
    return names[otherKey].trim() || flatmateLabel;
  };

  const renderPersonExtras = (personKey, flatmateLabel) => {
    const extrasKey = `${personKey}Extras`;
    const fullPriceKey = `${personKey}FullPriceExtras`;
    const name = names[personKey].trim() || flatmateLabel;

    return (
      <>
        <div className="glass-panel">
          <ExtrasInputList
            title={`${name}'s 50% Extras`}
            description={`Items split 50/50 with ${otherName(personKey)}.`}
            extras={data[extrasKey]}
            onAdd={() => addExtra(extrasKey)}
            onUpdate={(id, field, value) => updateExtra(extrasKey, id, field, value)}
            onRemove={(id) => removeExtra(extrasKey, id)}
            addLabel="Add Item"
          />
        </div>

        <div className="glass-panel">
          <ExtrasInputList
            title={`${name}'s 100% Extras`}
            description={`Items charged 100% to ${otherName(personKey)}.`}
            extras={data[fullPriceKey]}
            onAdd={() => addExtra(fullPriceKey)}
            onUpdate={(id, field, value) => updateExtra(fullPriceKey, id, field, value)}
            onRemove={(id) => removeExtra(fullPriceKey, id)}
            addLabel="Add Item"
          />
        </div>
      </>
    );
  };

  return (
    <div className="form-card-stack">
      <div className="glass-panel">
        <h3 className="invoice-section-title">Invoice Details</h3>

        <div className="form-group">
          <label>Period</label>
          <MonthPicker
            value={data.period}
            onChange={updatePeriod}
          />
        </div>

        <div className="form-group">
          <label>Due Date</label>
          <DatePicker
            value={data.dueDate}
            onChange={(val) => updateField('dueDate', val)}
          />
        </div>
      </div>

      <div className="glass-panel">
        <h3 className="invoice-section-title">Names</h3>
        <div className="input-row">
          <input
            type="text"
            value={names.flatmate1}
            onChange={(e) => updateName('flatmate1', e.target.value)}
            placeholder="Flatmate 1"
            aria-label="Flatmate 1 name"
          />
          <input
            type="text"
            value={names.flatmate2}
            onChange={(e) => updateName('flatmate2', e.target.value)}
            placeholder="Flatmate 2"
            aria-label="Flatmate 2 name"
          />
        </div>
      </div>

      <div className="glass-panel">
        <h3 className="invoice-section-title">Bills</h3>
        {data.bills.map((bill) => (
          <div key={bill.id} className="input-row">
            <input
              type="text"
              value={bill.thing}
              onChange={(e) => updateBill(bill.id, 'thing', e.target.value)}
              placeholder="Bill Name"
            />
            <CurrencyInput
              value={bill.amount}
              onChange={(e) => updateBill(bill.id, 'amount', e.target.value)}
              placeholder="Amount"
            />
          </div>
        ))}
      </div>

      {renderPersonExtras('flatmate1', 'Flatmate 1')}
      {renderPersonExtras('flatmate2', 'Flatmate 2')}

      <div className="glass-panel">
        <h3 className="invoice-section-title">Notes</h3>
        <div className="form-group">
          <label>{names.flatmate1.trim() || 'Flatmate 1'}</label>
          <textarea
            value={data.flatmate1Note || ''}
            onChange={(e) => updateField('flatmate1Note', e.target.value)}
            placeholder="Optional note shown on the invoice"
            rows={2}
            maxLength={300}
          />
        </div>
        <div className="form-group">
          <label>{names.flatmate2.trim() || 'Flatmate 2'}</label>
          <textarea
            value={data.flatmate2Note || ''}
            onChange={(e) => updateField('flatmate2Note', e.target.value)}
            placeholder="Optional note shown on the invoice"
            rows={2}
            maxLength={300}
          />
        </div>
      </div>

      <div className="glass-panel">
        <h3 className="invoice-section-title">Bank Details</h3>
        <div className="form-group">
          <label>Name</label>
          <input
            type="text"
            value={data.bankDetails.name}
            onChange={(e) => updateBank('name', e.target.value)}
            placeholder="Account holder name"
          />
        </div>
        <div className="form-group">
          <label>Bank Name</label>
          <input
            type="text"
            value={data.bankDetails.bankName}
            onChange={(e) => updateBank('bankName', e.target.value)}
            placeholder="Bank name"
          />
        </div>
        <div className="form-group">
          <label>Sort Code</label>
          <input
            type="text"
            value={data.bankDetails.sortCode}
            onChange={(e) => updateBank('sortCode', e.target.value)}
            placeholder="00-00-00"
          />
        </div>
        <div className="form-group">
          <label>Account Number</label>
          <input
            type="text"
            value={data.bankDetails.accountNumber}
            onChange={(e) => updateBank('accountNumber', e.target.value)}
            placeholder="12345678"
          />
        </div>
      </div>
    </div>
  );
}
