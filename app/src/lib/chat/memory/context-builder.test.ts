import { describe, it, expect, vi } from "vitest";
import { buildMemoryTable } from "./context-builder";

interface MemoryRow {
  id: string;
  bloombot_id: string;
  child_client_id: string | null;
  scope: string;
  priority: string;
  tags: string[];
  content: string;
  relevant_until: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function makeAdmin(rows: MemoryRow[]) {
  const select = vi.fn();
  const builder = {
    select: () => builder,
    eq: () => builder,
    or: () => builder,
    order: () => builder,
    limit: () => select(),
  };
  select.mockResolvedValue({ data: rows, error: null });
  return {
    from: vi.fn(() => builder),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const BASE: Omit<MemoryRow, "id" | "content" | "priority"> = {
  bloombot_id: "bot-1",
  child_client_id: null,
  scope: "account",
  tags: [],
  relevant_until: null,
  is_active: true,
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-04-01T00:00:00Z",
};

describe("buildMemoryTable", () => {
  it("returns null when there are no active memories", async () => {
    const out = await buildMemoryTable({
      botId: "bot-1",
      childIds: [],
      supabase: makeAdmin([]),
    });
    expect(out).toBeNull();
  });

  it("renders a Markdown-flavoured memory section", async () => {
    const out = await buildMemoryTable({
      botId: "bot-1",
      childIds: ["c1"],
      supabase: makeAdmin([
        {
          ...BASE,
          id: "m1",
          priority: "high",
          content: "User prefers mornings",
        },
        {
          ...BASE,
          id: "m2",
          priority: "medium",
          content: "Oliver is allergic to peanuts",
          scope: "child",
          child_client_id: "c1",
        },
      ]),
    });
    expect(out).not.toBeNull();
    expect(out).toContain("## Memory");
    expect(out).toContain("User prefers mornings");
    expect(out).toContain("Oliver is allergic to peanuts");
  });

  it("orders memories high → medium → low, stable within a bucket", async () => {
    const rows: MemoryRow[] = [
      { ...BASE, id: "a", priority: "low", content: "third" },
      { ...BASE, id: "b", priority: "high", content: "first" },
      { ...BASE, id: "c", priority: "medium", content: "second" },
    ];
    const out = await buildMemoryTable({
      botId: "bot-1",
      childIds: [],
      supabase: makeAdmin(rows),
    });
    const idxFirst = out!.indexOf("first");
    const idxSecond = out!.indexOf("second");
    const idxThird = out!.indexOf("third");
    expect(idxFirst).toBeLessThan(idxSecond);
    expect(idxSecond).toBeLessThan(idxThird);
  });

  it("caps to the hard limit (maxLines)", async () => {
    const rows: MemoryRow[] = Array.from({ length: 80 }, (_, i) => ({
      ...BASE,
      id: `m-${i}`,
      priority: "medium",
      content: `fact ${i}`,
    }));
    const out = await buildMemoryTable({
      botId: "bot-1",
      childIds: [],
      supabase: makeAdmin(rows),
      maxLines: 20,
    });
    const lines = out!.split("\n").filter((l) => l.startsWith("- "));
    expect(lines.length).toBe(20);
  });

  it("skips memories whose relevant_until is in the past", async () => {
    const rows: MemoryRow[] = [
      {
        ...BASE,
        id: "expired",
        priority: "high",
        content: "old plan",
        relevant_until: "2020-01-01",
      },
      {
        ...BASE,
        id: "live",
        priority: "high",
        content: "current plan",
        relevant_until: "2099-01-01",
      },
    ];
    const out = await buildMemoryTable({
      botId: "bot-1",
      childIds: [],
      supabase: makeAdmin(rows),
    });
    expect(out).not.toContain("old plan");
    expect(out).toContain("current plan");
  });

  it("includes tags inline when present", async () => {
    const rows: MemoryRow[] = [
      {
        ...BASE,
        id: "t",
        priority: "medium",
        content: "bedtime 7pm",
        tags: ["routine", "sleep"],
      },
    ];
    const out = await buildMemoryTable({
      botId: "bot-1",
      childIds: [],
      supabase: makeAdmin(rows),
    });
    expect(out).toContain("[routine, sleep]");
  });
});
