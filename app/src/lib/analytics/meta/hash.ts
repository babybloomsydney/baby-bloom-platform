/**
 * Meta CAPI PII hashing. Meta requires SHA-256 of *normalized* PII before
 * any identifier is sent to the Conversions API:
 *   - email / name: trim + lowercase
 *   - phone: digits only (caller supplies country code)
 * Raw PII must never leave the process — these helpers are the only path.
 *
 * SERVER-SIDE (uses `node:crypto`). Returns `undefined` for blank input so
 * callers omit empty keys from `user_data` rather than sending empty hashes.
 *
 * Spec: system/FB/Setup/03-conversions-api-and-deduplication.md.
 */
import { createHash } from "node:crypto";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function normalizeText(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

export function hashEmail(email: string | null | undefined): string | undefined {
  const normalized = normalizeText(email);
  return normalized ? sha256Hex(normalized) : undefined;
}

export function hashPhone(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/[^0-9]/g, "");
  return digits.length > 0 ? sha256Hex(digits) : undefined;
}

export function hashName(name: string | null | undefined): string | undefined {
  const normalized = normalizeText(name);
  return normalized ? sha256Hex(normalized) : undefined;
}

/** External ID (our user id) — hashed per Meta advanced-matching guidance. */
export function hashExternalId(id: string | null | undefined): string | undefined {
  const normalized = normalizeText(id);
  return normalized ? sha256Hex(normalized) : undefined;
}
