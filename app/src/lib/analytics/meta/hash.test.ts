/**
 * Meta CAPI PII hashing — Meta requires SHA-256 of *normalized* PII
 * (lowercased + trimmed email/name; digits-only phone) before any
 * identifier leaves our servers. Raw PII must never reach the Graph API.
 *
 * Spec: system/FB/Setup/03-conversions-api-and-deduplication.md.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { hashEmail, hashPhone, hashName, hashExternalId } from "./hash";

const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

describe("hashEmail", () => {
  it("lowercases + trims before hashing (Meta normalization)", () => {
    expect(hashEmail("  Test@Example.COM ")).toBe(
      sha256Hex("test@example.com"),
    );
  });

  it("returns a 64-char lowercase hex digest", () => {
    expect(hashEmail("a@b.com")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns undefined for empty / whitespace / null / undefined", () => {
    expect(hashEmail("")).toBeUndefined();
    expect(hashEmail("   ")).toBeUndefined();
    expect(hashEmail(null)).toBeUndefined();
    expect(hashEmail(undefined)).toBeUndefined();
  });
});

describe("hashPhone", () => {
  it("strips all non-digits before hashing", () => {
    expect(hashPhone("+61 400 000 000")).toBe(sha256Hex("61400000000"));
  });

  it("returns undefined when no digits remain", () => {
    expect(hashPhone("not-a-number")).toBeUndefined();
    expect(hashPhone(null)).toBeUndefined();
  });
});

describe("hashName / hashExternalId", () => {
  it("hashName lowercases + trims", () => {
    expect(hashName("  Smith ")).toBe(sha256Hex("smith"));
  });

  it("hashExternalId lowercases + trims", () => {
    expect(hashExternalId("  USER-123 ")).toBe(sha256Hex("user-123"));
  });

  it("both return undefined for blank input", () => {
    expect(hashName("   ")).toBeUndefined();
    expect(hashExternalId("")).toBeUndefined();
  });
});
