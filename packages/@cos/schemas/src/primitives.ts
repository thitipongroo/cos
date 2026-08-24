// Reusable field primitives.
//
// QM-3: every message is an i18n KEY, never a literal user-facing string. The consumer resolves it
// through its own i18n layer (apps/web/src/i18n). Keys use the {domain}.{screen}.{element} shape the
// mandate specifies — here scoped under `validation.` because these are cross-screen field rules.
import * as z from 'zod/mini';

/** Message keys emitted by these primitives. Consumers must define all of them in every locale. */
export const MESSAGE_KEYS = [
  'validation.required',
  'validation.tooLong',
  'validation.notAnEmail',
  'validation.notAUuid',
  'validation.outOfRange',
  'validation.notAnInteger',
  'validation.invalidOption',
  'validation.notADate',
  'validation.notAnAmount',
  'validation.notACurrency',
  'validation.notAPhone',
  'validation.notAnOtp',
] as const;

export type MessageKey = (typeof MESSAGE_KEYS)[number];

/** Non-empty trimmed text with an upper bound. `max` mirrors the column width on the server. */
export const requiredText = (max: number) =>
  z
    .string()
    .check(z.trim(), z.minLength(1, 'validation.required'), z.maxLength(max, 'validation.tooLong'));

/** Optional text — an empty string is normalised to undefined so the API receives no key at all. */
export const optionalText = (max: number) =>
  z.optional(z.string().check(z.trim(), z.maxLength(max, 'validation.tooLong')));

/** A required entity reference. The API issues UUIDs; an empty select must fail as `required`. */
export const requiredId = z
  .string()
  .check(z.minLength(1, 'validation.required'), z.uuid('validation.notAUuid'));

/** Whole number within an inclusive range — e.g. progress_percent 0–100, risk score 1–25. */
export const intInRange = (min: number, max: number) =>
  z
    .number()
    .check(
      z.int('validation.notAnInteger'),
      z.gte(min, 'validation.outOfRange'),
      z.lte(max, 'validation.outOfRange'),
    );

/**
 * A percentage 0–100 that may be fractional.
 *
 * Separate from `intInRange(0, 100)` because the tenant-settings form uses `step="0.01"` on its
 * variance and retention thresholds — an integer-only rule would reject a 2.5% threshold the UI
 * explicitly lets an admin type.
 */
export const percent = z
  .number()
  .check(z.gte(0, 'validation.outOfRange'), z.lte(100, 'validation.outOfRange'));

/** DESIGN.md §9.1 — Task.progress_percent is 0–100. */
export const progressPercent = intInRange(0, 100);

/** DESIGN.md §9.1 — ProjectRisk score = likelihood × impact, 1–25 (ADR-065). */
export const riskScore = intInRange(1, 25);

export const email = z
  .string()
  .check(z.minLength(1, 'validation.required'), z.email('validation.notAnEmail'));

/** Optional email — an empty field must not be reported as a malformed address. */
export const optionalEmail = z.optional(
  z.union([z.literal(''), z.string().check(z.email('validation.notAnEmail'))]),
);

/**
 * A calendar date as ISO `YYYY-MM-DD`.
 *
 * Kept as a string, not `z.date()`: this is the wire format the API takes, and the UI's date field
 * emits it directly. Converting to a Date and back would introduce a timezone, which a plain
 * calendar date does not have — a report dated 2026-08-03 is that date in Bangkok and in UTC alike.
 */
export const isoDate = z
  .string()
  .check(
    z.minLength(1, 'validation.required'),
    z.regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.notADate'),
  );

/** Optional ISO date — empty means "not supplied", not "malformed". */
export const optionalIsoDate = z.optional(
  z.union([z.literal(''), z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.notADate'))]),
);

/**
 * A local date-time as `YYYY-MM-DDTHH:mm`, the value an `<input type="datetime-local">` produces.
 *
 * Seconds are optional because browsers omit them unless a `step` asks for them.
 */
export const isoDateTimeLocal = z
  .string()
  .check(
    z.minLength(1, 'validation.required'),
    z.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, 'validation.notADate'),
  );

/**
 * A monetary amount as a decimal string.
 *
 * A string, not a number, all the way to the API: money in this system is `NUMERIC` in Postgres,
 * and routing it through a JS float would silently round values a construction budget cannot afford
 * to lose. Up to two decimal places; no thousands separators, no currency symbol.
 */
export const money = z
  .string()
  .check(
    z.minLength(1, 'validation.required'),
    z.regex(/^\d+(\.\d{1,2})?$/, 'validation.notAnAmount'),
  );

/** Optional monetary amount — empty means "not supplied". */
export const optionalMoney = z.optional(
  z.union([
    z.literal(''),
    z.string().check(z.regex(/^\d+(\.\d{1,2})?$/, 'validation.notAnAmount')),
  ]),
);

/** ISO 4217 currency code — three uppercase letters, e.g. `THB`. */
export const currencyCode = z
  .string()
  .check(z.minLength(1, 'validation.required'), z.regex(/^[A-Z]{3}$/, 'validation.notACurrency'));

/**
 * A quantity as a decimal string, for the same NUMERIC reason as `money`.
 *
 * Zero is allowed: recording a delivery of zero received units is how a short delivery is entered.
 */
export const quantity = z
  .string()
  .check(
    z.minLength(1, 'validation.required'),
    z.regex(/^\d+(\.\d{1,4})?$/, 'validation.notAnAmount'),
  );
