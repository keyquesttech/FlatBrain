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
