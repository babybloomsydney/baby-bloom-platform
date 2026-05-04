/**
 * Pure state derivation for the public invite landing.
 * See `state.test.ts` for the spec; see `05-ui-surfaces.md §7` for the
 * mapping to rendered hero copy.
 */

import type { ChildInvitePreview, ChildInviteDirection } from "@/types/bapp";
import type { UserRole } from "@/lib/auth/types";

export interface DeriveInviteStateInput {
  preview: ChildInvitePreview | null;
  previewError: string | null;
  currentUserId: string | null;
  currentUserRole: UserRole | null;
}

export type InviteState =
  | { kind: "not_found" }
  | { kind: "revoked"; preview: ChildInvitePreview }
  | { kind: "already_connected"; preview: ChildInvitePreview }
  | { kind: "anon_parent_target"; preview: ChildInvitePreview }
  | { kind: "anon_nanny_target"; preview: ChildInvitePreview }
  | {
      kind: "ready_to_connect";
      preview: ChildInvitePreview;
      expectedRole: UserRole;
    }
  | {
      kind: "wrong_role";
      preview: ChildInvitePreview;
      expectedRole: UserRole;
      currentRole: UserRole | null;
    };

/**
 * The recipient role implied by an invite's direction. nanny→parent
 * means a nanny created it for a parent, so the recipient is `parent`.
 */
function recipientRoleFor(direction: ChildInviteDirection): UserRole {
  return direction === "nanny_to_parent" ? "parent" : "nanny";
}

export function deriveInviteState(input: DeriveInviteStateInput): InviteState {
  const { preview, previewError, currentUserId, currentUserRole } = input;

  // Dead-end states (precede auth) — the invite either doesn't exist or
  // is no longer claimable, regardless of who's looking.
  if (previewError === "invite_not_found" || preview === null) {
    return { kind: "not_found" };
  }
  if (preview.status === "revoked") {
    return { kind: "revoked", preview };
  }
  if (preview.status === "connected") {
    return { kind: "already_connected", preview };
  }

  // From here: preview.status === "pending"
  const expectedRole = recipientRoleFor(preview.direction);

  if (currentUserId === null) {
    return preview.direction === "nanny_to_parent"
      ? { kind: "anon_parent_target", preview }
      : { kind: "anon_nanny_target", preview };
  }

  if (currentUserRole !== expectedRole) {
    return {
      kind: "wrong_role",
      preview,
      expectedRole,
      currentRole: currentUserRole,
    };
  }

  return { kind: "ready_to_connect", preview, expectedRole };
}
