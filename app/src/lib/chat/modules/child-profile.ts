/**
 * `child-profile` module — reads a child's profile.
 *
 * Phase 1 read-only module. One tool: read_child_profile.
 */

import type { BloomBotModule, ToolResult } from "./types";
import { resolveChild } from "./utils";
import { isChildNameInPreloadProfiles } from "@/lib/chat/preload/predicates";

async function readChildProfile(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const r = resolveChild(args.child_name, ctx.children);
  if (r.error) return r.error;
  const child = r.child;

  const { data, error } = await ctx.supabase
    .from("child_client")
    .select(
      "id, first_name, gender, under_three, under_three_onboarded, status, created_at",
    )
    .eq("id", child.id)
    .maybeSingle();

  if (error || !data) {
    return {
      success: false,
      error: `Failed to read profile for ${child.firstName}`,
    };
  }

  return {
    success: true,
    data: {
      name: data.first_name,
      age_months: child.ageMonths,
      age_bracket: child.ageBracket,
      gender: data.gender,
      under_three: data.under_three,
      onboarded: data.under_three_onboarded,
      status: data.status,
      created_at: data.created_at,
    },
  };
}

export const childProfileModule: BloomBotModule = {
  id: "child-profile",
  name: "Child Profile",
  description:
    "Reads a child's profile (name, age, gender, status, onboarding state).",

  tools: [
    {
      name: "read_child_profile",
      description:
        "Get a child's profile including name, age, gender, and onboarding status. Use when you need context about a specific child.",
      parameters: {
        type: "object",
        properties: {
          child_name: {
            type: "string",
            description:
              "Which child (required if the user has multiple children; can omit if only one)",
          },
        },
        required: [],
      },
      isPrefulfilled: isChildNameInPreloadProfiles,
    },
  ],

  async execute(toolName, args, ctx) {
    if (toolName === "read_child_profile") return readChildProfile(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "You can read a child's profile via `read_child_profile`. Use it before giving advice or logging to ensure you have the right context.",
};
