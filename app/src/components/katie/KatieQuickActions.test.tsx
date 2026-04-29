import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KatieQuickActions, chipsForRole } from "./KatieQuickActions";

describe("chipsForRole", () => {
  it("returns parent chips for role=parent", () => {
    const chips = chipsForRole("parent");
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.every((c) => typeof c.label === "string")).toBe(true);
    expect(chips.every((c) => typeof c.prompt === "string")).toBe(true);
  });

  it("returns nanny chips for role=nanny", () => {
    const chips = chipsForRole("nanny");
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.every((c) => typeof c.label === "string")).toBe(true);
    expect(chips.every((c) => typeof c.prompt === "string")).toBe(true);
  });

  it("returns different chips for parent vs nanny (no shared prompts)", () => {
    const parent = chipsForRole("parent").map((c) => c.prompt);
    const nanny = chipsForRole("nanny").map((c) => c.prompt);
    const overlap = parent.filter((p) => nanny.includes(p));
    expect(overlap).toEqual([]);
  });

  it("returns an empty list for admin / unknown roles", () => {
    expect(chipsForRole("admin")).toEqual([]);
    expect(chipsForRole("")).toEqual([]);
    expect(chipsForRole("nobody")).toEqual([]);
  });

  it("each chip has a non-empty label and prompt", () => {
    for (const role of ["parent", "nanny"] as const) {
      for (const chip of chipsForRole(role)) {
        expect(chip.label.length).toBeGreaterThan(0);
        expect(chip.prompt.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps chip labels short enough to fit a chat row (<=30 chars)", () => {
    // Cap labels so chips don't wrap into multi-line buttons. Prompts
    // can be longer because they go into the chat as the user message.
    for (const role of ["parent", "nanny"] as const) {
      for (const chip of chipsForRole(role)) {
        expect(chip.label.length).toBeLessThanOrEqual(30);
      }
    }
  });
});

describe("KatieQuickActions component", () => {
  it("renders one button per chip for parent role", () => {
    const onSelect = vi.fn();
    render(<KatieQuickActions role="parent" onSelect={onSelect} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(chipsForRole("parent").length);
  });

  it("calls onSelect with the chip prompt (not the label) when clicked", () => {
    const onSelect = vi.fn();
    render(<KatieQuickActions role="parent" onSelect={onSelect} />);
    const target = chipsForRole("parent")[0];
    fireEvent.click(screen.getByText(target.label));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(target.prompt);
  });

  it("renders nothing for admin role", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <KatieQuickActions role="admin" onSelect={onSelect} />,
    );
    // Component returns null when chip list is empty
    expect(container.firstChild).toBeNull();
  });

  it("groups chips with role=group + accessible label for assistive tech", () => {
    const onSelect = vi.fn();
    render(<KatieQuickActions role="parent" onSelect={onSelect} />);
    expect(screen.getByRole("group", { name: "Quick actions" })).toBeTruthy();
  });
});
