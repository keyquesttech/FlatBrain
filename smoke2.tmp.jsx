import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import InvoiceForm from '/home/pi/BillSplitter/.claude/worktrees/codebase-analysis-setup-248595/src/components/InvoiceForm.jsx';
import { normalizeDraft } from '/home/pi/BillSplitter/.claude/worktrees/codebase-analysis-setup-248595/src/utils/defaults.js';
const draft = normalizeDraft({
  bills: [
    { id: 'b2', thing: 'Water', amount: '40', discountPercent: '50', discountedFrom: 'reka' },
    { id: 'b1', thing: 'Rent', amount: '900' }
  ]
});
const form = renderToStaticMarkup(<InvoiceForm data={draft} onChange={() => {}} />);
console.log(form.includes('Disc for') ? 'PASS: Disc-for label shows when first bill is discounted' : 'FAIL');
