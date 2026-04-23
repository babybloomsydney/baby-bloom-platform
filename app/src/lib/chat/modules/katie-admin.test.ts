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
