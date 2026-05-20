/**
 * Banner shown on the creator's side of the child layout while the
 * other party is still missing. Per `05-ui-surfaces.md §5`:
 * - Nanny side (parent missing) → non-dismissible
 * - Parent side (nanny missing) → dismissible per session
 * - Kebab menu has only "Revoke link" (no regenerate, per token-stability policy)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const state = vi.hoisted(() => ({
  revokeResult: { success: true, error: null as string | null },
  refreshCalls: 0,
  shareCalls: [] as ShareData[],
  shareThrows: null as Error | null,
  clipboardWrites: [] as string[],
}));

beforeEach(() => {
  state.revokeResult = { success: true, error: null };
  state.refreshCalls = 0;
  state.shareCalls = [];
  state.shareThrows = null;
  state.clipboardWrites = [];
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => {
      state.refreshCalls += 1;
    },
  }),
}));

vi.mock("@/lib/actions/bapp/child-invites", () => ({
  revokeChildInvite: vi.fn(async () => state.revokeResult),
}));

import { InviteBanner } from "./InviteBanner";

const props = {
  childId: "child-1",
  childFirstName: "Oliver",
  inviteToken: "ABCD-2345",
  role: "nanny" as const,
};

// The component composes the share URL from `window.location.origin`
// at render time. Mirror that here so the assertions match regardless
// of the jsdom default origin.
const expectedInviteUrl = () =>
  `${typeof window !== "undefined" ? window.location.origin : ""}/invite/${
    props.inviteToken
  }`;

beforeEach(() => {
  // Stub navigator.share + clipboard. Default = share present.
  Object.defineProperty(window.navigator, "share", {
    configurable: true,
    writable: true,
    value: async (data: ShareData) => {
      if (state.shareThrows) throw state.shareThrows;
      state.shareCalls.push(data);
    },
  });
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    writable: true,
    value: {
      writeText: async (text: string) => {
        state.clipboardWrites.push(text);
      },
    },
  });
});

describe("InviteBanner — render", () => {
  it("nanny variant uses the parent-missing copy and is non-dismissible", () => {
    render(<InviteBanner {...props} role="nanny" />);
    expect(
      screen.getByText(/send Oliver's parent an invite/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /dismiss/i }),
    ).not.toBeInTheDocument();
  });

  it("parent variant uses the nanny-missing copy and IS dismissible", () => {
    render(<InviteBanner {...props} role="parent" />);
    expect(
      screen.getByText(/send Oliver's nanny an invite/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /dismiss/i }),
    ).toBeInTheDocument();
  });
});

describe("InviteBanner — share + copy", () => {
  it("calls navigator.share with the invite URL", async () => {
    render(<InviteBanner {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /share invite/i }));
    await waitFor(() => {
      expect(state.shareCalls.length).toBe(1);
      expect(state.shareCalls[0]?.url).toBe(expectedInviteUrl());
    });
  });

  it("falls back to clipboard when navigator.share is undefined", async () => {
    // Remove share to force fallback.
    Object.defineProperty(window.navigator, "share", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    render(<InviteBanner {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /share invite/i }));
    await waitFor(() => {
      expect(state.clipboardWrites).toEqual([expectedInviteUrl()]);
    });
    expect(screen.getByText(/link copied/i)).toBeInTheDocument();
  });

  it("does NOT fall back when the user cancels the share sheet (AbortError)", async () => {
    state.shareThrows = Object.assign(new Error("Cancelled"), {
      name: "AbortError",
    });
    render(<InviteBanner {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /share invite/i }));
    await waitFor(() => {
      expect(state.shareThrows).not.toBeNull();
    });
    // No copy fallback fired.
    expect(state.clipboardWrites).toEqual([]);
    expect(screen.queryByText(/link copied/i)).not.toBeInTheDocument();
  });

  it("falls back to clipboard when share throws a non-AbortError", async () => {
    state.shareThrows = new Error("not allowed");
    render(<InviteBanner {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /share invite/i }));
    await waitFor(() => {
      expect(state.clipboardWrites).toEqual([expectedInviteUrl()]);
    });
  });
});

describe("InviteBanner — revoke kebab", () => {
  // Radix DropdownMenu listens to PointerEvents — userEvent dispatches
  // them; fireEvent.click does not, which causes the menu not to open.
  it("opens the kebab menu and only exposes Revoke link (no regenerate)", async () => {
    const user = userEvent.setup();
    render(<InviteBanner {...props} />);
    await user.click(screen.getByRole("button", { name: /more options/i }));
    expect(
      await screen.findByRole("menuitem", { name: /revoke link/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /regenerate/i }),
    ).not.toBeInTheDocument();
  });

  it("requires a confirmation step before calling revokeChildInvite", async () => {
    const user = userEvent.setup();
    render(<InviteBanner {...props} />);
    await user.click(screen.getByRole("button", { name: /more options/i }));
    await user.click(
      await screen.findByRole("menuitem", { name: /revoke link/i }),
    );
    // Confirmation appears, revoke not yet called.
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(state.refreshCalls).toBe(0);
    // Cancel -> dismiss confirmation, still no revoke.
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(state.refreshCalls).toBe(0);
  });

  it("calls revokeChildInvite and refreshes only after the confirm tap", async () => {
    const user = userEvent.setup();
    render(<InviteBanner {...props} />);
    await user.click(screen.getByRole("button", { name: /more options/i }));
    await user.click(
      await screen.findByRole("menuitem", { name: /revoke link/i }),
    );
    await user.click(await screen.findByRole("button", { name: /^revoke$/i }));
    await waitFor(() => {
      expect(state.refreshCalls).toBe(1);
    });
  });

  it("surfaces an error when revoke fails", async () => {
    state.revokeResult = { success: false, error: "not_creator" };
    const user = userEvent.setup();
    render(<InviteBanner {...props} />);
    await user.click(screen.getByRole("button", { name: /more options/i }));
    await user.click(
      await screen.findByRole("menuitem", { name: /revoke link/i }),
    );
    await user.click(await screen.findByRole("button", { name: /^revoke$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(state.refreshCalls).toBe(0);
  });
});

describe("InviteBanner — dismiss", () => {
  it("hides itself after parent dismisses", () => {
    render(<InviteBanner {...props} role="parent" />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(
      screen.queryByText(/send Oliver's nanny an invite/i),
    ).not.toBeInTheDocument();
  });
});
