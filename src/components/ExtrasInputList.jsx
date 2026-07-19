import React from 'react';
import { Plus, X } from 'lucide-react';
import CurrencyInput from './CurrencyInput';
import { extraUnitPrice, formatCurrency, limitDecimals, packsOf, parseAmount } from '../utils/calculations';

export default function ExtrasInputList({
  title,
  titleClassName = 'invoice-section-title',
  description,
  extras,
  onAdd,
  onUpdate,
  onRemove,
  // Names for the per-item % input: percentPayer is whoever added the item
  // (the % is THEIR share, stored on `percent`, default 50) and percentOther
  // is the flatmate charged the rest. The input shows when percentPayer set.
  percentPayer,
  percentOther,
  addLabel = 'Add Item',
  showAddButton = true
}) {
  return (
    <>
      {(title || showAddButton) && (
        <div className="extras-section-header">
          {title && <h3 className={titleClassName}>{title}</h3>}
          {showAddButton && (
            <button className="btn btn-primary btn-sm" onClick={onAdd}>
              <Plus size={16} /> {addLabel}
            </button>
          )}
        </div>
      )}

      {description && <p className="section-desc">{description}</p>}

      {extras.map((extra) => (
        <React.Fragment key={extra.id}>
          <div className="input-row extras-row">
            <input
              type="text"
              value={extra.thing}
              onChange={(e) => onUpdate(extra.id, 'thing', e.target.value)}
              placeholder="Item name"
              aria-label="Item name"
              maxLength={100}
            />
            <input
              type="number"
              className="packs-input"
              value={extra.packs}
              onChange={(e) => onUpdate(extra.id, 'packs', e.target.value)}
              placeholder="Units"
              aria-label="Units in the pack"
              title="How many units are in the pack — the price per unit is worked out from the total"
              min="1"
              step="1"
              inputMode="numeric"
            />
            <CurrencyInput
              value={extra.price}
              onChange={(e) => onUpdate(extra.id, 'price', e.target.value)}
              placeholder="Total price"
              aria-label="Total price paid"
              title="What the whole pack cost — the split % is applied to this amount"
            />
            {percentPayer != null && (
              <div className="currency-input percent-input" title={`% of this item ${percentPayer} pays — the rest is charged to ${percentOther}`}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  inputMode="decimal"
                  value={extra.percent ?? 50}
                  onChange={(e) => onUpdate(extra.id, 'percent', limitDecimals(e.target.value))}
                  aria-label={`Percent of the item ${percentPayer} pays`}
                />
                <span className="currency-input-prefix split-suffix" aria-hidden="true">%</span>
              </div>
            )}
            <button className="btn btn-danger action-btn" onClick={() => onRemove(extra.id)} aria-label="Remove item">
              <X size={18} />
            </button>
          </div>
          {packsOf(extra) > 1 && parseAmount(extra.price) > 0 && (
            <div className="extras-unit-price">
              = {formatCurrency(extraUnitPrice(extra))} per unit ({packsOf(extra)} units)
            </div>
          )}
        </React.Fragment>
      ))}
    </>
  );
}
