import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import MonthPicker from './MonthPicker';
import DatePicker from './DatePicker';
import ExtrasInputList from './ExtrasInputList';
import CurrencyInput from './CurrencyInput';
import SelectMenu from './SelectMenu';
import { DEFAULT_NAMES } from '../utils/defaults';
import { newExtra, newId } from '../utils/id';
import { billDiscountPercent, clampSplitPercent } from '../utils/calculations';

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

  const addBill = () => {
    updateField('bills', [...data.bills, { id: newId(), thing: '', amount: '', discountPercent: '', discountedFrom: 'na' }]);
  };

  const removeBill = (id) => {
    updateField('bills', data.bills.filter((b) => b.id !== id));
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
    const otherKey = personKey === 'matias' ? 'reka' : 'matias';
    const flatmateLabel = personKey === 'matias' ? 'Flatmate 2' : 'Flatmate 1';
    return names[otherKey].trim() || flatmateLabel;
  };

  const splitPct = clampSplitPercent(data.splitPercent ?? 50);
  const otherPct = Math.round((100 - splitPct) * 100) / 100;

  // Which flatmate the split field's percentage refers to (UI-only choice;
  // the stored splitPercent is always flatmate 1's share).
  const [splitPerson, setSplitPerson] = useState('matias');
  const splitFieldValue = splitPerson === 'matias' ? (data.splitPercent ?? 50) : otherPct;

  const handleSplitChange = (value) => {
    if (splitPerson === 'matias') {
      updateField('splitPercent', value);
    } else {
      const n = parseFloat(value);
      updateField('splitPercent', isNaN(n) ? 50 : Math.round((100 - Math.min(100, Math.max(0, n))) * 100) / 100);
    }
  };

  const renderPersonDiscounts = (personKey, flatmateLabel) => {
    const key = `${personKey}Discounts`;
    const list = data[key] || [];
    const name = names[personKey].trim() || flatmateLabel;

    return (
      <div className="discount-group">
        <div className="extras-section-header">
          <h4 className="field-label">{name}</h4>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => updateField(key, [...list, { id: newId(), thing: '', type: 'amount', value: '' }])}
          >
            <Plus size={16} /> Add Discount
          </button>
        </div>
        {list.map((discount) => (
          <div key={discount.id} className="input-row extras-row">
            <input
              type="text"
              value={discount.thing}
              onChange={(e) => updateExtra(key, discount.id, 'thing', e.target.value)}
              placeholder="Reason (e.g. Broadband credit)"
              aria-label="Discount reason"
              maxLength={100}
            />
            <input
              type="number"
              className="packs-input discount-value"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={discount.value}
              onChange={(e) => updateExtra(key, discount.id, 'value', e.target.value)}
              placeholder={discount.type === 'percent' ? '%' : '£'}
              aria-label="Discount value"
            />
            <div className="discount-type-select">
              <SelectMenu
                value={discount.type}
                onChange={(v) => updateExtra(key, discount.id, 'type', v)}
                options={[
                  { value: 'amount', label: '£' },
                  { value: 'percent', label: '%' }
                ]}
                width="100%"
              />
            </div>
            <button className="btn btn-danger action-btn" onClick={() => removeExtra(key, discount.id)} aria-label="Remove discount">
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
    );
  };

  const renderPersonExtras = (personKey, flatmateLabel) => {
    const extrasKey = `${personKey}Extras`;
    const name = names[personKey].trim() || flatmateLabel;
    const other = otherName(personKey);

    return (
      <div className="glass-panel">
        <ExtrasInputList
          title={`${name}'s Extras`}
          description={`Things ${name} bought for the flat (packs × price per pack). The % is the slice of each item charged to ${other}; ${name} pays the rest — 50% splits it evenly, 100% charges it fully to ${other}.`}
          extras={data[extrasKey]}
          onAdd={() => addExtra(extrasKey)}
          onUpdate={(id, field, value) => updateExtra(extrasKey, id, field, value)}
          onRemove={(id) => removeExtra(extrasKey, id)}
          percentTo={other}
          addLabel="Add Item"
        />
      </div>
    );
  };

  return (
    <div className="form-card-stack">
      <div className="glass-panel">
        <h3 className="invoice-section-title">Invoice Details</h3>
        <p className="section-desc">
          The month this invoice covers and the payment deadline shown in its footer.
          Picking a period sets the due date to the 7th of the next month — you can still change it.
        </p>

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
        <p className="section-desc">
          The two flatmates as they appear on the invoice and across the app.
        </p>
        <div className="input-row">
          <input
            type="text"
            value={names.matias}
            onChange={(e) => updateName('matias', e.target.value)}
            placeholder="Flatmate 1"
            aria-label="Flatmate 1 name"
          />
          <input
            type="text"
            value={names.reka}
            onChange={(e) => updateName('reka', e.target.value)}
            placeholder="Flatmate 2"
            aria-label="Flatmate 2 name"
          />
        </div>

        <div className="form-group split-group">
          <label>Bills split</label>
          <div className="split-row">
            <div className="split-person-select" title="Whose share of the bills the % sets">
              <SelectMenu
                value={splitPerson}
                onChange={setSplitPerson}
                options={[
                  { value: 'matias', label: names.matias.trim() || 'Flatmate 1' },
                  { value: 'reka', label: names.reka.trim() || 'Flatmate 2' }
                ]}
                width="100%"
              />
            </div>
            <div className="currency-input split-input">
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                inputMode="decimal"
                value={splitFieldValue}
                onChange={(e) => handleSplitChange(e.target.value)}
                aria-label="Split percentage"
              />
              <span className="currency-input-prefix split-suffix" aria-hidden="true">%</span>
            </div>
          </div>
          <p className="section-desc split-desc">
            {names.matias.trim() || 'Flatmate 1'} pays {splitPct}% of every bill, {names.reka.trim() || 'Flatmate 2'} pays {otherPct}%.
            This only splits the bills — extras have their own per-item %.
          </p>
        </div>
      </div>

      <div className="glass-panel">
        <div className="extras-section-header">
          <h3 className="invoice-section-title">Bills</h3>
          <button className="btn btn-primary btn-sm" onClick={addBill}>
            <Plus size={16} /> Add Bill
          </button>
        </div>
        <p className="section-desc">
          The month's shared bills — each one is split at the Bills split ratio.
          To discount part of a bill, set the % to discount and pick who it's discounted for:
          that flatmate pays none of the discounted part and the other covers it in full.
          Pick All and nobody pays it. The rest of the bill splits as normal.
        </p>
        {data.bills.map((bill) => (
          <div key={bill.id} className="input-row extras-row bill-row">
            <input
              type="text"
              value={bill.thing}
              onChange={(e) => updateBill(bill.id, 'thing', e.target.value)}
              placeholder="Bill name"
              aria-label="Bill name"
              maxLength={100}
            />
            <CurrencyInput
              value={bill.amount}
              onChange={(e) => updateBill(bill.id, 'amount', e.target.value)}
              placeholder="Amount"
              aria-label="Bill amount"
            />
            <div className="currency-input percent-input" title="How much of this bill to discount (0 = no discount)">
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                inputMode="decimal"
                value={bill.discountPercent ?? ''}
                onChange={(e) => updateBill(bill.id, 'discountPercent', e.target.value)}
                placeholder="0"
                aria-label={`Percent of ${bill.thing || 'this bill'} to discount`}
              />
              <span className="currency-input-prefix split-suffix" aria-hidden="true">%</span>
            </div>
            {billDiscountPercent(bill) > 0 && (
              <div className="bill-discount-select" title="Who this bill is discounted for">
                <SelectMenu
                  value={bill.discountedFrom || 'na'}
                  onChange={(v) => updateBill(bill.id, 'discountedFrom', v)}
                  options={[
                    { value: 'na', label: 'All' },
                    { value: 'matias', label: names.matias.trim() || 'Flatmate 1' },
                    { value: 'reka', label: names.reka.trim() || 'Flatmate 2' }
                  ]}
                  width="100%"
                />
              </div>
            )}
            <button className="btn btn-danger action-btn" onClick={() => removeBill(bill.id)} aria-label="Remove bill">
              <X size={18} />
            </button>
          </div>
        ))}
      </div>

      {renderPersonExtras('matias', 'Flatmate 1')}
      {renderPersonExtras('reka', 'Flatmate 2')}

      <div className="glass-panel">
        <h3 className="invoice-section-title">Discounts</h3>
        <p className="section-desc">
          Money off a flatmate's final total, taken at the end — after their share of bills and extras.
          £ takes a fixed amount off; % takes that percent of their pre-discount total.
        </p>
        {renderPersonDiscounts('matias', 'Flatmate 1')}
        {renderPersonDiscounts('reka', 'Flatmate 2')}
      </div>

      <div className="glass-panel">
        <h3 className="invoice-section-title">Notes</h3>
        <p className="section-desc">
          Optional message from each flatmate, shown on the invoice in its own card below the totals.
          Flatmates can also edit their note from their own page.
        </p>
        <div className="form-group">
          <label>{names.matias.trim() || 'Flatmate 1'}</label>
          <textarea
            value={data.matiasNote || ''}
            onChange={(e) => updateField('matiasNote', e.target.value)}
            placeholder="Optional note shown on the invoice"
            rows={2}
            maxLength={300}
          />
        </div>
        <div className="form-group">
          <label>{names.reka.trim() || 'Flatmate 2'}</label>
          <textarea
            value={data.rekaNote || ''}
            onChange={(e) => updateField('rekaNote', e.target.value)}
            placeholder="Optional note shown on the invoice"
            rows={2}
            maxLength={300}
          />
        </div>
      </div>

      <div className="glass-panel">
        <h3 className="invoice-section-title">Bank Details</h3>
        <p className="section-desc">
          The account both flatmates send their total due to, shown at the bottom of the invoice.
        </p>
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
