/**
 * Time zone utilities
 *
 * Uses Intl.DateTimeFormat so it works without extra libraries.
 * Default community timezone: America/Havana (Cuba).
 */

export const DEFAULT_TIMEZONE = 'America/Havana';

function getParts(date: Date, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    parts[part.type] = part.value;
  }
  return parts;
}

/**
 * Format a UTC ISO string for display in the given time zone.
 * Example: "Aug 31, 8:00 PM EDT"
 */
export function formatInTimeZone(iso: string | undefined, timeZone: string = DEFAULT_TIMEZONE): string {
  if (!iso) return '';
  const date = new Date(iso);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  return formatter.format(date);
}

/**
 * Format a UTC ISO string as a short date in the given time zone.
 * Example: "Aug 31"
 */
export function formatDateInTimeZone(iso: string | undefined, timeZone: string = DEFAULT_TIMEZONE): string {
  if (!iso) return '';
  const date = new Date(iso);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
  });
  return formatter.format(date);
}

/**
 * Check whether a calendar date (YYYY-MM-DD in the given time zone) has been reached.
 */
export function isDateInTimeZonePassed(dateStr: string, timeZone: string = DEFAULT_TIMEZONE): boolean {
  const now = new Date();
  const parts = getParts(now, timeZone);
  const nowDate = `${parts.year}-${parts.month}-${parts.day}`;
  return nowDate >= dateStr;
}

/**
 * Get the UTC Date representing midnight of `dateStr` in the given time zone.
 * `dateStr` should be in "YYYY-MM-DD" format.
 */
export function getMidnightInTimeZone(dateStr: string, timeZone: string = DEFAULT_TIMEZONE): Date {
  const [year, month, day] = dateStr.split('-').map(Number);

  // Start with a rough guess: midnight UTC for that date
  let guess = new Date(Date.UTC(year, month - 1, day));

  // Refine the guess until the local date in `timeZone` equals the target
  for (let i = 0; i < 12; i++) {
    const parts = getParts(guess, timeZone);
    const localYear = Number(parts.year);
    const localMonth = Number(parts.month);
    const localDay = Number(parts.day);
    const localHour = Number(parts.hour);
    const localMinute = Number(parts.minute);
    const localSecond = Number(parts.second);

    const targetMs = Date.UTC(year, month - 1, day, 0, 0, 0);
    const localMs = Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, localSecond);

    const diff = targetMs - localMs;
    if (Math.abs(diff) < 1000) break;
    guess = new Date(guess.getTime() + diff);
  }

  return guess;
}
