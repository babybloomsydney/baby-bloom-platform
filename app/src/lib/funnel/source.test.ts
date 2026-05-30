import { describe, it, expect } from "vitest";
import {
  parseFunnelSource,
  parseFunnelLead,
  funnelSourceToSignupSource,
} from "./source";

describe("parseFunnelSource", () => {
  it("returns 'std' for 'std'", () => {
    expect(parseFunnelSource("std")).toBe("std");
  });

  it("returns 'adv' for 'adv'", () => {
    expect(parseFunnelSource("adv")).toBe("adv");
  });

  it("returns null for unknown strings (silent fallback to legacy)", () => {
    expect(parseFunnelSource("viral")).toBeNull();
    expect(parseFunnelSource("STD")).toBeNull();
    expect(parseFunnelSource("")).toBeNull();
  });

  it("returns null for arrays (Next can pass arrays for repeated query params)", () => {
    expect(parseFunnelSource(["std", "adv"])).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseFunnelSource(undefined)).toBeNull();
  });

  it("returns null for null (URLSearchParams.get returns null when absent)", () => {
    expect(parseFunnelSource(null)).toBeNull();
  });
});

describe("parseFunnelLead", () => {
  it("returns the UUID for a canonical-format string", () => {
    const uuid = "3b1c2d4e-1234-5678-9abc-def012345678";
    expect(parseFunnelLead(uuid)).toBe(uuid);
  });

  it("accepts uppercase hex (case-insensitive UUID)", () => {
    const uuid = "AAAA1111-BBBB-2222-CCCC-3333DDDD4444";
    expect(parseFunnelLead(uuid)).toBe(uuid);
  });

  it("returns null for malformed strings (silent fallback)", () => {
    expect(parseFunnelLead("not-a-uuid")).toBeNull();
    expect(parseFunnelLead("3b1c2d4e-1234-5678-9abc")).toBeNull();
    expect(parseFunnelLead("")).toBeNull();
  });

  it("returns null for arrays", () => {
    expect(
      parseFunnelLead(["3b1c2d4e-1234-5678-9abc-def012345678"]),
    ).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseFunnelLead(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseFunnelLead(null)).toBeNull();
  });

  it("rejects strings with extra characters around an embedded UUID", () => {
    expect(
      parseFunnelLead("prefix-3b1c2d4e-1234-5678-9abc-def012345678"),
    ).toBeNull();
    expect(
      parseFunnelLead("3b1c2d4e-1234-5678-9abc-def012345678-suffix"),
    ).toBeNull();
  });
});

describe("funnelSourceToSignupSource", () => {
  it("maps 'std' to 'standard_match'", () => {
    expect(funnelSourceToSignupSource("std")).toBe("standard_match");
  });

  it("maps 'adv' to 'advanced_match'", () => {
    expect(funnelSourceToSignupSource("adv")).toBe("advanced_match");
  });
});
