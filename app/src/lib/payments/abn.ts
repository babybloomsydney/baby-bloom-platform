/**
 * Australian Business Number — validation, normalisation, display.
 *
 * Pure / synchronous / no I/O. Safe to call from client + server.
 * ATO algorithm per https://abr.business.gov.au/Help/AbnFormat.
 *
 * Used as the gate before nanny Connect onboarding — BB collects ABN
 * upfront and passes it at `accounts.create` time as
 * `individual.id_number` so Stripe accepts it without re-prompting
 * the nanny in the hosted embed.
 */

const ABN_LENGTH = 11;
const ABN_DIVISOR = 89;
const ABN_WEIGHTS: readonly number[] = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

/** Strip non-digit characters. Paste-friendly. */
export function normaliseABN(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Validate an Australian Business Number per the ATO checksum.
 *
 * 1. Strip non-digit characters.
 * 2. Reject if length ≠ 11.
 * 3. Reject if the first digit is 0 — the ATO doesn't issue ABNs
 *    with a leading zero, even though some leading-zero strings
 *    technically pass the modulo-89 weighted-sum check.
 * 4. Subtract 1 from the first digit.
 * 5. Multiply each digit by its position weight and sum.
 * 6. Accept if the sum is divisible by 89.
 */
export function isValidABN(input: string): boolean {
  const digits = normaliseABN(input);
  if (digits.length !== ABN_LENGTH) return false;
  if (digits.charAt(0) === "0") return false;

  const firstDigit = parseInt(digits.charAt(0), 10) - 1;
  let sum = firstDigit * (ABN_WEIGHTS[0] ?? 0);
  for (let i = 1; i < ABN_LENGTH; i++) {
    const digit = parseInt(digits.charAt(i), 10);
    sum += digit * (ABN_WEIGHTS[i] ?? 0);
  }
  return sum % ABN_DIVISOR === 0;
}

/**
 * Display format: "XX XXX XXX XXX". Returns input unchanged if not
 * 11 digits.
 */
export function formatABNDisplay(abn: string): string {
  const digits = normaliseABN(abn);
  if (digits.length !== ABN_LENGTH) return abn;
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 11)}`;
}
