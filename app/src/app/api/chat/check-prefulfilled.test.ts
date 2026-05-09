import { describe, it, expect } from "vitest";
import {
  checkPrefulfilled,
  PREFULFILLED_SYNTHETIC_NOTE,
} from "./check-prefulfilled";
import type { ToolDefinition } from "@/lib/chat/modules/types";

/**
 * Per `Latency:Efficiency/07-test-plan.md §WU6` integration tests:
 *
 * 4. When `isPrefulfilled` returns true, the handler is NOT called
 *    (tested at the route level — here we verify the helper returns
 *    skip=true so the caller can short-circuit).
 * 5. A synthetic ToolResult is emitted with the canonical shape
 *    `{ source: "preload", note: "..." }`.
 * 6. The `tool_call` event still fires (route-level concern; the
 *    helper just signals skip so the caller doesn't run the handler).
 * 7. `metadata.tool_calls_skipped_by_prefulfilled` is populated by
 *    the caller — the helper exposes the skip signal it needs.
 */

const TOOL_WITH_HOOK_ALWAYS_TRUE: ToolDefinition = {
  name: "tool_a",
  description: "",
  parameters: {},
  isPrefulfilled: () => true,
};

const TOOL_WITH_HOOK_ALWAYS_FALSE: ToolDefinition = {
  name: "tool_b",
  description: "",
  parameters: {},
  isPrefulfilled: () => false,
};

const TOOL_WITHOUT_HOOK: ToolDefinition = {
  name: "tool_c",
  description: "",
  parameters: {},
};

describe("checkPrefulfilled", () => {
  it("returns skip=true with a synthetic ToolResult when the predicate fires", () => {
    const out = checkPrefulfilled(TOOL_WITH_HOOK_ALWAYS_TRUE, {}, undefined);
    expect(out.skip).toBe(true);
    if (out.skip) {
      expect(out.result.success).toBe(true);
      // Canonical shape — Katie reads `source: "preload"` to know
      // where to find the data.
      expect(out.result.data).toEqual({
        source: "preload",
        note: PREFULFILLED_SYNTHETIC_NOTE,
      });
    }
  });

  it("returns skip=false when the predicate returns false", () => {
    const out = checkPrefulfilled(TOOL_WITH_HOOK_ALWAYS_FALSE, {}, undefined);
    expect(out.skip).toBe(false);
  });

  it("returns skip=false when the tool has no isPrefulfilled hook", () => {
    const out = checkPrefulfilled(TOOL_WITHOUT_HOOK, {}, undefined);
    expect(out.skip).toBe(false);
  });

  it("returns skip=false when the tool is undefined (defensive — Array.find returns undefined for unknown name)", () => {
    expect(checkPrefulfilled(undefined, {}, undefined).skip).toBe(false);
  });
});
