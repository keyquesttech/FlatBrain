import React from 'react';
import { limitDecimals } from '../utils/calculations';

// "1650.5" → "1,650.5" for display; the stored value never has commas.
function withThousands(value) {
  const s = String(value ?? '');
  if (s === '') return '';
  const [int, dec] = s.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec != null ? `${grouped}.${dec}` : grouped;
}

export default function CurrencyInput({ value, onChange, placeholder = '0.00', className = '', style, maxDecimals = 2, formatted = false, ...props }) {
  // Formatted mode shows thousands separators as you type (1000 → 1,000).
  // It must be a text input (number inputs can't display commas); the
  // change event's value is normalized back to a plain comma-less number
  // string before the caller sees it, so storage stays clean.
  const inputProps = formatted
    ? {
        type: 'text',
        value: withThousands(value),
        onChange: (e) => {
          const raw = limitDecimals(e.target.value.replace(/,/g, ''), maxDecimals);
          if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return; // swallow non-numeric keystrokes
          e.target.value = raw;
          onChange(e);
        }
      }
    : {
        type: 'number',
        value,
        min: '0',
        step: '0.01',
        onChange: (e) => {
          // Pennies are the smallest display unit — extra decimals are only
          // allowed where the caller raises maxDecimals (extras unit price).
          e.target.value = limitDecimals(e.target.value, maxDecimals);
          onChange(e);
        }
      };

  return (
    <div className={`currency-input ${className}`.trim()} style={style}>
      <span className="currency-input-prefix" aria-hidden="true">£</span>
      <input
        placeholder={placeholder}
        inputMode="decimal"
        {...inputProps}
        {...props}
      />
    </div>
  );
}
