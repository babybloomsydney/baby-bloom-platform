/**
 * Renders the InviteLandingClient through every state from
 * `05-ui-surfaces.md §7` and asserts on the user-visible content (hero,
 * primary CTA presence, key copy fragments). Backed by `deriveInviteState`
 * which is independently tested in `src/lib/invite/state.test.ts`.
 *
 * Server-action calls (connectChildInvite / declineChildInvite) are
 * mocked at the module boundary; their behaviour is covered separately
 * in `src/lib/actions/bapp/child-invites.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ChildInvitePreview } from "@/types/bapp";

// ── Hoisted mock state ────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  pushCalls: [] as string[],
  connectResult: {
    success: true,
    error: null as string | null,
    data: { childId: "child-123" } as { childId: string } | null,
  },
  declineResult: { success: true, error: null as string | null },
}));

beforeEach(() => {
  state.pushCalls = [];
  state.connectResult = {
    success: true,
    error: null,
    data: { childId: "child-123" },
  };
  state.declineResult = { success: true, error: null };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (url: string) => {
      state.pushCalls.push(url);
    },
  }),
}));

vi.mock("@/lib/actions/bapp/child-invites", () => ({
  connectChildInvite: vi.fn(async () => state.connectResult),
  declineChildInvite: vi.fn(async () => state.declineResult),
}));

import { InviteLandingClient } from "./InviteLandingClient";

const TOKEN = "ABCD-2345";

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

// ── Anonymous states ─────────────────────────────────────────────────

describe("InviteLandingClient — anonymous", () => {
  it("renders parent-targeted hero for nanny→parent invite", () => {
    render(
      <InviteLandingClient
        token={TOKEN}
        preview={pendingNannyToParent}
        previewError={null}
        currentUserId={null}
        currentUserRole={null}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Sarah invited you to follow Oliver/i,
    );
    // Both auth pathways visible.
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute(
      "href",
      expect.stringContaining(`invite=${TOKEN}`),
    );
    expect(
      screen.getByRole("link", { name: /create account/i }),
    ).toHaveAttribute("href", expect.stringContaining(`invite=${TOKEN}`));
  });

  it("renders nanny-targeted hero for parent→nanny invite", () => {
    render(
      <InviteLandingClient
        token={TOKEN}
        preview={pendingParentToNanny}
        previewError={null}
        currentUserId={null}
        currentUserRole={null}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Tom invited you to connect with Mia/i,
    );
  });
});

// ── Dead-end states ──────────────────────────────────────────────────

describe("InviteLandingClient — dead-end states", () => {
  it("renders not_found state with sign-up CTA", () => {
    render(
      <InviteLandingClient
        token={TOKEN}
        preview={null}
        previewError="invite_not_found"
        currentUserId={null}
        currentUserRole={null}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Invite not found/i,
    );
    expect(
      screen.getByRole("link", { name: /sign up to add a child/i }),
    ).toHaveAttribute("href", "/signup/parent");
  });

  it("renders revoked state", () => {
    render(
      <InviteLandingClient
        token={TOKEN}
        preview={{ ...pendingNannyToParent, status: "revoked" }}
        previewError={null}
        currentUserId={null}
        currentUserRole={null}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /no longer active/i,
    );
  });

  it("renders already_connected state", () => {
    render(
      <InviteLandingClient
        token={TOKEN}
        preview={{ ...pendingNannyToParent, status: "connected" }}
        previewError={null}
        currentUserId={null}
        currentUserRole={null}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /expired/i,
    );
    expect(screen.getByText(/already been connected/i)).toBeInTheDocument();
  });
});

// ── Wrong-role state ─────────────────────────────────────────────────

describe("InviteLandingClient — wrong role", () => {
  it("tells a signed-in nanny that the invite is for a parent", () => {
    render(
      <InviteLandingClient
        token={TOKEN}
        preview={pendingNannyToParent}
        previewError={null}
        currentUserId="user-nanny-1"
        currentUserRole="nanny"
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /This invite is for a parent/i,
    );
    expect(screen.getByText(/signed in as a nanny/i)).toBeInTheDocument();
  });
});

// ── Connect flow ─────────────────────────────────────────────────────

describe("InviteLandingClient — ready to connect", () => {
  it("shows Connect + Decline buttons for parent on nanny→parent invite", () => {
    render(
      <InviteLandingClient
        token={TOKEN}
        preview={pendingNannyToParent}
        previewError={null}
        currentUserId="user-parent-1"
        currentUserRole="parent"
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Connect Oliver/i,
    );
    expect(
      screen.getByRole("button", { name: /^connect$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^decline$/i }),
    ).toBeInTheDocument();
  });

  it("calls connectChildInvite and routes to development on success", async () => {
    render(
      <InviteLandingClient
        token={TOKEN}
        preview={pendingNannyToParent}
        previewError={null}
        currentUserId="user-parent-1"
        currentUserRole="parent"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    await waitFor(() => {
      expect(state.pushCalls).toEqual(["/parent/development/child-123"]);
    });
  });

  it("falls into wrong_role state when connect returns role_mismatch", async () => {
    state.connectResult = {
      success: false,
      error: "role_mismatch",
      data: null,
    };
    render(
      <InviteLandingClient
        token={TOKEN}
        preview={pendingNannyToParent}
        previewError={null}
        currentUserId="user-parent-1"
        currentUserRole="parent"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        /This invite is for/i,
      );
    });
  });

  it("calls declineChildInvite and routes back to /parent on decline", async () => {
    render(
      <InviteLandingClient
        token={TOKEN}
        preview={pendingNannyToParent}
        previewError={null}
        currentUserId="user-parent-1"
        currentUserRole="parent"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^decline$/i }));
    await waitFor(() => {
      expect(state.pushCalls).toEqual(["/parent"]);
    });
  });

  it("falls into already_connected state when connect returns invite_already_connected", async () => {
    state.connectResult = {
      success: false,
      error: "invite_already_connected",
      data: null,
    };
    render(
      <InviteLandingClient
        token={TOKEN}
        preview={pendingNannyToParent}
        previewError={null}
        currentUserId="user-parent-1"
        currentUserRole="parent"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        /expired/i,
      );
    });
  });

  it("falls into revoked state when connect returns invite_revoked", async () => {
    state.connectResult = {
      success: false,
      error: "invite_revoked",
      data: null,
    };
    render(
      <InviteLandingClient
        token={TOKEN}
        preview={pendingNannyToParent}
        previewError={null}
        currentUserId="user-parent-1"
        currentUserRole="parent"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        /no longer active/i,
      );
    });
  });

  it("surfaces an error banner when decline fails (no navigation)", async () => {
    state.declineResult = {
      success: false,
      error: "transaction_failed",
    };
    render(
      <InviteLandingClient
        token={TOKEN}
        preview={pendingNannyToParent}
        previewError={null}
        currentUserId="user-parent-1"
        currentUserRole="parent"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^decline$/i }));
    await waitFor(() => {
      expect(screen.getByText(/couldn't decline/i)).toBeInTheDocument();
    });
    // Stays on the same page — no router.push fired.
    expect(state.pushCalls).toEqual([]);
  });
});

// ── Switch-confirmation gate (correction 2026-05-05) ─────────────────

describe("InviteLandingClient — switch-confirmation gate", () => {
  it("does not render the warning when switchContext.isSwitching is false", () => {
    render(
      <InviteLandingClient
        token={TOKEN}
        preview={pendingNannyToParent}
        previewError={null}
        currentUserId="user-parent-1"
        currentUserRole="parent"
        switchContext={{ isSwitching: false, fromNannyName: null }}
      />,
    );
    expect(
      screen.queryByText(/you're switching nannies/i),
    ).not.toBeInTheDocument();
    // Connect button is enabled by default.
    expect(
      screen.getByRole("button", { name: /^connect$/i }),
    ).not.toBeDisabled();
  });

  it("renders the warning + disables Connect until the checkbox is ticked", () => {
    render(
      <InviteLandingClient
        token={TOKEN}
        preview={pendingNannyToParent}
        previewError={null}
        currentUserId="user-parent-1"
        currentUserRole="parent"
        switchContext={{ isSwitching: true, fromNannyName: "Anna" }}
      />,
    );
    expect(screen.getByText(/you're switching nannies/i)).toBeInTheDocument();
    expect(screen.getByText(/Anna/)).toBeInTheDocument();
    // Connect button now reads "Switch to Sarah" (the inviter) and is disabled.
    const switchButton = screen.getByRole("button", {
      name: /switch to sarah/i,
    });
    expect(switchButton).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(switchButton).not.toBeDisabled();
  });

  it("falls back to a generic 'your current nanny' label when fromNannyName is null", () => {
    render(
      <InviteLandingClient
        token={TOKEN}
        preview={pendingNannyToParent}
        previewError={null}
        currentUserId="user-parent-1"
        currentUserRole="parent"
        switchContext={{ isSwitching: true, fromNannyName: null }}
      />,
    );
    expect(screen.getByText(/your current nanny/i)).toBeInTheDocument();
  });

  it("does NOT call connectChildInvite while the checkbox is unticked", async () => {
    render(
      <InviteLandingClient
        token={TOKEN}
        preview={pendingNannyToParent}
        previewError={null}
        currentUserId="user-parent-1"
        currentUserRole="parent"
        switchContext={{ isSwitching: true, fromNannyName: "Anna" }}
      />,
    );
    const switchButton = screen.getByRole("button", {
      name: /switch to sarah/i,
    });
    fireEvent.click(switchButton);
    // Disabled — click is a no-op. No navigation, no router push.
    await waitFor(() => {
      expect(state.pushCalls).toEqual([]);
    });
  });
});

// ── Anon — direction-aware signup link (Medium fix) ──────────────────

describe("InviteLandingClient — anon signup routing", () => {
  it("routes anon parent recipient to /signup/parent", () => {
    render(
      <InviteLandingClient
        token={TOKEN}
        preview={pendingNannyToParent}
        previewError={null}
        currentUserId={null}
        currentUserRole={null}
      />,
    );
    expect(
      screen.getByRole("link", { name: /create account/i }),
    ).toHaveAttribute("href", `/signup/parent?invite=${TOKEN}`);
  });

  it("routes anon nanny recipient to /signup/nanny", () => {
    render(
      <InviteLandingClient
        token={TOKEN}
        preview={pendingParentToNanny}
        previewError={null}
        currentUserId={null}
        currentUserRole={null}
      />,
    );
    expect(
      screen.getByRole("link", { name: /create account/i }),
    ).toHaveAttribute("href", `/signup/nanny?invite=${TOKEN}`);
  });
});
