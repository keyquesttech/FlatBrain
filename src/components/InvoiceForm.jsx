import React, { useState } from 'react';
import { CalendarClock, Landmark, Percent, Plus, Receipt, ShoppingBag, StickyNote, Users, X } from 'lucide-react';
import MonthPicker from './MonthPicker';
import DatePicker from './DatePicker';
import ExtrasInputList from './ExtrasInputList';
import CurrencyInput from './CurrencyInput';
import SelectMenu from './SelectMenu';
import BankAccountPicker from './BankAccountPicker';
import CollapsibleCard from './CollapsibleCard';
import { DEFAULT_NAMES } from '../utils/defaults';
import { newExtra, newId } from '../utils/id';
import { billDiscountPercent, clampSplitPercent, limitDecimals } from '../utils/calculations';

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

  const handleSplitChange = (raw) => {
    const value = limitDecimals(raw);
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
        {list.length > 0 && (
          <div className="input-row extras-row row-labels" aria-hidden="true">
            <span className="rl-over-input">Reason</span>
            <span className="packs-input discount-value">Value</span>
            <span className="discount-type-select">£ / %</span>
            <span className="row-labels-action" />
          </div>
        )}
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
              onChange={(e) => updateExtra(key, discount.id, 'value', limitDecimals(e.target.value))}
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
      <CollapsibleCard
        title={<span className="stat-title"><ShoppingBag size={15} /> {name}'s Extras</span>}
        storageKey={`extras-${personKey}`}
        actions={(
          <button className="btn btn-primary btn-sm" onClick={() => addExtra(extrasKey)}>
            <Plus size={16} /> Add Item
          </button>
        )}
      >
        <ExtrasInputList
          description={`Enter the units in the pack and the total paid — the per-unit price works itself out. The % is the share ${name} keeps: at 10%, ${name} pays 10% and ${other} pays the rest.`}
          extras={data[extrasKey]}
          onUpdate={(id, field, value) => updateExtra(extrasKey, id, field, value)}
          onRemove={(id) => removeExtra(extrasKey, id)}
          percentPayer={name}
          percentOther={other}
          showAddButton={false}
        />
      </CollapsibleCard>
    );
  };

  return (
    <div className="form-card-stack">
      <CollapsibleCard title={<span className="stat-title"><CalendarClock size={15} /> Invoice Details</span>} storageKey="invoice-details">
        <p className="section-desc">Pick the month this invoice covers — the due date fills itself in as the 7th of the month after, and stays editable.</p>

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

        <div className="form-group">
          <label>Payment Date</label>
          <div className="paydate-row">
            <DatePicker
              value={data.paidDate || ''}
              onChange={(val) => updateField('paidDate', val)}
              placeholder="Not paid yet"
            />
            {data.paidDate && (
              <button
                type="button"
                className="btn-icon btn-icon-danger"
                onClick={() => updateField('paidDate', '')}
                title="Mark as not paid"
                aria-label="Mark as not paid"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <p className="section-desc split-desc">Filling it marks the invoice paid — the PAID stamp goes on.</p>
        </div>
      </CollapsibleCard>

      <CollapsibleCard title={<span className="stat-title"><Users size={15} /> Names</span>} storageKey="names">
        <div className="input-row">
          <label className="fld">
            <span className="fld-label">Flatmate 1</span>
            <input
              type="text"
              value={names.matias}
              onChange={(e) => updateName('matias', e.target.value)}
              placeholder="Flatmate 1"
            />
          </label>
          <label className="fld">
            <span className="fld-label">Flatmate 2</span>
            <input
              type="text"
              value={names.reka}
              onChange={(e) => updateName('reka', e.target.value)}
              placeholder="Flatmate 2"
            />
          </label>
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
            {names.matias.trim() || 'Flatmate 1'} pays {splitPct}%, {names.reka.trim() || 'Flatmate 2'} pays {otherPct}% of every bill.
          </p>
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        title={<span className="stat-title"><Receipt size={15} /> Bills</span>}
        storageKey="bills"
        actions={(
          <button className="btn btn-primary btn-sm" onClick={addBill}>
            <Plus size={16} /> Add Bill
          </button>
        )}
      >
        <p className="section-desc">
          Set a discount % and who it's for — the other flatmate covers that part. All means nobody pays it.
        </p>
        {data.bills.length > 0 && (
          <div className="input-row extras-row bill-row row-labels" aria-hidden="true">
            <span className="rl-over-input">Bill</span>
            <span className="currency-input rl-over-pill">Amount £</span>
            <span className="percent-input">Disc %</span>
            {billDiscountPercent(data.bills[0]) > 0 && <span className="bill-discount-select">Disc for</span>}
            <span className="row-labels-action" />
          </div>
        )}
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
                onChange={(e) => updateBill(bill.id, 'discountPercent', limitDecimals(e.target.value))}
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
      </CollapsibleCard>

      {renderPersonExtras('matias', 'Flatmate 1')}
      {renderPersonExtras('reka', 'Flatmate 2')}

      <CollapsibleCard title={<span className="stat-title"><Percent size={15} /> Discounts</span>} storageKey="discounts">
        <p className="section-desc">Taken off a flatmate's final total — a fixed £ amount, or a % of it.</p>
        {renderPersonDiscounts('matias', 'Flatmate 1')}
        {renderPersonDiscounts('reka', 'Flatmate 2')}
      </CollapsibleCard>

      <CollapsibleCard title={<span className="stat-title"><StickyNote size={15} /> Notes</span>} storageKey="notes">
        <p className="section-desc">Optional — anything written here appears on the invoice.</p>
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
      </CollapsibleCard>

      <CollapsibleCard title={<span className="stat-title"><Landmark size={15} /> Bank Details</span>} storageKey="bank-details">
        <p className="section-desc">Printed at the bottom of every invoice.</p>
        <BankAccountPicker
          bankDetails={data.bankDetails}
          onPick={(bd) => onChange({ ...data, bankDetails: bd })}
        />
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
      </CollapsibleCard>
    </div>
  );
}
