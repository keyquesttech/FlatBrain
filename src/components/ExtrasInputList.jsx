import React from 'react';
import { Plus, X } from 'lucide-react';
import CurrencyInput from './CurrencyInput';
import SelectMenu from './SelectMenu';

export default function ExtrasInputList({
  title,
  titleClassName = 'invoice-section-title',
  description,
  extras,
  onAdd,
  onUpdate,
  onRemove,
  // When provided, each row gets a split selector (e.g. "50/50" vs "100%").
  // Rows must carry a `split` value matching one of the option values.
  splitOptions,
  onSplitChange,
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
          {splitOptions && (
            <div className="extra-split-select">
              <SelectMenu
                value={extra.split}
                onChange={(v) => onSplitChange(extra.id, v)}
                options={splitOptions}
                width="100%"
              />
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
