/**
 * Pure resolver for the post-auth redirect when an invite token is in
 * play. Validates the URL-supplied token against the XXXX-XXXX format
 * before treating it as a redirect target — defends against an attacker
 * pasting `?invite=javascript:...` or arbitrary path fragments.
 */

import { describe, it, expect } from "vitest";
import { resolveInviteRedirect, isSafeInternalPath } from "./redirect";

describe("resolveInviteRedirect", () => {
  it("returns the invite landing path when the token is well-formed", () => {
    expect(resolveInviteRedirect("ABCD-2345", "/parent")).toBe(
      "/invite/ABCD-2345",
    );
  });

  it("falls back to the default when the token is null", () => {
    expect(resolveInviteRedirect(null, "/parent")).toBe("/parent");
  });

  it("falls back to the default when the token is malformed", () => {
    expect(resolveInviteRedirect("abcd-2345", "/parent")).toBe("/parent");
    expect(resolveInviteRedirect("ABCDEFGH", "/parent")).toBe("/parent");
    expect(resolveInviteRedirect("ABCD2345", "/parent")).toBe("/parent");
  });

  it("rejects glyph-confusable tokens (I/L/O/0/1)", () => {
    expect(resolveInviteRedirect("ABCD-1II1", "/parent")).toBe("/parent");
    expect(resolveInviteRedirect("ABCD-O00O", "/parent")).toBe("/parent");
  });

  it("falls back when an attacker injects scheme-style content", () => {
    expect(
      resolveInviteRedirect("javascript:alert(1)" as string, "/parent"),
    ).toBe("/parent");
    expect(resolveInviteRedirect("/etc/passwd" as string, "/parent")).toBe(
      "/parent",
    );
  });

  it("falls back when the token contains whitespace", () => {
    expect(resolveInviteRedirect("ABCD 2345", "/parent")).toBe("/parent");
    expect(resolveInviteRedirect(" ABCD-2345 ", "/parent")).toBe("/parent");
  });

  it("falls back on percent-encoded look-alike tokens", () => {
    // %41%42%43%44-%32%33%34%35 = "ABCD-2345" decoded; the regex sees
    // the encoded form and rejects.
    expect(resolveInviteRedirect("%41%42%43%44-%32%33%34%35", "/parent")).toBe(
      "/parent",
    );
  });

  it("falls back on double-dash and newline-prefixed tokens", () => {
    expect(resolveInviteRedirect("ABCD--234", "/parent")).toBe("/parent");
    expect(resolveInviteRedirect("\nABCD-2345", "/parent")).toBe("/parent");
  });
});

describe("isSafeInternalPath", () => {
  it("accepts absolute paths starting with a single /", () => {
    expect(isSafeInternalPath("/parent")).toBe(true);
    expect(isSafeInternalPath("/parent/development/abc")).toBe(true);
    expect(isSafeInternalPath("/")).toBe(true);
  });

  it("rejects scheme-relative URLs", () => {
    expect(isSafeInternalPath("//evil.com")).toBe(false);
    expect(isSafeInternalPath("//evil.com/path")).toBe(false);
  });

  it("rejects absolute URLs", () => {
    expect(isSafeInternalPath("https://evil.com")).toBe(false);
    expect(isSafeInternalPath("http://evil.com/path")).toBe(false);
    expect(isSafeInternalPath("javascript:alert(1)")).toBe(false);
  });

  it("rejects backslash-confused values", () => {
    expect(isSafeInternalPath("/\\evil.com")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isSafeInternalPath(null)).toBe(false);
    expect(isSafeInternalPath("")).toBe(false);
  });
});
