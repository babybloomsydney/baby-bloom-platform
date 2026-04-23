import { describe, it, expect, beforeEach, vi } from "vitest";
import { katieAdminModule } from "./katie-admin";
import type { ModuleContext } from "./types";

function makeCtx(opts?: {
  sections?: Array<{
    section: string;
    content: string;
    version: number;
    protected: boolean;
    is_active?: boolean;
  }>;
  role?: "admin" | "nanny" | "parent";
}): ModuleContext {
  // Default every fixture row to is_active=true to match production behaviour.
  const sections = (opts?.sections ?? []).map((r) => ({
    is_active: true,
    ...r,
  }));

  const builder = () => {
    const filters: Array<(r: (typeof sections)[number]) => boolean> = [];
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters.push((r) => (r as Record<string, unknown>)[col] === val);
        return api;
      },
      order: () => api,
      limit: async () => ({
        data: sections.filter((r) => filters.every((f) => f(r))),
        error: null,
      }),
      maybeSingle: async () => ({
        data: sections.find((r) => filters.every((f) => f(r))) ?? null,
        error: null,
      }),
    };
    return api;
  };

  const supabase = { from: vi.fn(() => builder()) };

  return {
    botId: "bot-1",
    userId: "u-1",
    userRole: "admin",
    effectiveRole: opts?.role ?? "admin",
    children: [],
    currentSurface: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: supabase as any,
  };
}

describe("katie-admin — rolesAllowed", () => {
  it("only lists for admin role", () => {
    expect(katieAdminModule.rolesAllowed).toEqual(["admin"]);
  });
});

describe("katie-admin — read_all_prompt_sections", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns section metadata without full content", async () => {
    const ctx = makeCtx({
      sections: [
        {
          section: "identity",
          content: "You are Katie…",
          version: 3,
          protected: true,
        },
        {
          section: "voice",
          content: "Be concise.",
          version: 1,
          protected: false,
        },
      ],
    });
    const r = await katieAdminModule.execute(
      "read_all_prompt_sections",
      {},
      ctx,
    );
    expect(r.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.count).toBe(2);
    expect(data.sections[0].section).toBeDefined();
    expect(data.sections[0].chars).toBeGreaterThan(0);
    // Should not include full content in the list view.
    expect(data.sections[0].content).toBeUndefined();
  });
});

describe("katie-admin — read_prompt_section", () => {
  it("returns full content for one section", async () => {
    const ctx = makeCtx({
      sections: [
        {
          section: "identity",
          content: "You are Katie.",
          version: 2,
          protected: true,
        },
      ],
    });
    const r = await katieAdminModule.execute(
      "read_prompt_section",
      { section: "identity" },
      ctx,
    );
    expect(r.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.section).toBe("identity");
    expect(data.content).toBe("You are Katie.");
    expect(data.version).toBe(2);
    expect(data.protected).toBe(true);
  });

  it("rejects when section arg is missing", async () => {
    const ctx = makeCtx();
    const r = await katieAdminModule.execute("read_prompt_section", {}, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/section/i);
  });

  it("returns not-found when section doesn't exist", async () => {
    const ctx = makeCtx({ sections: [] });
    const r = await katieAdminModule.execute(
      "read_prompt_section",
      { section: "nonexistent" },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not found/i);
  });
});

describe("katie-admin — read_module_registry", () => {
  it("returns module metadata including tool counts", async () => {
    const ctx = makeCtx();
    const r = await katieAdminModule.execute("read_module_registry", {}, ctx);
    expect(r.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.count).toBeGreaterThan(0);
    const m = data.modules.find(
      (m: { id: string }) => m.id === "child-profile",
    );
    expect(m).toBeDefined();
    expect(m.tool_count).toBe(1);
  });
});

describe("katie-admin — read_module_definition", () => {
  it("returns full tool list for a module", async () => {
    const ctx = makeCtx();
    const r = await katieAdminModule.execute(
      "read_module_definition",
      { module_id: "progress" },
      ctx,
    );
    expect(r.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.id).toBe("progress");
    expect(data.tools.length).toBeGreaterThan(0);
    const toolNames = data.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain("read_milestones");
  });

  it("rejects unknown module_id", async () => {
    const ctx = makeCtx();
    const r = await katieAdminModule.execute(
      "read_module_definition",
      { module_id: "does-not-exist" },
      ctx,
    );
    expect(r.success).toBe(false);
  });
});

describe("katie-admin — read_tool_surface", () => {
  it("returns every tool with its owning module", async () => {
    const ctx = makeCtx();
    const r = await katieAdminModule.execute("read_tool_surface", {}, ctx);
    expect(r.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.count).toBeGreaterThan(10); // we have 25+
    const t = data.tools.find(
      (t: { name: string }) => t.name === "read_milestones",
    );
    expect(t.module_id).toBe("progress");
  });
});

// ── Edit flow (propose / apply / rollback) ─────────────────────────────────

interface EditFlowState {
  promptRows: Array<{
    section: string;
    content: string;
    version: number;
    protected: boolean;
    is_active: boolean;
  }>;
  editRows: Array<Record<string, unknown>>;
}

function makeEditFlowCtx(init?: {
  promptRows?: EditFlowState["promptRows"];
  recentEdits?: number;
}): { ctx: ModuleContext; state: EditFlowState } {
  const state: EditFlowState = {
    promptRows: init?.promptRows ? init.promptRows.map((r) => ({ ...r })) : [],
    editRows: [],
  };
  if (init?.recentEdits) {
    const now = Date.now();
    for (let i = 0; i < init.recentEdits; i++) {
      state.editRows.push({
        id: `hist-${i}`,
        applied_by: "u-admin",
        applied_at: new Date(now - i * 1000).toISOString(),
      });
    }
  }

  function promptBuilder() {
    const filters: Array<(r: EditFlowState["promptRows"][number]) => boolean> =
      [];
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters.push((r) => (r as Record<string, unknown>)[col] === val);
        return api;
      },
      order: () => api,
      limit: async () => ({
        data: state.promptRows.filter((r) => filters.every((f) => f(r))),
        error: null,
      }),
      maybeSingle: async () => ({
        data: state.promptRows.find((r) => filters.every((f) => f(r))) ?? null,
        error: null,
      }),
      insert: async (row: Record<string, unknown>) => {
        state.promptRows.push({
          section: String(row.section),
          content: String(row.content),
          version: Number(row.version),
          protected: Boolean(row.protected),
          is_active: Boolean(row.is_active ?? true),
        });
        return { data: null, error: null };
      },
      update: (patch: Record<string, unknown>) => {
        const uapi: Record<string, unknown> = {
          eq: (col: string, val: unknown) => {
            filters.push((r) => (r as Record<string, unknown>)[col] === val);
            return uapi;
          },
          async then(resolve: (v: unknown) => void) {
            const matches = state.promptRows.filter((r) =>
              filters.every((f) => f(r)),
            );
            for (const m of matches) Object.assign(m, patch);
            resolve({ data: null, error: null });
          },
        };
        return uapi;
      },
    };
    return api;
  }

  function editsBuilder() {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return api;
      },
      gte: (col: string, val: unknown) => {
        filters.push((r) => (r[col] as string) >= (val as string));
        return api;
      },
      order: () => api,
      limit: async () => ({
        data: state.editRows.filter((r) => filters.every((f) => f(r))),
        error: null,
      }),
      maybeSingle: async () => ({
        data: state.editRows.find((r) => filters.every((f) => f(r))) ?? null,
        error: null,
      }),
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            const inserted = {
              ...row,
              id: `edit-${state.editRows.length + 1}`,
              applied_at: new Date().toISOString(),
            };
            state.editRows.push(inserted);
            return { data: inserted, error: null };
          },
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        const uapi: Record<string, unknown> = {
          eq: (col: string, val: unknown) => {
            filters.push((r) => r[col] === val);
            return uapi;
          },
          async then(resolve: (v: unknown) => void) {
            const matches = state.editRows.filter((r) =>
              filters.every((f) => f(r)),
            );
            for (const m of matches) Object.assign(m, patch);
            resolve({ data: null, error: null });
          },
        };
        return uapi;
      },
    };
    return api;
  }

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "katie_prompt") return promptBuilder();
      if (table === "katie_prompt_edits") return editsBuilder();
      throw new Error(`unexpected table: ${table}`);
    }),
  };

  const ctx: ModuleContext = {
    botId: "bot-admin",
    userId: "u-admin",
    userRole: "admin",
    effectiveRole: "admin",
    children: [],
    currentSurface: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: supabase as any,
  };
  return { ctx, state };
}

describe("katie-admin — propose_prompt_edit", () => {
  it("returns a diff without writing anything", async () => {
    const { ctx, state } = makeEditFlowCtx({
      promptRows: [
        {
          section: "voice",
          content: "Be concise.",
          version: 1,
          protected: false,
          is_active: true,
        },
      ],
    });
    const r = await katieAdminModule.execute(
      "propose_prompt_edit",
      { section: "voice", new_content: "Be concise and direct." },
      ctx,
    );
    expect(r.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.current_version).toBe(1);
    expect(data.noop).toBe(false);
    expect(data.diff.added).toBeGreaterThanOrEqual(1);
    // Not written:
    expect(state.promptRows).toHaveLength(1);
    expect(state.editRows).toHaveLength(0);
  });

  it("flags noop when new_content matches current", async () => {
    const { ctx } = makeEditFlowCtx({
      promptRows: [
        {
          section: "voice",
          content: "Be concise.",
          version: 1,
          protected: false,
          is_active: true,
        },
      ],
    });
    const r = await katieAdminModule.execute(
      "propose_prompt_edit",
      { section: "voice", new_content: "Be concise." },
      ctx,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.noop).toBe(true);
  });
});

describe("katie-admin — apply_prompt_edit", () => {
  it("writes a new version, deactivates the old, and audits", async () => {
    const { ctx, state } = makeEditFlowCtx({
      promptRows: [
        {
          section: "voice",
          content: "old",
          version: 1,
          protected: false,
          is_active: true,
        },
      ],
    });
    const r = await katieAdminModule.execute(
      "apply_prompt_edit",
      { section: "voice", new_content: "new", reason: "cleanup" },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(state.promptRows).toHaveLength(2);
    const active = state.promptRows.find((r) => r.is_active);
    expect(active?.content).toBe("new");
    expect(active?.version).toBe(2);
    const inactive = state.promptRows.find((r) => !r.is_active);
    expect(inactive?.content).toBe("old");
    expect(state.editRows).toHaveLength(1);
    expect(state.editRows[0].status).toBe("applied");
  });

  it("requires confirm_protected=true for protected sections", async () => {
    const { ctx } = makeEditFlowCtx({
      promptRows: [
        {
          section: "identity",
          content: "old",
          version: 1,
          protected: true,
          is_active: true,
        },
      ],
    });
    const r = await katieAdminModule.execute(
      "apply_prompt_edit",
      { section: "identity", new_content: "new", reason: "x" },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/protected/i);
  });

  it("succeeds on protected when confirm_protected=true", async () => {
    const { ctx } = makeEditFlowCtx({
      promptRows: [
        {
          section: "identity",
          content: "old",
          version: 1,
          protected: true,
          is_active: true,
        },
      ],
    });
    const r = await katieAdminModule.execute(
      "apply_prompt_edit",
      {
        section: "identity",
        new_content: "new",
        reason: "x",
        confirm_protected: true,
      },
      ctx,
    );
    expect(r.success).toBe(true);
  });

  it("rejects when rate limit reached", async () => {
    const { ctx } = makeEditFlowCtx({
      promptRows: [
        {
          section: "voice",
          content: "old",
          version: 1,
          protected: false,
          is_active: true,
        },
      ],
      recentEdits: 20,
    });
    const r = await katieAdminModule.execute(
      "apply_prompt_edit",
      { section: "voice", new_content: "new", reason: "x" },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/rate limit/i);
  });

  it("rejects when new_content equals current (no-op)", async () => {
    const { ctx } = makeEditFlowCtx({
      promptRows: [
        {
          section: "voice",
          content: "same",
          version: 1,
          protected: false,
          is_active: true,
        },
      ],
    });
    const r = await katieAdminModule.execute(
      "apply_prompt_edit",
      { section: "voice", new_content: "same", reason: "x" },
      ctx,
    );
    expect(r.success).toBe(false);
  });
});

describe("katie-admin — rollback_prompt_edit", () => {
  it("restores before_content and links the rollback edit", async () => {
    const { ctx, state } = makeEditFlowCtx({
      promptRows: [
        {
          section: "voice",
          content: "v1",
          version: 1,
          protected: false,
          is_active: false,
        },
        {
          section: "voice",
          content: "v2",
          version: 2,
          protected: false,
          is_active: true,
        },
      ],
    });
    // Seed an applied edit from v1 -> v2.
    state.editRows.push({
      id: "edit-orig",
      section: "voice",
      before_content: "v1",
      before_version: 1,
      after_version: 2,
      status: "applied",
      applied_by: "u-admin",
      applied_at: new Date(Date.now() - 10000).toISOString(),
    });

    const r = await katieAdminModule.execute(
      "rollback_prompt_edit",
      { edit_id: "edit-orig", reason: "undo" },
      ctx,
    );
    expect(r.success).toBe(true);
    const active = state.promptRows.find((r) => r.is_active);
    expect(active?.content).toBe("v1");
    expect(active?.version).toBe(3);
    const orig = state.editRows.find((r) => r.id === "edit-orig") as
      | Record<string, unknown>
      | undefined;
    expect(orig?.status).toBe("rolled_back");
    expect(orig?.rolled_back_by_edit_id).toBeDefined();
  });

  it("refuses to roll back an already-rolled-back edit", async () => {
    const { ctx, state } = makeEditFlowCtx({
      promptRows: [
        {
          section: "voice",
          content: "v1",
          version: 1,
          protected: false,
          is_active: true,
        },
      ],
    });
    state.editRows.push({
      id: "edit-dead",
      section: "voice",
      before_content: "v0",
      before_version: 0,
      after_version: 1,
      status: "rolled_back",
      applied_by: "u-admin",
      applied_at: new Date().toISOString(),
    });
    const r = await katieAdminModule.execute(
      "rollback_prompt_edit",
      { edit_id: "edit-dead", reason: "x" },
      ctx,
    );
    expect(r.success).toBe(false);
  });
});

// ── Proposals ─────────────────────────────────────────────────────────────

function makeProposalsCtx(): {
  ctx: ModuleContext;
  proposals: Record<string, unknown>[];
} {
  const proposals: Record<string, unknown>[] = [];

  function builder() {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return api;
      },
      order: () => api,
      limit: async () => ({
        data: proposals.filter((r) => filters.every((f) => f(r))),
        error: null,
      }),
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            const inserted = {
              id: `p-${proposals.length + 1}`,
              ...row,
              created_at: new Date().toISOString(),
            };
            proposals.push(inserted);
            return { data: inserted, error: null };
          },
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        const uapi: Record<string, unknown> = {
          eq: (col: string, val: unknown) => {
            filters.push((r) => r[col] === val);
            return uapi;
          },
          select: () => ({
            single: async () => {
              const match = proposals.find((r) => filters.every((f) => f(r)));
              if (!match)
                return { data: null, error: { message: "not found" } };
              Object.assign(match, patch);
              return { data: match, error: null };
            },
          }),
        };
        return uapi;
      },
    };
    return api;
  }

  const ctx: ModuleContext = {
    botId: "bot-admin",
    userId: "u-admin",
    userRole: "admin",
    effectiveRole: "admin",
    children: [],
    currentSurface: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: { from: vi.fn(() => builder()) } as any,
  };
  return { ctx, proposals };
}

describe("katie-admin — propose_module_change", () => {
  it("files a module_change proposal for a known module", async () => {
    const { ctx, proposals } = makeProposalsCtx();
    const r = await katieAdminModule.execute(
      "propose_module_change",
      {
        module_id: "progress",
        summary: "Add `read_progress_window` tool for date-range queries",
        details: "Current read_progress_history doesn't support…",
      },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].kind).toBe("module_change");
    expect(proposals[0].target).toBe("module:progress");
    expect(proposals[0].status).toBe("open");
  });

  it("refuses for unknown module_id", async () => {
    const { ctx } = makeProposalsCtx();
    const r = await katieAdminModule.execute(
      "propose_module_change",
      { module_id: "not-a-module", summary: "x" },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/unknown/i);
  });

  it("requires summary", async () => {
    const { ctx } = makeProposalsCtx();
    const r = await katieAdminModule.execute(
      "propose_module_change",
      { module_id: "progress", summary: "" },
      ctx,
    );
    expect(r.success).toBe(false);
  });
});

describe("katie-admin — propose_schema_change", () => {
  it("files a schema_change proposal", async () => {
    const { ctx, proposals } = makeProposalsCtx();
    const r = await katieAdminModule.execute(
      "propose_schema_change",
      {
        table: "bapp_logs",
        summary: "Add indexed deleted_at column",
        suggested_diff:
          "ALTER TABLE bapp_logs ADD COLUMN deleted_at TIMESTAMPTZ;",
      },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(proposals[0].target).toBe("table:bapp_logs");
    expect(proposals[0].kind).toBe("schema_change");
  });
});

describe("katie-admin — read_proposals", () => {
  it("returns filtered list with condensed payload", async () => {
    const { ctx, proposals } = makeProposalsCtx();
    proposals.push(
      {
        id: "p-1",
        kind: "module_change",
        target: "module:progress",
        summary: "A",
        details: "xx",
        suggested_diff: null,
        status: "open",
        reviewer_notes: null,
        reviewed_by: null,
        reviewed_at: null,
        created_at: "2026-04-23T00:00:00Z",
      },
      {
        id: "p-2",
        kind: "schema_change",
        target: "table:bapp_logs",
        summary: "B",
        details: null,
        suggested_diff: null,
        status: "accepted",
        reviewer_notes: "lgtm",
        reviewed_by: "u-admin",
        reviewed_at: "2026-04-24T00:00:00Z",
        created_at: "2026-04-22T00:00:00Z",
      },
    );
    const r = await katieAdminModule.execute(
      "read_proposals",
      { status: "open" },
      ctx,
    );
    expect(r.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.count).toBe(1);
    expect(data.proposals[0].id).toBe("p-1");
    expect(data.proposals[0].has_details).toBe(true);
    // details + suggested_diff omitted from list view
    expect(data.proposals[0].details).toBeUndefined();
  });
});

describe("katie-admin — update_proposal_status", () => {
  it("marks a proposal accepted", async () => {
    const { ctx, proposals } = makeProposalsCtx();
    proposals.push({
      id: "p-1",
      kind: "module_change",
      target: "module:progress",
      summary: "A",
      status: "open",
    });
    const r = await katieAdminModule.execute(
      "update_proposal_status",
      { id: "p-1", status: "accepted", reviewer_notes: "ship it" },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(proposals[0].status).toBe("accepted");
    expect(proposals[0].reviewer_notes).toBe("ship it");
  });

  it("refuses invalid status", async () => {
    const { ctx } = makeProposalsCtx();
    const r = await katieAdminModule.execute(
      "update_proposal_status",
      { id: "p-1", status: "half-done" },
      ctx,
    );
    expect(r.success).toBe(false);
  });
});
