import { describe, it, expect, beforeEach, vi } from "vitest";
import { agentMemoryModule } from "./agent-memory";
import type { ChildSummary, ModuleContext } from "./types";

const oliver: ChildSummary = {
  id: "c1",
  firstName: "Oliver",
  ageMonths: 14,
  ageBracket: "12-18 months",
  gender: "male",
};

interface MockState {
  rows: Array<{
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
  }>;
}

function makeCtx(opts?: {
  children?: ChildSummary[];
  preload?: MockState["rows"];
}): { ctx: ModuleContext; state: MockState } {
  const state: MockState = { rows: opts?.preload ? [...opts.preload] : [] };

  // Minimal Supabase mock — just enough chain surface for the handlers.
  function chain(table: string) {
    if (table !== "agent_memory") {
      throw new Error(`Unexpected table: ${table}`);
    }
    let filtered = [...state.rows];
    const filters: Array<(r: MockState["rows"][number]) => boolean> = [];
    const api: Record<string, unknown> = {
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            const now = new Date().toISOString();
            const inserted = {
              id: `m-${state.rows.length + 1}`,
              bloombot_id: String(row.bloombot_id),
              child_client_id: (row.child_client_id as string | null) ?? null,
              scope: String(row.scope ?? "account"),
              priority: String(row.priority ?? "medium"),
              tags: (row.tags as string[] | undefined) ?? [],
              content: String(row.content),
              relevant_until:
                (row.relevant_until as string | null | undefined) ?? null,
              is_active: true,
              created_at: now,
              updated_at: now,
            };
            state.rows.push(inserted);
            return { data: inserted, error: null };
          },
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (col: string, val: unknown) => ({
          select: () => ({
            single: async () => {
              const idx = state.rows.findIndex(
                (r) => r[col as keyof typeof r] === val,
              );
              if (idx < 0)
                return { data: null, error: { message: "not found" } };
              state.rows[idx] = {
                ...state.rows[idx],
                ...patch,
                updated_at: new Date().toISOString(),
              };
              return { data: state.rows[idx], error: null };
            },
          }),
        }),
      }),
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col as keyof typeof r] === val);
        return api;
      },
      in: (col: string, vals: unknown[]) => {
        filters.push((r) => vals.includes(r[col as keyof typeof r]));
        return api;
      },
      contains: (_col: string, vals: unknown[]) => {
        filters.push((r) =>
          (vals as string[]).every((t) => r.tags.includes(t)),
        );
        return api;
      },
      order: () => api,
      limit: async (_n: number) => {
        filtered = state.rows.filter((r) => filters.every((f) => f(r)));
        return { data: filtered, error: null };
      },
      maybeSingle: async () => {
        filtered = state.rows.filter((r) => filters.every((f) => f(r)));
        return { data: filtered[0] ?? null, error: null };
      },
    };
    return api;
  }

  const supabase = {
    from: vi.fn((t: string) => chain(t)),
  };

  const ctx: ModuleContext = {
    botId: "bot-1",
    userId: "u-1",
    userRole: "parent",
    effectiveRole: "parent",
    children: opts?.children ?? [oliver],
    currentSurface: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: supabase as any,
  };
  return { ctx, state };
}

describe("agent-memory — write_memory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes an account-scoped memory", async () => {
    const { ctx, state } = makeCtx();
    const r = await agentMemoryModule.execute(
      "write_memory",
      { content: "User prefers short responses", scope: "account" },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].scope).toBe("account");
    expect(state.rows[0].child_client_id).toBeNull();
  });

  it("writes a child-scoped memory with child_client_id", async () => {
    const { ctx, state } = makeCtx();
    const r = await agentMemoryModule.execute(
      "write_memory",
      {
        content: "Oliver is allergic to peanuts",
        scope: "child",
        child_name: "Oliver",
      },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(state.rows[0].scope).toBe("child");
    expect(state.rows[0].child_client_id).toBe("c1");
  });

  it("child/shared scope rejects when no child_name can resolve", async () => {
    const { ctx } = makeCtx({ children: [] });
    const r = await agentMemoryModule.execute(
      "write_memory",
      { content: "x", scope: "shared" },
      ctx,
    );
    expect(r.success).toBe(false);
  });

  it("validates scope enum", async () => {
    const { ctx } = makeCtx();
    const r = await agentMemoryModule.execute(
      "write_memory",
      { content: "x", scope: "global" },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/scope/i);
  });

  it("requires non-empty content", async () => {
    const { ctx } = makeCtx();
    const r = await agentMemoryModule.execute(
      "write_memory",
      { content: "   ", scope: "account" },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/content/i);
  });

  it("accepts priority + tags + relevant_until", async () => {
    const { ctx, state } = makeCtx();
    const r = await agentMemoryModule.execute(
      "write_memory",
      {
        content: "sleep routine 7pm",
        scope: "account",
        priority: "high",
        tags: ["routine", "sleep"],
        relevant_until: "2027-01-01",
      },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(state.rows[0].priority).toBe("high");
    expect(state.rows[0].tags).toEqual(["routine", "sleep"]);
    expect(state.rows[0].relevant_until).toBe("2027-01-01");
  });
});

describe("agent-memory — read_memory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns active memories for this bot", async () => {
    const { ctx } = makeCtx({
      preload: [
        {
          id: "m-1",
          bloombot_id: "bot-1",
          child_client_id: null,
          scope: "account",
          priority: "high",
          tags: ["routine"],
          content: "User likes mornings",
          relevant_until: null,
          is_active: true,
          created_at: "2026-04-01T00:00:00Z",
          updated_at: "2026-04-01T00:00:00Z",
        },
        {
          id: "m-2",
          bloombot_id: "bot-1",
          child_client_id: null,
          scope: "account",
          priority: "medium",
          tags: [],
          content: "soft-deleted old note",
          relevant_until: null,
          is_active: false,
          created_at: "2026-03-01T00:00:00Z",
          updated_at: "2026-03-01T00:00:00Z",
        },
      ],
    });
    const r = await agentMemoryModule.execute("read_memory", {}, ctx);
    expect(r.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.count).toBe(1);
    expect(data.memories[0].id).toBe("m-1");
  });
});

describe("agent-memory — update_memory", () => {
  it("edits content + priority", async () => {
    const { ctx, state } = makeCtx({
      preload: [
        {
          id: "m-1",
          bloombot_id: "bot-1",
          child_client_id: null,
          scope: "account",
          priority: "medium",
          tags: [],
          content: "old",
          relevant_until: null,
          is_active: true,
          created_at: "2026-04-01T00:00:00Z",
          updated_at: "2026-04-01T00:00:00Z",
        },
      ],
    });
    const r = await agentMemoryModule.execute(
      "update_memory",
      { id: "m-1", content: "new", priority: "high" },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(state.rows[0].content).toBe("new");
    expect(state.rows[0].priority).toBe("high");
  });

  it("refuses when id is missing", async () => {
    const { ctx } = makeCtx();
    const r = await agentMemoryModule.execute("update_memory", {}, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/id/i);
  });
});

describe("agent-memory — delete_memory", () => {
  it("soft-deletes by setting is_active=false", async () => {
    const { ctx, state } = makeCtx({
      preload: [
        {
          id: "m-1",
          bloombot_id: "bot-1",
          child_client_id: null,
          scope: "account",
          priority: "medium",
          tags: [],
          content: "to be removed",
          relevant_until: null,
          is_active: true,
          created_at: "2026-04-01T00:00:00Z",
          updated_at: "2026-04-01T00:00:00Z",
        },
      ],
    });
    const r = await agentMemoryModule.execute(
      "delete_memory",
      { id: "m-1" },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(state.rows[0].is_active).toBe(false);
  });
});

describe("agent-memory — common", () => {
  it("returns error for unknown tool", async () => {
    const { ctx } = makeCtx();
    const r = await agentMemoryModule.execute("nope", {}, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Unknown tool/);
  });
});
