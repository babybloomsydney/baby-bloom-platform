/**
 * Tests for pickFallbackText — the Katie-voice fallback selector for
 * empty agentic-loop results. Pure function; isolated test target.
 */

import { describe, it, expect } from "vitest";
import { pickFallbackText } from "./fallback";
import type { ToolResult } from "@/lib/chat/modules/types";

function lastWith(result: ToolResult): { result: ToolResult } {
  return { result };
}

describe("pickFallbackText", () => {
  it("returns the no-tool-call message when last is undefined", () => {
    expect(pickFallbackText(undefined)).toBe(
      "Sorry — I didn't have anything to say there. Try rephrasing?",
    );
  });

  it("returns a soft retry prompt on tool error — never leaks the error message", () => {
    const last = lastWith({
      success: false,
      error: "duplicate key value violates unique constraint xyz123",
    });
    const out = pickFallbackText(last);
    expect(out).toBe("Hmm — that didn't go through. Want to try again?");
    expect(out).not.toContain("duplicate");
    expect(out).not.toContain("constraint");
    expect(out).not.toContain("xyz123");
  });

  it("returns the tile-rendered message when the tool produced a tile", () => {
    const last = lastWith({
      success: true,
      tile: { kind: "katie_note", data: { body: "hi" } },
    });
    expect(pickFallbackText(last)).toBe("Done — see above.");
  });

  it("returns the tile-rendered message when the tool produced a feed entry", () => {
    const last = lastWith({ success: true, feedEntry: true });
    expect(pickFallbackText(last)).toBe("Done — see above.");
  });

  it("returns the feedEntry message even when tile is undefined", () => {
    const last = lastWith({
      success: true,
      tile: undefined,
      feedEntry: true,
    });
    expect(pickFallbackText(last)).toBe("Done — see above.");
  });

  it("does NOT trigger the tile branch when feedEntry is explicitly false and tile is undefined", () => {
    const last = lastWith({ success: true, feedEntry: false });
    expect(pickFallbackText(last)).toBe(
      "I have what I need but couldn't put it into words. Ask me again?",
    );
  });

  it("returns the can't-narrate message when tool succeeded but produced nothing visible", () => {
    const last = lastWith({ success: true, data: { count: 5 } });
    expect(pickFallbackText(last)).toBe(
      "I have what I need but couldn't put it into words. Ask me again?",
    );
  });

  it("never includes tool names or mechanism words in any branch", () => {
    const fixtures: Array<{ result: ToolResult } | undefined> = [
      undefined,
      lastWith({ success: false, error: "any error" }),
      lastWith({
        success: true,
        tile: { kind: "katie_note", data: { body: "x" } },
      }),
      lastWith({ success: true, feedEntry: true }),
      lastWith({ success: true }),
    ];
    const forbidden = [
      "ran",
      "called",
      "tool",
      "function",
      "attempted",
      "tried",
      "_",
    ];
    for (const f of fixtures) {
      const out = pickFallbackText(f);
      for (const word of forbidden) {
        expect(
          out.toLowerCase().split(/\s+/).includes(word),
          `${out} contains forbidden word "${word}"`,
        ).toBe(false);
      }
    }
  });
});
