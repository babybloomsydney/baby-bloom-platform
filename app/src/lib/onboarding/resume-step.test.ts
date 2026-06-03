import { describe, expect, it } from "vitest";
import { applyStartAtFloor, parseStartAt } from "./resume-step";

describe("parseStartAt (T-022)", () => {
  it("returns 0 when input is undefined", () => {
    expect(parseStartAt(undefined)).toBe(0);
  });

  it("returns 0 when input is an empty string", () => {
    // Number('') is 0 which passes Number.isFinite + Number.isInteger
    // + bounds. The semantic outcome is still "no floor applied".
    expect(parseStartAt("")).toBe(0);
  });

  it("returns the integer value when input is a valid in-range integer", () => {
    expect(parseStartAt("0")).toBe(0);
    expect(parseStartAt("1")).toBe(1);
    expect(parseStartAt("2")).toBe(2);
    expect(parseStartAt("3")).toBe(3);
    expect(parseStartAt("4")).toBe(4);
  });

  it("returns 0 for non-numeric strings (NaN)", () => {
    expect(parseStartAt("abc")).toBe(0);
    expect(parseStartAt("not-a-number")).toBe(0);
    expect(parseStartAt("1.5x")).toBe(0);
  });

  it("returns 0 for negative numbers", () => {
    expect(parseStartAt("-1")).toBe(0);
    expect(parseStartAt("-99")).toBe(0);
  });

  it("returns 0 for out-of-range numbers", () => {
    expect(parseStartAt("5")).toBe(0);
    expect(parseStartAt("99")).toBe(0);
  });

  it("returns 0 for floats (rejects non-integer steps)", () => {
    expect(parseStartAt("1.5")).toBe(0);
    expect(parseStartAt("2.7")).toBe(0);
  });

  it("returns 0 for Infinity / -Infinity", () => {
    expect(parseStartAt("Infinity")).toBe(0);
    expect(parseStartAt("-Infinity")).toBe(0);
  });
});

describe("applyStartAtFloor (T-022)", () => {
  it("returns the resumeStep when startAt is missing or invalid", () => {
    expect(applyStartAtFloor(3, undefined)).toBe(3);
    expect(applyStartAtFloor(3, "abc")).toBe(3);
    expect(applyStartAtFloor(3, "99")).toBe(3);
  });

  it("returns startAt when it's higher than resumeStep (floor applied)", () => {
    expect(applyStartAtFloor(0, "1")).toBe(1);
    expect(applyStartAtFloor(0, "4")).toBe(4);
  });

  it("never downgrades a resumeStep that's already ahead of startAt", () => {
    // The whole point: a stale `?startAt=1` URL doesn't push a
    // verification-progress-3 user back to step 1.
    expect(applyStartAtFloor(3, "1")).toBe(3);
    expect(applyStartAtFloor(4, "1")).toBe(4);
    expect(applyStartAtFloor(2, "0")).toBe(2);
  });

  it("respects equal resumeStep + startAt", () => {
    expect(applyStartAtFloor(1, "1")).toBe(1);
    expect(applyStartAtFloor(2, "2")).toBe(2);
  });

  it("handles the typical contributions-page flow", () => {
    // Fresh nanny clicking Get Started → contributions page → Add Child
    // (or Add child later) → routes to ?startAt=1.
    // resumeStep is 0 (no verification row yet). Result: lands at step 1.
    expect(applyStartAtFloor(0, "1")).toBe(1);
  });
});
