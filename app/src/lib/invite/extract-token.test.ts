/**
 * Pure URL → token extraction with origin validation.
 *
 * Hostname must match `NEXT_PUBLIC_INVITE_BASE_URL` (defaults to
 * babybloomsydney.com.au). Pasting a prod URL into staging — or a
 * lookalike-domain phishing URL — must reject. Token shape must match
 * the XXXX-XXXX format from `lib/invite/flags` / `child-invites.ts`.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { extractInviteToken } from "./extract-token";

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_INVITE_BASE_URL;
});

describe("extractInviteToken", () => {
  it("extracts token from a valid invite URL on the default origin", () => {
    expect(
      extractInviteToken("https://babybloomsydney.com.au/invite/ABCD-2345"),
    ).toBe("ABCD-2345");
  });

  it("trims surrounding whitespace before parsing", () => {
    expect(
      extractInviteToken("  https://babybloomsydney.com.au/invite/ABCD-2345\n"),
    ).toBe("ABCD-2345");
  });

  it("accepts trailing slash on the path", () => {
    expect(
      extractInviteToken("https://babybloomsydney.com.au/invite/ABCD-2345/"),
    ).toBe("ABCD-2345");
  });

  it("respects NEXT_PUBLIC_INVITE_BASE_URL when set", () => {
    process.env.NEXT_PUBLIC_INVITE_BASE_URL = "http://localhost:3000";
    expect(extractInviteToken("http://localhost:3000/invite/ABCD-2345")).toBe(
      "ABCD-2345",
    );
  });

  it("rejects a URL on a lookalike domain", () => {
    expect(
      extractInviteToken("https://babybloomsydney.com/invite/ABCD-2345"),
    ).toBeNull();
  });

  it("rejects a token with the wrong format (lowercase, wrong length)", () => {
    expect(
      extractInviteToken("https://babybloomsydney.com.au/invite/abcd-2345"),
    ).toBeNull();
    expect(
      extractInviteToken("https://babybloomsydney.com.au/invite/ABCDEFGH"),
    ).toBeNull();
    expect(
      extractInviteToken("https://babybloomsydney.com.au/invite/ABCD-2"),
    ).toBeNull();
  });

  it("rejects a token containing the banned glyphs (I, L, O, 0, 1)", () => {
    expect(
      extractInviteToken("https://babybloomsydney.com.au/invite/IIII-IIII"),
    ).toBeNull();
    expect(
      extractInviteToken("https://babybloomsydney.com.au/invite/0000-0000"),
    ).toBeNull();
  });

  it("rejects a non-URL string", () => {
    expect(extractInviteToken("not a url")).toBeNull();
    expect(extractInviteToken("")).toBeNull();
    expect(extractInviteToken("   ")).toBeNull();
  });

  it("rejects a URL pointing to the wrong path", () => {
    expect(
      extractInviteToken("https://babybloomsydney.com.au/invites/ABCD-2345"),
    ).toBeNull();
    expect(
      extractInviteToken("https://babybloomsydney.com.au/login"),
    ).toBeNull();
  });

  it("rejects a URL with extra path segments after the token", () => {
    expect(
      extractInviteToken(
        "https://babybloomsydney.com.au/invite/ABCD-2345/extra",
      ),
    ).toBeNull();
  });

  it("returns null (does not throw) when NEXT_PUBLIC_INVITE_BASE_URL is malformed", () => {
    process.env.NEXT_PUBLIC_INVITE_BASE_URL = "not a url";
    // A misconfigured deploy must fail closed — every URL becomes
    // unreachable rather than the function throwing.
    expect(
      extractInviteToken("https://babybloomsydney.com.au/invite/ABCD-2345"),
    ).toBeNull();
  });
});
