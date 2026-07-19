import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import InvoicePreview from '/home/pi/BillSplitter/.claude/worktrees/codebase-analysis-setup-248595/src/components/InvoicePreview.jsx';
import ExtrasInputList from '/home/pi/BillSplitter/.claude/worktrees/codebase-analysis-setup-248595/src/components/ExtrasInputList.jsx';
import InvoiceForm from '/home/pi/BillSplitter/.claude/worktrees/codebase-analysis-setup-248595/src/components/InvoiceForm.jsx';
import Navigation from '/home/pi/BillSplitter/.claude/worktrees/codebase-analysis-setup-248595/src/components/Navigation.jsx';
import { normalizeDraft } from '/home/pi/BillSplitter/.claude/worktrees/codebase-analysis-setup-248595/src/utils/defaults.js';

let f = 0;
const check = (cond, label) => { if (!cond) { f++; console.log('FAIL:', label); } };

const draft = normalizeDraft({
  period: '2026-07',
  bills: [
    { id: 'b1', thing: 'Rent', amount: '900' },
    { id: 'b2', thing: 'Water', amount: '40', discountPercent: '50', discountedFrom: 'reka' }
  ],
  matiasExtras: [{ id: 'm1', thing: 'Bulbs', packs: '2', price: '15', percent: '50', percentOwn: true, unitPriced: true }],
  rekaExtras: [{ id: 'r1', thing: 'Cleaner', packs: '1', price: '6', percent: '50', percentOwn: true, unitPriced: true }],
  matiasDiscounts: [{ id: 'd1', thing: 'Credit', type: 'amount', value: '5' }]
});
const history = [{ id: 'h1', period: '2026-06', timestamp: 1, bills: [{ id: 'b', thing: 'Rent', amount: '850' }], matiasExtras: [] }];

// Invoice preview: orb layer + trend card + segment classes present
const prev = renderToStaticMarkup(<InvoicePreview data={draft} history={history} />);
check(prev.includes('invoice-orb-layer'), 'orb layer wraps the orbs');
check(prev.includes('Spending Trend'), 'trend card renders with history');
check(prev.includes('trend-seg-bills') && prev.includes('trend-seg-extras'), 'trend segments present');
check(prev.includes('due-card-summary-reka'), 'flatmate cards intact');

// Extras list: labels row + unit-price hint
const extras = renderToStaticMarkup(
  <ExtrasInputList extras={draft.matiasExtras} onAdd={() => {}} onUpdate={() => {}} onRemove={() => {}} percentPayer="M" percentOther="R" />
);
check(extras.includes('row-labels'), 'extras labels row');
check(extras.includes('Units') && extras.includes('Total £') && extras.includes('Split %') && extras.includes('Item'), 'extras column labels');
check(extras.includes('extras-unit-price') && extras.includes('£7.50'), 'unit price hint: 15/2=7.50');
check(renderToStaticMarkup(<ExtrasInputList extras={[]} onAdd={() => {}} onUpdate={() => {}} onRemove={() => {}} percentPayer="M" percentOther="R" />).includes('row-labels') === false, 'no labels row when list empty');

// Full form: bills + discounts labels rows, named field labels
const form = renderToStaticMarkup(<InvoiceForm data={draft} onChange={() => {}} />);
check(form.includes('Disc for'), 'bills labels row includes the discount-for column (first bill discounted... )');
check((form.match(/row-labels/g) || []).length >= 3, 'bills + extras + discounts labels rows');
check(form.includes('fld-label') && form.includes('Flatmate 1'), 'names fields labelled');
check(form.includes('Reason') && form.includes('£ / %'), 'discount column labels');

// Wait: first bill (Rent) has no discount — 'Disc for' must NOT show
const noSel = renderToStaticMarkup(<InvoiceForm data={{ ...draft, bills: [draft.bills[0]] }} onChange={() => {}} />);
check(!noSel.includes('Disc for'), 'no Disc-for label when first bill undiscounted');

// Navigation: mute toggle renders inside router
const nav = renderToStaticMarkup(<MemoryRouter><Navigation activeTab="generator" /></MemoryRouter>);
check(nav.includes('sound-toggle') && nav.includes('nav-brand-row'), 'nav sound toggle present');

console.log(f === 0 ? 'ALL SMOKE TESTS PASSED' : f + ' failures');
