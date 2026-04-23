import { describe, it, expect } from "vitest";
import { resolveChild } from "./utils";
import type { ChildSummary } from "@/lib/chat/context";

const oliver: ChildSummary = {
  id: "c1",
  firstName: "Oliver",
  ageMonths: 18,
  ageBracket: "12-24 months",
  gender: "male",
};
const lily: ChildSummary = {
  id: "c2",
  firstName: "Lily",
  ageMonths: 24,
  ageBracket: "24-32 months",
  gender: "female",
};

describe("resolveChild", () => {
  it("returns error for user with no children", () => {
    const r = resolveChild(undefined, []);
    expect(r.error?.success).toBe(false);
    expect(r.error?.error).toMatch(/don't yet have any children/);
  });

  it("single-child user: omitted name returns that child", () => {
    const r = resolveChild(undefined, [oliver]);
    expect(r.child?.id).toBe("c1");
  });

  it("single-child user: matching name returns that child", () => {
    const r = resolveChild("Oliver", [oliver]);
    expect(r.child?.id).toBe("c1");
  });

  it("single-child user: case-insensitive match", () => {
    const r = resolveChild("oLiVeR", [oliver]);
    expect(r.child?.id).toBe("c1");
  });

  it("single-child user: wrong name returns error mentioning the only child", () => {
    const r = resolveChild("Lily", [oliver]);
    expect(r.error?.error).toMatch(/only child/);
    expect(r.error?.error).toMatch(/Oliver/);
  });

  it("multi-child user: omitted name returns error listing children", () => {
    const r = resolveChild(undefined, [oliver, lily]);
    expect(r.error?.error).toMatch(/multiple children/);
    expect(r.error?.error).toContain("Oliver");
    expect(r.error?.error).toContain("Lily");
  });

  it("multi-child user: correct name returns that child", () => {
    const r = resolveChild("Lily", [oliver, lily]);
    expect(r.child?.id).toBe("c2");
  });

  it("multi-child user: unknown name returns error listing options", () => {
    const r = resolveChild("Sam", [oliver, lily]);
    expect(r.error?.error).toMatch(/don't recognise/);
    expect(r.error?.error).toContain("Oliver");
    expect(r.error?.error).toContain("Lily");
  });

  it("handles non-string name input", () => {
    const r = resolveChild(42, [oliver, lily]);
    expect(r.error).toBeDefined();
  });

  it("handles empty string as omitted", () => {
    const r = resolveChild("", [oliver]);
    expect(r.child?.id).toBe("c1");
  });
});
