/**
 * Date helpers for the relocation checklist — all local-time.
 *
 * `move_date` is stored as a plain ISO date string (YYYY-MM-DD). Every helper
 * here anchors to LOCAL midnight and reads LOCAL calendar fields, so a calendar
 * date never shifts across timezones.
 *
 * This is the guard against a class of bug this app hit before: calling
 * `Date.toISOString()` on a picker value converts to UTC and bumps evening picks
 * to the next calendar day in every Canadian timezone (all negative UTC offsets).
 * Parsing with a `T00:00:00` anchor (no `Z`) and formatting via getFullYear/
 * getMonth/getDate keeps the round-trip stable in any timezone.
 *
 * Extracted from checklist.tsx / profile.tsx so the logic is unit-testable
 * without the React Native runtime.
 */

/** Parse a YYYY-MM-DD string to a Date at local midnight (TZ-stable). */
export function parseISODate(iso: string): Date {
  // Anchor to local midnight so the calendar date never shifts with TZ.
  return new Date(`${iso}T00:00:00`);
}

/** Return a new Date `days` after `date` (calendar arithmetic, does not mutate). */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Format a Date back to a YYYY-MM-DD string using local calendar fields. */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today at local midnight, for clean overdue comparisons. */
export function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

/** Human-friendly deadline label (display only — never used for date math). */
export function formatDeadline(date: Date): string {
  return date.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
