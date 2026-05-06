/**
 * KatieTabs — A-07. Behaviour tests for the new ARIA tablist swap UI.
 *
 * The component uses `useKatie()` from KatieContext, so we mock the
 * hook with controllable state + spies. The actual context wiring is
 * already covered by other Katie tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const showKatieMock = vi.fn();
const showMainMock = vi.fn();
let currentDeck: "katie" | "main" = "main";
let currentUnread = 0;

vi.mock("@/contexts/KatieContext", () => ({
  useKatie: () => ({
    visibleDeck: currentDeck,
    unreadCount: currentUnread,
    showKatie: showKatieMock,
    showMain: showMainMock,
    // Other context fields aren't read by KatieTabs but typed for safety.
    setUnreadCount: vi.fn(),
    toggleDeck: vi.fn(),
    currentSurface: null,
  }),
}));

import { KatieTabs } from "./KatieTabs";

beforeEach(() => {
  showKatieMock.mockReset();
  showMainMock.mockReset();
  currentDeck = "main";
  currentUnread = 0;
});

describe("KatieTabs — ARIA", () => {
  it("renders a tablist with two tabs", () => {
    render(<KatieTabs />);
    const tablist = screen.getByRole("tablist");
    expect(tablist).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  it("marks the active tab via aria-selected", () => {
    currentDeck = "katie";
    render(<KatieTabs />);
    const katieTab = screen.getByRole("tab", { name: /Katie/ });
    const mainTab = screen.getByRole("tab", { name: /BabyBloom/ });
    expect(katieTab).toHaveAttribute("aria-selected", "true");
    expect(mainTab).toHaveAttribute("aria-selected", "false");
  });

  it("only the active tab is in the tab order (roving tabindex)", () => {
    currentDeck = "main";
    render(<KatieTabs />);
    const katieTab = screen.getByRole("tab", { name: /Katie/ });
    const mainTab = screen.getByRole("tab", { name: /BabyBloom/ });
    expect(katieTab).toHaveAttribute("tabindex", "-1");
    expect(mainTab).toHaveAttribute("tabindex", "0");
  });

  it("roving tabindex flips when the active deck changes (re-render)", () => {
    currentDeck = "main";
    const { rerender } = render(<KatieTabs />);
    expect(screen.getByRole("tab", { name: /Katie/ })).toHaveAttribute(
      "tabindex",
      "-1",
    );

    currentDeck = "katie";
    rerender(<KatieTabs />);
    expect(screen.getByRole("tab", { name: /Katie/ })).toHaveAttribute(
      "tabindex",
      "0",
    );
    expect(screen.getByRole("tab", { name: /BabyBloom/ })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });

  it("each tab links to its panel via aria-controls", () => {
    render(<KatieTabs />);
    expect(screen.getByRole("tab", { name: /Katie/ })).toHaveAttribute(
      "aria-controls",
      "panel-katie",
    );
    expect(screen.getByRole("tab", { name: /BabyBloom/ })).toHaveAttribute(
      "aria-controls",
      "panel-main",
    );
  });
});

describe("KatieTabs — interactions", () => {
  it("clicking the inactive tab swaps decks", () => {
    currentDeck = "main";
    render(<KatieTabs />);
    fireEvent.click(screen.getByRole("tab", { name: /Katie/ }));
    expect(showKatieMock).toHaveBeenCalledTimes(1);
    expect(showMainMock).not.toHaveBeenCalled();
  });

  it("ArrowRight on the Katie tab swaps to main AND moves focus", () => {
    currentDeck = "katie";
    render(<KatieTabs />);
    const katieTab = screen.getByRole("tab", { name: /Katie/ });
    katieTab.focus();
    fireEvent.keyDown(katieTab, { key: "ArrowRight" });
    expect(showMainMock).toHaveBeenCalledTimes(1);
    // Focus assertion — required by the WAI-ARIA tabs pattern. Without
    // this, AT users would land on the wrong tab after Arrow nav even
    // though `aria-selected` reflects the new state.
    expect(screen.getByRole("tab", { name: /BabyBloom/ })).toHaveFocus();
  });

  it("ArrowLeft on the BabyBloom tab swaps to Katie", () => {
    currentDeck = "main";
    render(<KatieTabs />);
    fireEvent.keyDown(screen.getByRole("tab", { name: /BabyBloom/ }), {
      key: "ArrowLeft",
    });
    expect(showKatieMock).toHaveBeenCalledTimes(1);
  });

  it("Home key jumps to the Katie (start) tab", () => {
    currentDeck = "main";
    render(<KatieTabs />);
    fireEvent.keyDown(screen.getByRole("tab", { name: /BabyBloom/ }), {
      key: "Home",
    });
    expect(showKatieMock).toHaveBeenCalledTimes(1);
  });

  it("End key jumps to the BabyBloom (end) tab", () => {
    currentDeck = "katie";
    cleanup(); // ensure prior render is unmounted to avoid duplicate roles
    render(<KatieTabs />);
    fireEvent.keyDown(screen.getByRole("tab", { name: /Katie/ }), {
      key: "End",
    });
    expect(showMainMock).toHaveBeenCalledTimes(1);
  });
});

describe("KatieTabs — unread badge", () => {
  it("hides the badge when unreadCount is 0", () => {
    currentUnread = 0;
    render(<KatieTabs />);
    // No screen-reader 'unread' announcement.
    expect(screen.queryByText(/unread/i)).not.toBeInTheDocument();
  });

  it("renders the count up to 9", () => {
    currentUnread = 3;
    render(<KatieTabs />);
    expect(screen.getByRole("tab", { name: /Katie/ })).toHaveTextContent("3");
    expect(screen.getByText(/3 unread messages/i)).toBeInTheDocument();
  });

  it("clamps to 9+ for ten or more", () => {
    currentUnread = 42;
    render(<KatieTabs />);
    expect(screen.getByRole("tab", { name: /Katie/ })).toHaveTextContent("9+");
    // SR announcement uses the real count, not the clamped label.
    expect(screen.getByText(/42 unread messages/i)).toBeInTheDocument();
  });

  it("uses singular 'message' for exactly 1 unread", () => {
    currentUnread = 1;
    render(<KatieTabs />);
    expect(screen.getByText(/1 unread message$/i)).toBeInTheDocument();
  });
});
