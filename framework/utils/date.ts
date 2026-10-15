/**
 * Dates and time, on date-fns. Everything outside app/ goes through this module,
 * never date-fns or `Date` directly (ESLint enforces it), so every date the
 * framework writes or reads uses one of the patterns below.
 */

import { add, differenceInMilliseconds, type Duration, format, isAfter, milliseconds, parseISO, sub } from 'date-fns';

/** date-fns `format` patterns (https://date-fns.org/docs/format). */
export const DateFormat = {
  /** Card expiry as the checkout form and the payment API take it: 07/29. */
  CARD_EXPIRY: 'MM/yy',
  /** Log lines: local time and its UTC offset, 2026-10-15 14:05:09 +07:00. */
  LOG: 'yyyy-MM-dd HH:mm:ss xxx',
  /** Sortable, file-name safe: an agent run's folder, 2026-10-15T14-05-09. */
  RUN_ID: "yyyy-MM-dd'T'HH-mm-ss",
} as const;
export type DateFormat = (typeof DateFormat)[keyof typeof DateFormat];

export function now(): Date {
  return new Date();
}

export function formatDate(date: Date, pattern: DateFormat): string {
  return format(date, pattern);
}

/** `date` moved by `duration`; negative values move back: `shift(now(), { months: -1 })`. */
export function shift(date: Date, duration: Duration): Date {
  return add(date, duration);
}

/** A date in ISO 8601, as the API sends it: 2026-10-15T07:05:09.123Z. */
export function fromIso(iso: string): Date {
  return parseISO(iso);
}

export function toIso(date: Date): string {
  return date.toISOString();
}

/** True while `date` is more than `margin` away in the future. */
export function isFresh(date: Date, margin: Duration = {}): boolean {
  return isAfter(sub(date, margin), now());
}

/** A duration in ms: `toMs({ seconds: 20 })`. */
export function toMs(duration: Duration): number {
  return milliseconds(duration);
}

/** Starts a timer; call the result for the ms elapsed since. */
export function stopwatch(): () => number {
  const started = now();
  return () => differenceInMilliseconds(now(), started);
}
