import React from 'react';
import { limitDecimals } from '../utils/calculations';

export default function CurrencyInput({ value, onChange, placeholder = '0.00', className = '', style, ...props }) {
  return (
    <div className={`currency-input ${className}`.trim()} style={style}>
      <span className="currency-input-prefix" aria-hidden="true">£</span>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          // Pennies are the smallest unit — a third decimal can't be typed.
          e.target.value = limitDecimals(e.target.value);
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
