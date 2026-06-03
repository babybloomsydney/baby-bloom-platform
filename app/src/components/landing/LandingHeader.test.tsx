/**
 * LandingHeader — render-default + auth-window swap tests.
 *
 * Bug context (T-030, 2026-05-20): the header's right side stayed blank
 * for 10-15s on slow networks because the JSX was gated on
 * `{!isLoading && (...)}` — while `useAuth()` was still bootstrapping
 * (3 sequential Supabase round-trips), neither button branch rendered.
 * Fix: render the logged-out variant (Sign In + Get Started) as the
 * default; swap to "Back to Dashboard" only when `user && dashboard`
 * resolve. Logo href is gated on the same auth-window dependency and
 * also defaults safely.
 *
 * HIDDEN_PATHS (matchmaking/onboarding + position pages) suppress the
 * entire header — that behaviour must be preserved exactly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";

const state = vi.hoisted(() => ({
  user: null as User | null,
  role: null as string | null,
  isLoading: true,
  pathname: "/",
  search: "",
}));

beforeEach(() => {
  state.user = null;
  state.role = null;
  state.isLoading = true;
  state.pathname = "/";
  state.search = "";
});

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(state.search),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: state.user,
    role: state.role,
    profile: null,
    isLoading: state.isLoading,
    signOut: async () => {},
  }),
}));

import { LandingHeader } from "./LandingHeader";

describe("LandingHeader — render-default behaviour", () => {
  it("renders Sign In + Get Started while isLoading=true (no blank state)", () => {
    state.isLoading = true;
    state.user = null;
    state.role = null;

    render(<LandingHeader />);

    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /get started/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /back to dashboard/i }),
    ).not.toBeInTheDocument();
  });

  it("renders Sign In + Get Started for logged-out resolved (default)", () => {
    state.isLoading = false;
    state.user = null;
    state.role = null;

    render(<LandingHeader />);

    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /get started/i }),
    ).toBeInTheDocument();
  });
});

describe("LandingHeader — swap to Back to Dashboard on auth resolve", () => {
  it("nanny → /nanny", () => {
    state.isLoading = false;
    state.user = { id: "u-nanny" } as User;
    state.role = "nanny";

    render(<LandingHeader />);

    const back = screen.getByRole("link", { name: /back to dashboard/i });
    expect(back).toBeInTheDocument();
    expect(back.getAttribute("href")).toBe("/nanny");
    expect(
      screen.queryByRole("link", { name: /sign in/i }),
    ).not.toBeInTheDocument();
  });

  it("parent → /parent", () => {
    state.isLoading = false;
    state.user = { id: "u-parent" } as User;
    state.role = "parent";

    render(<LandingHeader />);

    const back = screen.getByRole("link", { name: /back to dashboard/i });
    expect(back.getAttribute("href")).toBe("/parent");
  });

  it("admin → /admin/dashboard", () => {
    state.isLoading = false;
    state.user = { id: "u-admin" } as User;
    state.role = "admin";

    render(<LandingHeader />);

    const back = screen.getByRole("link", { name: /back to dashboard/i });
    expect(back.getAttribute("href")).toBe("/admin/dashboard");
  });

  it("super_admin → /admin/dashboard", () => {
    state.isLoading = false;
    state.user = { id: "u-super" } as User;
    state.role = "super_admin";

    render(<LandingHeader />);

    const back = screen.getByRole("link", { name: /back to dashboard/i });
    expect(back.getAttribute("href")).toBe("/admin/dashboard");
  });
});

describe("LandingHeader — HIDDEN_PATHS suppression (regression guard)", () => {
  it("renders null on /matchmaking/onboarding", () => {
    state.pathname = "/matchmaking/onboarding";

    const { container } = render(<LandingHeader />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders null on /position/[id]", () => {
    state.pathname = "/position/abc-123";

    const { container } = render(<LandingHeader />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("LandingHeader — headless funnel (T-039 ?src suppression)", () => {
  it("renders null when arriving via ?src=std", () => {
    state.search = "src=std";
    const { container } = render(<LandingHeader />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders null when arriving via ?src=adv", () => {
    state.search = "src=adv";
    const { container } = render(<LandingHeader />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("LandingHeader — logo href race fix", () => {
  it("defaults to / when role not yet resolved (isLoading=true)", () => {
    state.isLoading = true;
    state.user = null;
    state.role = null;

    render(<LandingHeader />);
    const logoText = screen.getByText("Baby");
    const logo = logoText.closest("a");
    expect(logo?.getAttribute("href")).toBe("/");
  });

  it("defaults to / when logged out (resolved)", () => {
    state.isLoading = false;
    state.user = null;
    state.role = null;

    render(<LandingHeader />);
    const logoText = screen.getByText("Baby");
    const logo = logoText.closest("a");
    expect(logo?.getAttribute("href")).toBe("/");
  });

  it("re-targets to dashboard when nanny resolves", () => {
    state.isLoading = false;
    state.user = { id: "u-nanny" } as User;
    state.role = "nanny";

    render(<LandingHeader />);
    const logoText = screen.getByText("Baby");
    const logo = logoText.closest("a");
    expect(logo?.getAttribute("href")).toBe("/nanny");
  });
});
