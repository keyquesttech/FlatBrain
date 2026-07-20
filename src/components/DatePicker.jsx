import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export default function DatePicker({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Parse value "YYYY-MM-DD"
  const today = new Date();
  const currentYear = value ? parseInt(value.split('-')[0]) : today.getFullYear();
  const currentMonth = value ? parseInt(value.split('-')[1]) : today.getMonth() + 1;
  const currentDay = value ? parseInt(value.split('-')[2]) : null;

  const [viewYear, setViewYear] = useState(currentYear);
  const [viewMonth, setViewMonth] = useState(currentMonth);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const goToPrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleSelect = (day) => {
    const mm = String(viewMonth).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    onChange(`${viewYear}-${mm}-${dd}`);
    setIsOpen(false);
  };

  // Force UTC parsing so timezone doesn't shift the date backwards
  const displayValue = value
    ? new Date(value + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : 'Select due date';

  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  // JS getDay(): 0 = Sunday. Convert so Monday = 0 to match the Mo..Su header.
  const firstWeekday = (new Date(viewYear, viewMonth - 1, 1).getDay() + 6) % 7;

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="picker" ref={containerRef}>
      <button type="button" className={`picker-trigger ${isOpen ? 'open' : ''}`} onClick={() => setIsOpen(!isOpen)}>
        <span>{displayValue}</span>
        <Calendar size={18} className="picker-trigger-icon" />
      </button>

      {isOpen && (
        <div className="picker-dropdown">
          <div className="picker-nav">
            <button className="btn-icon" onClick={goToPrevMonth} type="button" aria-label="Previous month">
              <ChevronLeft size={18} />
            </button>
            <div className="picker-nav-label">{MONTH_NAMES[viewMonth - 1]} {viewYear}</div>
            <button className="btn-icon" onClick={goToNextMonth} type="button" aria-label="Next month">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="picker-grid picker-grid-7 picker-weekdays">
            {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
          </div>

          <div className="picker-grid picker-grid-7">
            {cells.map((day, idx) => {
              if (day === null) return <div key={`empty-${idx}`} />;
              const isSelected = value && viewYear === currentYear && viewMonth === currentMonth && day === currentDay;
              return (
                <button
                  key={day}
                  type="button"
                  className={`picker-option picker-option-day ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelect(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
