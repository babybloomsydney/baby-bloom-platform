/**
 * Gemini model selector — picks the right model per bot role.
 * See system/APP/BLOOMBOT/ADMIN-KATIE.md for rationale on Pro for admin.
 */

export type BotRole = "nanny" | "parent" | "admin";

export const GEMINI_MODELS = {
  flash: "gemini-3-flash-preview",
  pro: "gemini-3-pro-preview",
} as const;

export type GeminiModelId = (typeof GEMINI_MODELS)[keyof typeof GEMINI_MODELS];

/**
 * Returns the Gemini model ID for a given bot role.
 * - admin  → Pro (higher reasoning for prompt editing + inspection)
 * - others → Flash (user-facing, cost-sensitive)
 */
export function selectGeminiModel(role: BotRole): GeminiModelId {
  return role === "admin" ? GEMINI_MODELS.pro : GEMINI_MODELS.flash;
}

/**
 * Effective-role resolution (Option C from ADMIN-KATIE.md).
 * Admins can set `effective_role` in bloombot.settings to simulate another
 * role in conversation while keeping admin-only tools available.
 *
 * Non-admins cannot set effective_role; it's ignored for safety.
 */
export function resolveEffectiveRole(
  actualRole: BotRole,
  effectiveRoleSetting?: string | null,
): BotRole {
  if (actualRole !== "admin") return actualRole;
  if (!effectiveRoleSetting) return actualRole;
  if (effectiveRoleSetting === "nanny" || effectiveRoleSetting === "parent") {
    return effectiveRoleSetting;
  }
  return actualRole;
}
