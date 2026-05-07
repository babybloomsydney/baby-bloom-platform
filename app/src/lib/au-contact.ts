/**
 * Australian phone-number helpers + GNAF address parser shared
 * across the verification flow, onboarding, and settings.
 *
 * Single source of truth so the regex / formatter / parser
 * never drift between surfaces. Every place that accepts an
 * Australian mobile MUST validate with `isAuMobile` after
 * normalising via `normaliseAuMobile`.
 */

export const AU_MOBILE_REGEX = /^04\d{8}$/;

/** Strip whitespace + dashes; promote bare 4xxxxxxxx to 04xxxxxxxx. */
export function normaliseAuMobile(input: string): string {
  let digits = input.replace(/[\s-]+/g, "");
  if (/^4\d{8}$/.test(digits)) digits = "0" + digits;
  return digits;
}

export function isAuMobile(input: string): boolean {
  return AU_MOBILE_REGEX.test(normaliseAuMobile(input));
}

/** Format normalised "04XXXXXXXX" into the international display
 *  form. Returns the raw input unchanged when it doesn't validate
 *  so callers don't have to special-case partial input. */
export function formatAuMobile(input: string): string {
  const n = normaliseAuMobile(input);
  if (!AU_MOBILE_REGEX.test(n)) return input;
  const d = n.slice(1);
  return `+61 (0) ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

// ── Address parsing (GNAF SLA) ──────────────────────────────────

export interface ParsedAddress {
  street: string;
  suburb: string;
  postcode: string;
}

export function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Parse a GNAF single-line address ("12 Main St, BONDI NSW 2026")
 *  into structured parts. Returns null when the SLA isn't NSW. */
export function parseGnafAddress(sla: string): ParsedAddress | null {
  const match = sla.match(/^(.+),\s+([A-Z\s]+?)\s+NSW\s+(\d{4})$/);
  if (!match) return null;
  const postcode = match[3];
  const fullBeforeState = sla
    .substring(0, sla.lastIndexOf("NSW"))
    .trim()
    .replace(/,\s*$/, "");
  const lastComma = fullBeforeState.lastIndexOf(",");
  if (lastComma < 0) return null;
  return {
    street: toTitleCase(fullBeforeState.substring(0, lastComma).trim()),
    suburb: toTitleCase(fullBeforeState.substring(lastComma + 1).trim()),
    postcode,
  };
}
