import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

// A compact custom dropdown styled to match the pickers.
export default function SelectMenu({ value, onChange, options, width = '120px' }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="picker" ref={containerRef} style={{ width }}>
      <button type="button" className={`picker-trigger ${isOpen ? 'open' : ''}`} onClick={() => setIsOpen(!isOpen)}>
        <span>{selected ? selected.label : 'Select'}</span>
        <ChevronDown size={18} className="picker-trigger-icon" />
      </button>

      {isOpen && (
        <div className="picker-dropdown picker-dropdown-list">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`picker-option ${o.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(o.value);
                setIsOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
