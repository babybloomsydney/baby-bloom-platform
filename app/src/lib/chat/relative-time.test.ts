import { describe, it, expect } from "vitest";
import { formatRelativeTime, classifyGap } from "./relative-time";

const NOW = new Date("2026-04-29T12:00:00Z");

function isoBefore(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

describe("formatRelativeTime", () => {
  it("returns 'just now' for sub-minute gaps", () => {
    expect(formatRelativeTime(isoBefore(30 * 1000), NOW)).toBe("just now");
    expect(formatRelativeTime(isoBefore(0), NOW)).toBe("just now");
  });

  it("returns 'just now' for future timestamps (clock skew safety)", () => {
    expect(
      formatRelativeTime(new Date(NOW.getTime() + 5000).toISOString(), NOW),
    ).toBe("just now");
  });

  it("returns minute-level for 1-59 minutes", () => {
    expect(formatRelativeTime(isoBefore(2 * 60 * 1000), NOW)).toBe("2 min ago");
    expect(formatRelativeTime(isoBefore(45 * 60 * 1000), NOW)).toBe(
      "45 min ago",
    );
  });

  it("returns hour-level for 1-23 hours", () => {
    expect(formatRelativeTime(isoBefore(3 * 60 * 60 * 1000), NOW)).toBe(
      "3h ago",
    );
    expect(formatRelativeTime(isoBefore(23 * 60 * 60 * 1000), NOW)).toBe(
      "23h ago",
    );
  });

  it("returns 'yesterday' at exactly 1 day", () => {
    expect(
      formatRelativeTime(isoBefore(24 * 60 * 60 * 1000 + 60 * 1000), NOW),
    ).toBe("yesterday");
  });

  it("returns days for 2-6 days", () => {
    expect(formatRelativeTime(isoBefore(3 * 24 * 60 * 60 * 1000), NOW)).toBe(
      "3 days ago",
    );
    expect(formatRelativeTime(isoBefore(6 * 24 * 60 * 60 * 1000), NOW)).toBe(
      "6 days ago",
    );
  });

  it("returns weeks for 7-34 days", () => {
    expect(formatRelativeTime(isoBefore(7 * 24 * 60 * 60 * 1000), NOW)).toBe(
      "1 week ago",
    );
    expect(formatRelativeTime(isoBefore(14 * 24 * 60 * 60 * 1000), NOW)).toBe(
      "2 weeks ago",
    );
  });

  it("returns months for 35-364 days", () => {
    expect(formatRelativeTime(isoBefore(60 * 24 * 60 * 60 * 1000), NOW)).toBe(
      "2 months ago",
    );
  });

  it("returns years for >=1 year", () => {
    expect(formatRelativeTime(isoBefore(400 * 24 * 60 * 60 * 1000), NOW)).toBe(
      "1 year ago",
    );
  });

  it("returns 'earlier' for unparseable input rather than crashing", () => {
    expect(formatRelativeTime("not-a-date", NOW)).toBe("earlier");
  });
});

describe("classifyGap", () => {
  it("returns 'fresh' for null / undefined / empty / unparseable", () => {
    expect(classifyGap(null, NOW)).toBe("fresh");
    expect(classifyGap(undefined, NOW)).toBe("fresh");
    expect(classifyGap("garbage", NOW)).toBe("fresh");
  });

  it("returns 'fresh' under 15 minutes", () => {
    expect(classifyGap(isoBefore(0), NOW)).toBe("fresh");
    expect(classifyGap(isoBefore(60 * 1000), NOW)).toBe("fresh");
    expect(classifyGap(isoBefore(14 * 60 * 1000), NOW)).toBe("fresh");
  });

  it("returns 'warming' between 15 minutes and 4 hours", () => {
    expect(classifyGap(isoBefore(15 * 60 * 1000), NOW)).toBe("warming");
    expect(classifyGap(isoBefore(60 * 60 * 1000), NOW)).toBe("warming");
    expect(
      classifyGap(isoBefore(3 * 60 * 60 * 1000 + 59 * 60 * 1000), NOW),
    ).toBe("warming");
  });

  it("returns 'stale' at or past 4 hours", () => {
    expect(classifyGap(isoBefore(4 * 60 * 60 * 1000), NOW)).toBe("stale");
    expect(classifyGap(isoBefore(24 * 60 * 60 * 1000), NOW)).toBe("stale");
    expect(classifyGap(isoBefore(7 * 24 * 60 * 60 * 1000), NOW)).toBe("stale");
  });
});
