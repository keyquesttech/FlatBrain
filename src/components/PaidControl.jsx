import React from 'react';
import { X } from 'lucide-react';
import DatePicker from './DatePicker';

// A paid status as a date picker, so anything can be marked paid on ANY
// date: unpaid shows a "Mark paid…" trigger that opens the calendar; once
// set it turns into a lime chip showing the date (still tappable to change
// it) with a small × to unmark.
export default function PaidControl({ paidDate, onChange }) {
  return (
    <span className={`paid-picker ${paidDate ? 'is-paid' : ''}`}>
      {paidDate && <span className="paid-picker-tag">Paid</span>}
      <DatePicker value={paidDate} onChange={onChange} placeholder="Mark paid…" />
      {paidDate && (
        <button
          type="button"
          className="btn-icon btn-icon-danger"
          onClick={() => onChange('')}
          title="Mark as not paid"
          aria-label="Mark as not paid"
        >
          <X size={14} />
        </button>
      )}
    </span>
  );
}
