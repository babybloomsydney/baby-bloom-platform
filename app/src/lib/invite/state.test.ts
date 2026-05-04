/**
 * Pure state derivation for the public invite landing.
 *
 * The 7 states from `05-ui-surfaces.md §7` are derived from four inputs:
 *   - `previewError` (e.g. "invite_not_found")
 *   - `preview.status` ("pending" | "connected" | "revoked")
 *   - `preview.direction` ("nanny_to_parent" | "parent_to_nanny")
 *   - the caller's auth state (`currentUserId`, `currentUserRole`)
 *
 * Keeping the derivation pure (no React, no DOM) lets us cover every
 * branch with cheap unit tests and lets the rendered component become a
 * thin switch.
 */

import { describe, it, expect } from "vitest";
import { deriveInviteState } from "./state";
import type { ChildInvitePreview } from "@/types/bapp";

const pendingNannyToParent: ChildInvitePreview = {
  status: "pending",
  direction: "nanny_to_parent",
  childFirstName: "Oliver",
  inviterDisplay: "Sarah",
};

const pendingParentToNanny: ChildInvitePreview = {
  status: "pending",
  direction: "parent_to_nanny",
  childFirstName: "Mia",
  inviterDisplay: "Tom",
};

describe("deriveInviteState", () => {
  // ── Dead-end states (precede pending checks) ───────────────────────

  it("returns not_found when previewError is invite_not_found", () => {
    const state = deriveInviteState({
      preview: null,
      previewError: "invite_not_found",
      currentUserId: null,
      currentUserRole: null,
    });
    expect(state.kind).toBe("not_found");
  });

  it("returns not_found when preview is null and no specific error", () => {
    const state = deriveInviteState({
      preview: null,
      previewError: "transaction_failed",
      currentUserId: null,
      currentUserRole: null,
    });
    expect(state.kind).toBe("not_found");
  });

  it("returns already_connected when preview.status is connected", () => {
    const state = deriveInviteState({
      preview: { ...pendingNannyToParent, status: "connected" },
      previewError: null,
      currentUserId: null,
      currentUserRole: null,
    });
    expect(state.kind).toBe("already_connected");
  });

  it("returns revoked when preview.status is revoked", () => {
    const state = deriveInviteState({
      preview: { ...pendingNannyToParent, status: "revoked" },
      previewError: null,
      currentUserId: null,
      currentUserRole: null,
    });
    expect(state.kind).toBe("revoked");
  });

  // ── Anonymous (pending, no session) ────────────────────────────────

  it("returns anon_parent_target for anonymous user with nanny_to_parent invite", () => {
    const state = deriveInviteState({
      preview: pendingNannyToParent,
      previewError: null,
      currentUserId: null,
      currentUserRole: null,
    });
    expect(state.kind).toBe("anon_parent_target");
    expect(state.preview).toBe(pendingNannyToParent);
  });

  it("returns anon_nanny_target for anonymous user with parent_to_nanny invite", () => {
    const state = deriveInviteState({
      preview: pendingParentToNanny,
      previewError: null,
      currentUserId: null,
      currentUserRole: null,
    });
    expect(state.kind).toBe("anon_nanny_target");
  });

  // ── Authenticated, role match → connect screen ─────────────────────

  it("returns ready_to_connect when parent is signed in for nanny_to_parent invite", () => {
    const state = deriveInviteState({
      preview: pendingNannyToParent,
      previewError: null,
      currentUserId: "user-parent-1",
      currentUserRole: "parent",
    });
    expect(state.kind).toBe("ready_to_connect");
    expect(state.expectedRole).toBe("parent");
  });

  it("returns ready_to_connect when nanny is signed in for parent_to_nanny invite", () => {
    const state = deriveInviteState({
      preview: pendingParentToNanny,
      previewError: null,
      currentUserId: "user-nanny-1",
      currentUserRole: "nanny",
    });
    expect(state.kind).toBe("ready_to_connect");
    expect(state.expectedRole).toBe("nanny");
  });

  // ── Authenticated, role mismatch ───────────────────────────────────

  it("returns wrong_role when nanny opens nanny_to_parent invite", () => {
    const state = deriveInviteState({
      preview: pendingNannyToParent,
      previewError: null,
      currentUserId: "user-nanny-1",
      currentUserRole: "nanny",
    });
    expect(state.kind).toBe("wrong_role");
    expect(state.expectedRole).toBe("parent");
    expect(state.currentRole).toBe("nanny");
  });

  it("returns wrong_role when parent opens parent_to_nanny invite", () => {
    const state = deriveInviteState({
      preview: pendingParentToNanny,
      previewError: null,
      currentUserId: "user-parent-1",
      currentUserRole: "parent",
    });
    expect(state.kind).toBe("wrong_role");
    expect(state.expectedRole).toBe("nanny");
    expect(state.currentRole).toBe("parent");
  });

  it("returns wrong_role when admin opens any pending invite", () => {
    const state = deriveInviteState({
      preview: pendingNannyToParent,
      previewError: null,
      currentUserId: "user-admin-1",
      currentUserRole: "admin",
    });
    expect(state.kind).toBe("wrong_role");
  });

  // ── Precedence: dead-end states beat auth state ────────────────────

  it("returns already_connected even when caller is signed in as the right role", () => {
    const state = deriveInviteState({
      preview: { ...pendingNannyToParent, status: "connected" },
      previewError: null,
      currentUserId: "user-parent-1",
      currentUserRole: "parent",
    });
    expect(state.kind).toBe("already_connected");
  });

  it("returns not_found even when caller is signed in", () => {
    const state = deriveInviteState({
      preview: null,
      previewError: "invite_not_found",
      currentUserId: "user-parent-1",
      currentUserRole: "parent",
    });
    expect(state.kind).toBe("not_found");
  });
});
