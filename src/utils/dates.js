// Small date helpers shared by apps that track periods and due dates.

// "2026-09-01" → "1 Sep 2026" (UTC-parsed so timezones can't shift the day)
export function formatDay(iso) {
  const d = iso ? new Date(iso + 'T00:00:00Z') : null;
  return d && !isNaN(d)
    ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : '';
}

// "1 Jul 2026 – 31 Aug 2026" from two ISO dates; either side may be missing
export function formatPeriod(fromISO, toISO) {
  const from = formatDay(fromISO);
  const to = formatDay(toISO);
  if (from && to) return `${from} – ${to}`;
  return from || to || '';
}

// How many calendar months a period spans, counting both ends' months —
// the rent chart's "Block" column (Jul–Aug = 2). 0 when either end is unset.
export function monthsBetween(fromISO, toISO) {
  const [fy, fm] = String(fromISO || '').split('-').map(Number);
  const [ty, tm] = String(toISO || '').split('-').map(Number);
  if (!fy || !fm || !ty || !tm) return 0;
  return Math.max(0, ty * 12 + tm - (fy * 12 + fm) + 1);
}

// Days a period spans, both ends inclusive (1 Jul – 2 Jul = 2 days)
export function daysBetween(fromISO, toISO) {
  const from = Date.parse(String(fromISO || '') + 'T00:00:00Z');
  const to = Date.parse(String(toISO || '') + 'T00:00:00Z');
  if (isNaN(from) || isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86400000) + 1);
}

// How many rent units a period covers, in the unit rent is charged per:
// whole calendar months, exact days, or weeks (days ÷ 7, so partial weeks
// charge their fraction). 0 when the period is incomplete.
export function periodUnits(fromISO, toISO, unit = 'month') {
  if (unit === 'day') return daysBetween(fromISO, toISO);
  if (unit === 'week') return Math.round((daysBetween(fromISO, toISO) / 7) * 100) / 100;
  return monthsBetween(fromISO, toISO);
}

// "2 mo" / "61 days" / "8.71 wk" — the block length in the charging unit
export function periodUnitsLabel(fromISO, toISO, unit = 'month') {
  const n = periodUnits(fromISO, toISO, unit);
  if (!n) return '';
  if (unit === 'day') return `${n} day${n === 1 ? '' : 's'}`;
  if (unit === 'week') return `${n} wk`;
  return `${n} mo`;
}
