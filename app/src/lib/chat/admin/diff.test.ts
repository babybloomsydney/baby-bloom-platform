import { describe, it, expect } from "vitest";
import { lineDiff } from "./diff";

describe("lineDiff", () => {
  it("returns empty diff when strings are identical", () => {
    const d = lineDiff("a\nb\nc", "a\nb\nc");
    expect(d.added).toBe(0);
    expect(d.removed).toBe(0);
    expect(d.unified).toBe("");
  });

  it("marks added lines with +", () => {
    const d = lineDiff("a\nb", "a\nb\nc");
    expect(d.added).toBe(1);
    expect(d.removed).toBe(0);
    expect(d.unified).toContain("+ c");
  });

  it("marks removed lines with -", () => {
    const d = lineDiff("a\nb\nc", "a\nb");
    expect(d.added).toBe(0);
    expect(d.removed).toBe(1);
    expect(d.unified).toContain("- c");
  });

  it("handles mixed add + remove", () => {
    const d = lineDiff("one\ntwo\nthree", "one\nTWO\nthree\nfour");
    expect(d.removed).toBe(1);
    expect(d.added).toBe(2);
    expect(d.unified).toContain("- two");
    expect(d.unified).toContain("+ TWO");
    expect(d.unified).toContain("+ four");
  });
});
