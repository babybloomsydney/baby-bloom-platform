import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { PendingInviteCard } from "@/types/bapp";

const state = vi.hoisted(() => ({
  pushCalls: [] as string[],
  refreshCalls: 0,
  declineResult: { success: true, error: null as string | null },
}));

beforeEach(() => {
  state.pushCalls = [];
  state.refreshCalls = 0;
  state.declineResult = { success: true, error: null };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (url: string) => state.pushCalls.push(url),
    refresh: () => {
      state.refreshCalls += 1;
    },
  }),
}));

vi.mock("@/lib/actions/bapp/child-invites", () => ({
  declineChildInviteById: vi.fn(async () => state.declineResult),
}));

import { PendingInvitesSection } from "./PendingInvitesSection";

const sample: PendingInviteCard = {
  inviteId: "00000000-0000-4000-8000-000000000001",
  childClientId: "00000000-0000-4000-8000-000000000002",
  direction: "nanny_to_parent",
  childFirstName: "Oliver",
  inviterFirstName: "Sarah",
  createdAt: "2026-05-04T00:00:00Z",
};

describe("PendingInvitesSection", () => {
  it("renders nothing when the initial list is empty", () => {
    const { container } = render(<PendingInvitesSection initialInvites={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one card per invite with inviter + child names", () => {
    render(<PendingInvitesSection initialInvites={[sample]} />);
    expect(
      screen.getByText(/Sarah invited you to connect Oliver/i),
    ).toBeInTheDocument();
  });

  it("routes to the secure server resolver on Connect (token never crosses client)", () => {
    render(<PendingInvitesSection initialInvites={[sample]} />);
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));
    expect(state.pushCalls).toEqual([
      "/invite/connect/00000000-0000-4000-8000-000000000001",
    ]);
  });

  it("removes the card optimistically on successful decline + refreshes", async () => {
    render(<PendingInvitesSection initialInvites={[sample]} />);
    fireEvent.click(screen.getByRole("button", { name: /^decline$/i }));
    await waitFor(() => {
      expect(
        screen.queryByText(/Sarah invited you to connect Oliver/i),
      ).not.toBeInTheDocument();
    });
    expect(state.refreshCalls).toBe(1);
  });

  it("keeps the card and shows an error when decline fails", async () => {
    state.declineResult = { success: false, error: "transaction_failed" };
    render(<PendingInvitesSection initialInvites={[sample]} />);
    fireEvent.click(screen.getByRole("button", { name: /^decline$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    // Card still visible.
    expect(
      screen.getByText(/Sarah invited you to connect Oliver/i),
    ).toBeInTheDocument();
  });

  it("shows the not_recipient-specific message when the action returns not_recipient", async () => {
    state.declineResult = { success: false, error: "not_recipient" };
    render(<PendingInvitesSection initialInvites={[sample]} />);
    fireEvent.click(screen.getByRole("button", { name: /^decline$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/for someone else/i);
    });
  });
});
