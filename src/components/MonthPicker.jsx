import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function MonthPicker({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Parse value "YYYY-MM"
  const currentYear = value ? parseInt(value.split('-')[0]) : new Date().getFullYear();
  const currentMonth = value ? parseInt(value.split('-')[1]) : new Date().getMonth() + 1;

  const [viewYear, setViewYear] = useState(currentYear);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (m) => {
    onChange(`${viewYear}-${String(m).padStart(2, '0')}`);
    setIsOpen(false);
  };

  // Force UTC parsing so timezone doesn't shift the month backwards
  const displayValue = value
    ? new Date(value + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : 'Select period';

  return (
    <div className="picker" ref={containerRef}>
      <button type="button" className={`picker-trigger ${isOpen ? 'open' : ''}`} onClick={() => setIsOpen(!isOpen)}>
        <span>{displayValue}</span>
        <Calendar size={18} className="picker-trigger-icon" />
      </button>

      {isOpen && (
        <div className="picker-dropdown">
          <div className="picker-nav">
            <button className="btn-icon" onClick={() => setViewYear(viewYear - 1)} type="button" aria-label="Previous year">
              <ChevronLeft size={18} />
            </button>
            <div className="picker-nav-label">{viewYear}</div>
            <button className="btn-icon" onClick={() => setViewYear(viewYear + 1)} type="button" aria-label="Next year">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="picker-grid picker-grid-3">
            {MONTHS.map((name, i) => {
              const m = i + 1;
              const isSelected = viewYear === currentYear && m === currentMonth;
              return (
                <button
                  key={m}
                  type="button"
                  className={`picker-option ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelect(m)}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
