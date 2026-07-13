import React from 'react';
import { Plus, X } from 'lucide-react';
import CurrencyInput from './CurrencyInput';

export default function ExtrasInputList({
  title,
  titleClassName = 'invoice-section-title',
  description,
  extras,
  onAdd,
  onUpdate,
  onRemove,
  // Name of the flatmate the per-item percent is charged to. When set, each
  // row gets a % input (stored on the item's `percent` field, default 50).
  percentTo,
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
        <div key={extra.id} className="input-row extras-row">
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
            placeholder="Packs"
            aria-label="Packs"
            min="1"
            step="1"
            inputMode="numeric"
          />
          <CurrencyInput
            value={extra.price}
            onChange={(e) => onUpdate(extra.id, 'price', e.target.value)}
            placeholder="Price"
            aria-label="Price"
          />
          {percentTo != null && (
            <div className="currency-input percent-input" title={`% charged to ${percentTo}`}>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                inputMode="decimal"
                value={extra.percent ?? 50}
                onChange={(e) => onUpdate(extra.id, 'percent', e.target.value)}
                aria-label={`Percent charged to ${percentTo}`}
              />
              <span className="currency-input-prefix split-suffix" aria-hidden="true">%</span>
            </div>
          )}
          <button className="btn btn-danger action-btn" onClick={() => onRemove(extra.id)} aria-label="Remove item">
            <X size={18} />
          </button>
        </div>
      ))}
    </>
  );
}
