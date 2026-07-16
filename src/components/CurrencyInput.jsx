import React from 'react';
import { limitDecimals } from '../utils/calculations';

export default function CurrencyInput({ value, onChange, placeholder = '0.00', className = '', style, maxDecimals = 2, ...props }) {
  return (
    <div className={`currency-input ${className}`.trim()} style={style}>
      <span className="currency-input-prefix" aria-hidden="true">£</span>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          // Pennies are the smallest display unit — extra decimals are only
          // allowed where the caller raises maxDecimals (extras unit price).
          e.target.value = limitDecimals(e.target.value, maxDecimals);
          onChange(e);
        }}
        placeholder={placeholder}
        min="0"
        step="0.01"
        inputMode="decimal"
        {...props}
      />
    </div>
  );
}
