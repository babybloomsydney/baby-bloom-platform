"use server";

// T-032 — Server actions for the Nanny Contact Management page.
//
// Every action calls requireAdmin() first, then uses createAdminClient()
// (service-role, bypasses RLS — the requireAdmin gate is the security boundary).
// Every action returns {success, error} envelope.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CONTACT_DIRECTIONS,
  CONTACT_METHODS,
  CONTACT_OUTCOMES,
  LEAD_STATUSES,
  type ActionResult,
  type ContactDirection,
  type ContactMethod,
  type ContactOutcome,
  type LeadStatus,
} from "@/lib/leads/types";

const LEADS_PATH = "/admin/leads";

// ── Input schemas ──

const uuidSchema = z.string().uuid();

const logContactSchema = z.object({
  nanny_user_id: uuidSchema,
  method: z.enum(
    CONTACT_METHODS as readonly [ContactMethod, ...ContactMethod[]],
  ),
  direction: z.enum(
    CONTACT_DIRECTIONS as readonly [ContactDirection, ...ContactDirection[]],
  ),
  outcome: z
    .enum(CONTACT_OUTCOMES as readonly [ContactOutcome, ...ContactOutcome[]])
    .optional()
    .nullable(),
  purpose: z.string().max(80).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  contacted_at: z.string().datetime().optional(),
});

export type LogContactInput = z.infer<typeof logContactSchema>;

const editLogEntrySchema = z.object({
  log_id: uuidSchema,
  outcome: z
    .enum(CONTACT_OUTCOMES as readonly [ContactOutcome, ...ContactOutcome[]])
    .optional()
    .nullable(),
  purpose: z.string().max(80).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

export type EditLogEntryInput = z.infer<typeof editLogEntrySchema>;

// ── Helper: derive a stable operator handle from the authenticated session ──

async function deriveOperatorHandle(userId: string): Promise<string> {
  const supa = createAdminClient();
  const { data: profile } = await supa
    .from("user_profiles")
    .select("first_name, last_name, email")
    .eq("user_id", userId)
    .maybeSingle<{
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }>();

  if (profile?.first_name) {
    const last = profile.last_name ? ` ${profile.last_name}` : "";
    return `${profile.first_name}${last}`.trim();
  }
  return profile?.email ?? userId;
}

function envelopeError<T = void>(
  action: string,
  error: unknown,
): ActionResult<T> {
  // Log the raw error server-side for forensics, but return a generic
  // user-facing message — never leak Postgrest text (constraint names,
  // column names, partial query fragments) to the browser even on an
  // admin-only surface.
  console.error(`[leads:${action}] failed:`, error);
  // Zod errors are safe to surface (input shape feedback).
  if (error instanceof Error && error.name === "ZodError") {
    return { success: false, error: "Invalid input. Please check the form." };
  }
  return {
    success: false,
    error: "Action failed. Check server logs for details.",
  };
}

// ── Actions ──

export async function logContact(
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const input = logContactSchema.parse(rawInput);
    const { userId } = await requireAdmin();
    const operator = await deriveOperatorHandle(userId);
    const supa = createAdminClient();

    const { data, error } = await supa
      .from("lead_contacts")
      .insert({
        nanny_user_id: input.nanny_user_id,
        method: input.method,
        direction: input.direction,
        outcome: input.outcome ?? null,
        purpose: input.purpose ?? null,
        note: input.note ?? null,
        operator_handle: operator,
        contacted_at: input.contacted_at ?? new Date().toISOString(),
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !data) {
      return envelopeError(
        "logContact",
        error ?? new Error("insert returned no row"),
      );
    }

    revalidatePath(LEADS_PATH);
    return { success: true, data: { id: data.id } };
  } catch (error: unknown) {
    return envelopeError("logContact", error);
  }
}

export async function editLogEntry(rawInput: unknown): Promise<ActionResult> {
  try {
    const input = editLogEntrySchema.parse(rawInput);
    const { userId } = await requireAdmin();
    const operator = await deriveOperatorHandle(userId);
    const supa = createAdminClient();

    const patch: Record<string, unknown> = { edited_by: operator };
    if (input.outcome !== undefined) patch.outcome = input.outcome;
    if (input.purpose !== undefined) patch.purpose = input.purpose;
    if (input.note !== undefined) patch.note = input.note;

    const { error } = await supa
      .from("lead_contacts")
      .update(patch)
      .eq("id", input.log_id);

    if (error) return envelopeError("editLogEntry", error);

    revalidatePath(LEADS_PATH);
    return { success: true, data: undefined };
  } catch (error: unknown) {
    return envelopeError("editLogEntry", error);
  }
}

/**
 * Upsert helper — ensures a nanny_contact_state row exists then sets the
 * given fields. Pattern shared by status / next-action / pin / offset /
 * override / assign actions.
 */
async function upsertContactState(
  nannyUserId: string,
  patch: Record<string, unknown>,
): Promise<ActionResult> {
  const supa = createAdminClient();
  const { error } = await supa
    .from("nanny_contact_state")
    .upsert(
      { nanny_user_id: nannyUserId, ...patch },
      { onConflict: "nanny_user_id" },
    );
  if (error) return envelopeError("upsertContactState", error);
  return { success: true, data: undefined };
}

const updateLeadStatusSchema = z.object({
  nanny_user_id: uuidSchema,
  status: z.enum(LEAD_STATUSES as readonly [LeadStatus, ...LeadStatus[]]),
});

export async function updateLeadStatus(
  rawInput: unknown,
): Promise<ActionResult> {
  try {
    const input = updateLeadStatusSchema.parse(rawInput);
    await requireAdmin();
    const result = await upsertContactState(input.nanny_user_id, {
      lead_status: input.status,
    });
    if (result.success) revalidatePath(LEADS_PATH);
    return result;
  } catch (error: unknown) {
    return envelopeError("updateLeadStatus", error);
  }
}

const setNextActionSchema = z.object({
  nanny_user_id: uuidSchema,
  next_action_at: z.string().datetime().nullable(),
});

export async function setNextAction(rawInput: unknown): Promise<ActionResult> {
  try {
    const input = setNextActionSchema.parse(rawInput);
    await requireAdmin();
    const result = await upsertContactState(input.nanny_user_id, {
      next_action_at: input.next_action_at,
    });
    if (result.success) revalidatePath(LEADS_PATH);
    return result;
  } catch (error: unknown) {
    return envelopeError("setNextAction", error);
  }
}

const pinNoteSchema = z.object({
  nanny_user_id: uuidSchema,
  pinned_note: z.string().max(500).nullable(),
});

export async function pinNote(rawInput: unknown): Promise<ActionResult> {
  try {
    const input = pinNoteSchema.parse(rawInput);
    await requireAdmin();
    const result = await upsertContactState(input.nanny_user_id, {
      pinned_note: input.pinned_note,
    });
    if (result.success) revalidatePath(LEADS_PATH);
    return result;
  } catch (error: unknown) {
    return envelopeError("pinNote", error);
  }
}

const updateContactsOffsetSchema = z.object({
  nanny_user_id: uuidSchema,
  offset: z.number().int().min(0).max(10000),
});

export async function updateContactsOffset(
  rawInput: unknown,
): Promise<ActionResult> {
  try {
    const input = updateContactsOffsetSchema.parse(rawInput);
    await requireAdmin();
    const result = await upsertContactState(input.nanny_user_id, {
      total_contacts_manual_offset: input.offset,
    });
    if (result.success) revalidatePath(LEADS_PATH);
    return result;
  } catch (error: unknown) {
    return envelopeError("updateContactsOffset", error);
  }
}

const overrideRespondedSchema = z.object({
  nanny_user_id: uuidSchema,
  value: z.boolean().nullable(),
});

export async function overrideResponded(
  rawInput: unknown,
): Promise<ActionResult> {
  try {
    const input = overrideRespondedSchema.parse(rawInput);
    await requireAdmin();
    const result = await upsertContactState(input.nanny_user_id, {
      responded_ever_override: input.value,
    });
    if (result.success) revalidatePath(LEADS_PATH);
    return result;
  } catch (error: unknown) {
    return envelopeError("overrideResponded", error);
  }
}

const assignOperatorSchema = z.object({
  nanny_user_id: uuidSchema,
  operator: z.string().max(80).nullable(),
});

export async function assignOperator(rawInput: unknown): Promise<ActionResult> {
  try {
    const input = assignOperatorSchema.parse(rawInput);
    await requireAdmin();
    const result = await upsertContactState(input.nanny_user_id, {
      assigned_operator: input.operator,
    });
    if (result.success) revalidatePath(LEADS_PATH);
    return result;
  } catch (error: unknown) {
    return envelopeError("assignOperator", error);
  }
}

const upsertNotesSchema = z.object({
  nanny_user_id: uuidSchema,
  body: z.string().max(20_000),
});

export async function upsertNotes(rawInput: unknown): Promise<ActionResult> {
  try {
    const input = upsertNotesSchema.parse(rawInput);
    const { userId } = await requireAdmin();
    const operator = await deriveOperatorHandle(userId);
    const supa = createAdminClient();

    const { error } = await supa.from("lead_notes").upsert(
      {
        nanny_user_id: input.nanny_user_id,
        body: input.body,
        last_edited_by: operator,
      },
      { onConflict: "nanny_user_id" },
    );

    if (error) return envelopeError("upsertNotes", error);
    revalidatePath(LEADS_PATH);
    return { success: true, data: undefined };
  } catch (error: unknown) {
    return envelopeError("upsertNotes", error);
  }
}

const bulkSnoozeSchema = z.object({
  nanny_user_ids: z.array(uuidSchema).min(1).max(500),
  next_action_at: z.string().datetime(),
});

export async function bulkSnooze(
  rawInput: unknown,
): Promise<ActionResult<{ updated: number }>> {
  try {
    const input = bulkSnoozeSchema.parse(rawInput);
    await requireAdmin();
    const supa = createAdminClient();

    // Upsert per-row so missing contact_state rows materialise.
    const rows = input.nanny_user_ids.map((id) => ({
      nanny_user_id: id,
      next_action_at: input.next_action_at,
    }));

    const { error, data } = await supa
      .from("nanny_contact_state")
      .upsert(rows, { onConflict: "nanny_user_id" })
      .select("nanny_user_id");

    if (error) return envelopeError("bulkSnooze", error);
    revalidatePath(LEADS_PATH);
    return { success: true, data: { updated: data?.length ?? 0 } };
  } catch (error: unknown) {
    return envelopeError("bulkSnooze", error);
  }
}

const bulkMoveToDormantSchema = z.object({
  nanny_user_ids: z.array(uuidSchema).min(1).max(500),
});

export async function bulkMoveToDormant(
  rawInput: unknown,
): Promise<ActionResult<{ updated: number }>> {
  try {
    const input = bulkMoveToDormantSchema.parse(rawInput);
    await requireAdmin();
    const supa = createAdminClient();

    const rows = input.nanny_user_ids.map((id) => ({
      nanny_user_id: id,
      lead_status: "dormant" as LeadStatus,
    }));

    const { error, data } = await supa
      .from("nanny_contact_state")
      .upsert(rows, { onConflict: "nanny_user_id" })
      .select("nanny_user_id");

    if (error) return envelopeError("bulkMoveToDormant", error);
    revalidatePath(LEADS_PATH);
    return { success: true, data: { updated: data?.length ?? 0 } };
  } catch (error: unknown) {
    return envelopeError("bulkMoveToDormant", error);
  }
}
