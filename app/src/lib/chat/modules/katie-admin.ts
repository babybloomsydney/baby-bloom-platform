/**
 * `katie-admin` module — admin-only introspection + editing tools.
 *
 * rolesAllowed: ['admin']. Exposes read-only inspection of Katie's own
 * configuration (prompt sections, modules, tool surface). Proposal +
 * apply tools for prompt edits land in a follow-up WU; this commit
 * ships the inspection surface first so admin users can see what they're
 * about to change.
 */

import type { BloomBotModule, ToolResult } from "./types";

// Lazy import to avoid the cycle: katie-admin is in the registry, and
// these handlers need to inspect the registry.
async function getActiveModulesLazy(): Promise<BloomBotModule[]> {
  const { getActiveModules } = await import("./registry");
  return getActiveModules();
}

interface PromptSectionRow {
  section: string;
  content: string;
  version: number;
  protected: boolean;
  is_active?: boolean;
  updated_at?: string | null;
}

async function readAllPromptSections(
  _args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const { data, error } = await ctx.supabase
    .from("katie_prompt")
    .select("section, content, version, protected, updated_at")
    .eq("is_active", true)
    .order("section", { ascending: true })
    .limit(200);

  if (error) {
    return {
      success: false,
      error: `Failed to list sections: ${error.message}`,
    };
  }

  const rows = (data ?? []) as PromptSectionRow[];
  return {
    success: true,
    data: {
      count: rows.length,
      sections: rows.map((r) => ({
        section: r.section,
        version: r.version,
        protected: r.protected,
        chars: r.content?.length ?? 0,
        updated_at: r.updated_at ?? null,
      })),
    },
  };
}

async function readPromptSection(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const section =
    typeof args.section === "string" && args.section.trim().length > 0
      ? args.section.trim()
      : null;
  if (!section) {
    return {
      success: false,
      error: "read_prompt_section needs a `section` name (e.g. 'identity').",
    };
  }

  const { data, error } = await ctx.supabase
    .from("katie_prompt")
    .select("section, content, version, protected, updated_at")
    .eq("section", section)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return {
      success: false,
      error: `Failed to read section: ${error.message}`,
    };
  }
  if (!data) {
    return {
      success: false,
      error: `Section not found: ${section}. Use read_all_prompt_sections for the full list.`,
    };
  }

  const row = data as PromptSectionRow;
  return {
    success: true,
    data: {
      section: row.section,
      content: row.content,
      version: row.version,
      protected: row.protected,
      chars: row.content.length,
      updated_at: row.updated_at ?? null,
    },
  };
}

async function readModuleRegistry(
  _args: Record<string, unknown>,
  _ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const modules = await getActiveModulesLazy();
  return {
    success: true,
    data: {
      count: modules.length,
      modules: modules.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        tool_count: m.tools.length,
        tool_names: m.tools.map((t) => t.name),
        roles_allowed: m.rolesAllowed ?? null,
        has_prompt_fragment: Boolean(m.systemPromptFragment),
      })),
    },
  };
}

async function readModuleDefinition(
  args: Record<string, unknown>,
  _ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const moduleId =
    typeof args.module_id === "string" && args.module_id.trim().length > 0
      ? args.module_id.trim()
      : null;
  if (!moduleId) {
    return {
      success: false,
      error: "read_module_definition needs `module_id`.",
    };
  }
  const modules = await getActiveModulesLazy();
  const mod = modules.find((m) => m.id === moduleId);
  if (!mod) {
    return {
      success: false,
      error: `Unknown module_id: ${moduleId}. Use read_module_registry for the full list.`,
    };
  }

  return {
    success: true,
    data: {
      id: mod.id,
      name: mod.name,
      description: mod.description,
      roles_allowed: mod.rolesAllowed ?? null,
      system_prompt_fragment: mod.systemPromptFragment ?? null,
      tools: mod.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
      proactive_trigger_count: mod.proactiveTriggers?.length ?? 0,
    },
  };
}

async function readToolSurface(
  _args: Record<string, unknown>,
  _ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const modules = await getActiveModulesLazy();
  const tools: Array<{
    name: string;
    module_id: string;
    description: string;
  }> = [];
  for (const m of modules) {
    for (const t of m.tools) {
      tools.push({
        name: t.name,
        module_id: m.id,
        description: t.description,
      });
    }
  }
  tools.sort((a, b) => a.name.localeCompare(b.name));
  return {
    success: true,
    data: { count: tools.length, tools },
  };
}

export const katieAdminModule: BloomBotModule = {
  id: "katie-admin",
  name: "Katie Admin (inspection)",
  description:
    "Admin-only inspection of Katie's own configuration: current prompt sections, registered modules, tool surface. Editing tools land in a follow-up sprint — use this set to see what's live before proposing changes.",

  rolesAllowed: ["admin"],

  tools: [
    {
      name: "read_all_prompt_sections",
      description:
        "List every active prompt section with metadata (version, protected flag, size, last updated). Use this before read_prompt_section so you know what's available.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "read_prompt_section",
      description:
        "Return the full content of a named prompt section as currently deployed.",
      parameters: {
        type: "object",
        properties: {
          section: {
            type: "string",
            description:
              "Section id (e.g. 'identity', 'voice', 'boundaries', 'role_nanny', 'module.feed').",
          },
        },
        required: ["section"],
      },
    },
    {
      name: "read_module_registry",
      description:
        "List every module Katie currently has loaded, with tool counts and role scoping.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "read_module_definition",
      description:
        "Return full details for one module — description, tools with parameters, rolesAllowed, systemPromptFragment.",
      parameters: {
        type: "object",
        properties: {
          module_id: {
            type: "string",
            description:
              "Module id (e.g. 'child-profile', 'progress', 'agent-memory').",
          },
        },
        required: ["module_id"],
      },
    },
    {
      name: "read_tool_surface",
      description:
        "Return every tool exposed to Gemini right now, sorted by name, each tagged with its owning module id.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  ],

  async execute(toolName, args, ctx) {
    if (toolName === "read_all_prompt_sections")
      return readAllPromptSections(args, ctx);
    if (toolName === "read_prompt_section") return readPromptSection(args, ctx);
    if (toolName === "read_module_registry")
      return readModuleRegistry(args, ctx);
    if (toolName === "read_module_definition")
      return readModuleDefinition(args, ctx);
    if (toolName === "read_tool_surface") return readToolSurface(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "You're in admin mode. When the operator asks about your own behaviour, inspect before guessing: `read_all_prompt_sections` for the index, `read_prompt_section` for a specific section, `read_module_registry` / `read_module_definition` / `read_tool_surface` for modules and tools. Quote exact versions and literal content back — precision matters when the operator is about to change something.",
};
