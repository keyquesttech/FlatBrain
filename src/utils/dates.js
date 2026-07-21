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
