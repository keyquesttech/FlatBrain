import React from 'react';

export default function CurrencyInput({ value, onChange, placeholder = '0.00', className = '', style, ...props }) {
  return (
    <div className={`currency-input ${className}`.trim()} style={style}>
      <span className="currency-input-prefix" aria-hidden="true">£</span>
      <input
        type="number"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        min="0"
        step="0.01"
        inputMode="decimal"
        {...props}
      />
    </div>
  );
}
