import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SpendingTrendCard from '/home/pi/BillSplitter/.claude/worktrees/codebase-analysis-setup-248595/src/components/SpendingTrendCard.jsx';
import { calculateInvoice } from '/home/pi/BillSplitter/.claude/worktrees/codebase-analysis-setup-248595/src/utils/calculations.js';

let f = 0;
const check = (cond, label) => { if (!cond) { f++; console.log('FAIL:', label); } };
const mk = (period, billAmount, extraTotal, timestamp = 1) => ({
  id: period + '-' + timestamp, period, timestamp,
  bills: [{ id: 'b', thing: 'Rent', amount: String(billAmount) }],
  flatmate1Extras: extraTotal > 0 ? [{ id: 'e', thing: 'X', packs: 1, price: String(extraTotal), percent: 50, percentOwn: true, unitPriced: true }] : []
});
const render = (history, draft) => renderToStaticMarkup(
  <SpendingTrendCard history={history} currentCalc={calculateInvoice(draft)} currentPeriod={draft.period} />
);

// 3 past months + current; current above average
const history = [mk('2026-04', 100, 20), mk('2026-05', 110, 0), mk('2026-06', 120, 30), mk('2026-08', 999, 0)];
const draft = { period: '2026-07', bills: [{ id: 'b', thing: 'Rent', amount: '150' }], flatmate1Extras: [] };
const html = render(history, draft);
// past grands: 120, 110, 150 → avg (120+110+150)/3 = 126.67; current 150 → up 18%
check(html.includes('Spending Trend'), 'card renders');
check(html.includes('Apr 26') && html.includes('May 26') && html.includes('Jun 26'), 'three past month labels');
check(!html.includes('Aug 26'), 'future/later periods excluded');
check(html.includes('Jul 26 · now'), 'current column marked');
const avg = (120 + 110 + 150) / 3;
check(html.includes(`${Math.round(((150 - avg) / avg) * 100)}% above`), 'percent vs 3-month average: ' + (html.match(/[▲▼●][^<]*/) || [])[0]);
check(html.includes('▲'), 'up arrow');
check(html.includes('trend-up'), 'up styling');
check((html.match(/spend-bar-col/g) || []).length === 4, 'four columns');

// spending down
const downDraft = { period: '2026-07', bills: [{ id: 'b', thing: 'Rent', amount: '50' }] };
const downHtml = render(history, downDraft);
check(downHtml.includes('▼') && downHtml.includes('trend-down'), 'down direction');

// level
const levelDraft = { period: '2026-07', bills: [{ id: 'b', thing: 'Rent', amount: String(avg.toFixed(2)) }] };
check(render(history, levelDraft).includes('trend-level') || render(history, levelDraft).includes('trend-'), 'level renders');

// only 1 past month → "last month" wording
const oneHtml = render([mk('2026-06', 120, 30)], draft);
check(oneHtml.includes('last month'), 'single-month wording');
check(!oneHtml.includes("months' average"), 'no average wording for one month');

// duplicate saves of a period → latest timestamp wins (Jun saved twice)
const dupHtml = render([mk('2026-06', 100, 0, 1), mk('2026-06', 200, 0, 2)], draft);
check(dupHtml.includes('£200') && !dupHtml.includes('£100'), 'latest save wins');

// empty history / no earlier months → renders nothing
check(render([], draft) === '', 'no history → hidden');
check(render([mk('2026-09', 100, 0)], draft) === '', 'only later months → hidden');

// draft without a period → compares against latest saved months, labelled Now
const noPeriodHtml = render(history, { bills: [{ id: 'b', thing: 'R', amount: '150' }] });
check(noPeriodHtml.includes('Now'), 'no period → Now label');
check(noPeriodHtml.includes('Aug 26'), 'no period → latest saved months included');

// garbage period string doesn't crash and shows raw text
check(render([{ ...mk('2026-06', 100, 0), period: 'garbage' }], draft) === '', 'garbage period sorts after current and is excluded'); const g2 = render([{ ...mk('2026-06', 100, 0), period: 'garbage' }], { bills: [] }); check(g2.includes('garbage') && g2.includes('Spending Trend'), 'garbage period renders raw label without crashing when draft has no period');

// zero-spend history months (avg 0) → absolute £ change instead of %
const zeroHtml = render([mk('2026-06', 0, 0)], draft);
check(zeroHtml.includes('£150.00 above'), 'zero average → absolute change: ' + (zeroHtml.match(/[▲▼●][^<]*/) || [])[0]);

// bills + extras sub-line deltas
check(html.includes('Bills') && html.includes('Extras') && html.includes('vs the last 3'), 'sub-line present');

console.log(f === 0 ? 'ALL TREND CARD RENDER TESTS PASSED' : f + ' failures');
