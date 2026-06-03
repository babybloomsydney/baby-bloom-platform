/**
 * LapsedBanner — tests.
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S3.
 *
 * Behaviour under test:
 * - AC-S3.1: renders when role + state communicate "lapsed."
 * - AC-S3.3: has NO close affordance — banner is unclosable by design.
 * - AC-S3.4: CTAs match audience (parent: Subscribe; nanny: Share).
 * - Locked-in copy: heading specific to role; uses child + parent names.
 * - No banned terminology.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LapsedBanner, type LapsedBannerProps } from "./LapsedBanner";

function makeProps(
  overrides: Partial<LapsedBannerProps> = {},
): LapsedBannerProps {
  return {
    role: "parent",
    childFirstName: "Lily",
    parentFirstName: "Sarah",
    onPrimaryCta: vi.fn(),
    ...overrides,
  };
}

describe("LapsedBanner — parent variant", () => {
  it("renders subscription-required messaging (AC-S3.1)", () => {
    const props = makeProps({ role: "parent" });
    render(<LapsedBanner {...props} />);
    expect(screen.getByText(/subscription required/i)).toBeInTheDocument();
  });

  it("references the child by first name", () => {
    const props = makeProps({ role: "parent" });
    render(<LapsedBanner {...props} />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Lily/);
  });

  it("primary CTA labelled 'Subscribe' (AC-S3.4)", () => {
    const props = makeProps({ role: "parent" });
    render(<LapsedBanner {...props} />);
    expect(
      screen.getByRole("button", { name: /^subscribe$/i }),
    ).toBeInTheDocument();
  });

  it("CTA click fires onPrimaryCta", async () => {
    const user = userEvent.setup();
    const props = makeProps({ role: "parent" });
    render(<LapsedBanner {...props} />);
    await user.click(screen.getByRole("button", { name: /^subscribe$/i }));
    expect(props.onPrimaryCta).toHaveBeenCalledOnce();
  });

  it("has no close button (AC-S3.3 — banner is unclosable)", () => {
    const props = makeProps({ role: "parent" });
    render(<LapsedBanner {...props} />);
    expect(
      screen.queryByRole("button", { name: /close|dismiss/i }),
    ).not.toBeInTheDocument();
  });
});

describe("LapsedBanner — nanny variant", () => {
  it("references the child's family lapse (AC-S3.1)", () => {
    const props = makeProps({ role: "nanny" });
    render(<LapsedBanner {...props} />);
    expect(
      screen.getByText(/Lily.*family.*lapsed|family.*lapsed/i),
    ).toBeInTheDocument();
  });

  it("primary CTA labelled with parent name (AC-S3.4)", () => {
    const props = makeProps({ role: "nanny", parentFirstName: "Sarah" });
    render(<LapsedBanner {...props} />);
    expect(
      screen.getByRole("button", { name: /share.* with Sarah/i }),
    ).toBeInTheDocument();
  });

  it("CTA click fires onPrimaryCta", async () => {
    const user = userEvent.setup();
    const props = makeProps({ role: "nanny" });
    render(<LapsedBanner {...props} />);
    await user.click(
      screen.getByRole("button", { name: /share.* with Sarah/i }),
    );
    expect(props.onPrimaryCta).toHaveBeenCalledOnce();
  });

  it("falls back to 'the parent' when parentFirstName missing", () => {
    const props = makeProps({ role: "nanny", parentFirstName: undefined });
    render(<LapsedBanner {...props} />);
    expect(
      screen.getByRole("button", { name: /share.* with the parent/i }),
    ).toBeInTheDocument();
  });

  it("has no close button (AC-S3.3)", () => {
    const props = makeProps({ role: "nanny" });
    render(<LapsedBanner {...props} />);
    expect(
      screen.queryByRole("button", { name: /close|dismiss/i }),
    ).not.toBeInTheDocument();
  });
});

describe("LapsedBanner — universal", () => {
  it("does not use banned 'tracking' terminology", () => {
    const props = makeProps();
    render(<LapsedBanner {...props} />);
    const text = document.body.textContent ?? "";
    expect(text.toLowerCase()).not.toMatch(/\btrack(ing|ed|s)?\b/);
  });

  it("renders with role='status' for assistive tech announcement", () => {
    const props = makeProps();
    render(<LapsedBanner {...props} />);
    // The banner should announce itself non-intrusively.
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
