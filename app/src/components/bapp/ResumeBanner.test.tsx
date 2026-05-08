// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const dismissSpy = vi.fn();
vi.mock("@/lib/actions/bapp/onboarding-banner", () => ({
  dismissOnboardingBanner: () => dismissSpy(),
}));

const showKatieSpy = vi.fn();
vi.mock("@/contexts/KatieContext", () => ({
  useKatieOptional: () => ({
    showKatie: showKatieSpy,
  }),
}));

import { ResumeBanner } from "./ResumeBanner";

beforeEach(() => {
  dismissSpy.mockReset();
  dismissSpy.mockResolvedValue({ success: true });
  showKatieSpy.mockReset();
});

describe("ResumeBanner", () => {
  it("renders no banner when status.visible=false (only the persistent live region)", () => {
    render(
      <ResumeBanner
        status={{
          visible: false,
          hasCapturedTopics: false,
          pendingCount: 0,
          pendingTopicLabels: [],
          totalTopics: 0,
        }}
      />,
    );
    // The <section> is gated; only the empty live region remains.
    expect(screen.queryByText(/setup with Katie/i)).not.toBeInTheDocument();
  });

  it("renders the fresh-skip copy when hasCapturedTopics=false", () => {
    render(
      <ResumeBanner
        status={{
          visible: true,
          hasCapturedTopics: false,
          pendingCount: 3,
          pendingTopicLabels: ["routine", "schedule", "milestones"],
          totalTopics: 8,
        }}
      />,
    );
    // Spec L780: fresh-skip variant.
    expect(screen.getByText(/Quick setup with Katie/i)).toBeInTheDocument();
  });

  it("renders the continue copy + topic list when hasCapturedTopics=true", () => {
    render(
      <ResumeBanner
        status={{
          visible: true,
          hasCapturedTopics: true,
          pendingCount: 2,
          pendingTopicLabels: ["schedule", "milestones"],
          totalTopics: 8,
        }}
      />,
    );
    expect(screen.getByText(/Continue setup with Katie/i)).toBeInTheDocument();
    expect(screen.getByText(/2 more things on offer/i)).toBeInTheDocument();
    expect(screen.getByText(/schedule, milestones/i)).toBeInTheDocument();
  });

  it("uses singular 'thing' when pendingCount=1", () => {
    render(
      <ResumeBanner
        status={{
          visible: true,
          hasCapturedTopics: true,
          pendingCount: 1,
          pendingTopicLabels: ["photo"],
          totalTopics: 8,
        }}
      />,
    );
    expect(screen.getByText(/1 more thing on offer/i)).toBeInTheDocument();
  });

  it("calls showKatie() when the Continue button is clicked", () => {
    render(
      <ResumeBanner
        status={{
          visible: true,
          hasCapturedTopics: true,
          pendingCount: 2,
          pendingTopicLabels: ["schedule", "milestones"],
          totalTopics: 8,
        }}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /continue from where we left off/i,
      }),
    );
    expect(showKatieSpy).toHaveBeenCalledTimes(1);
  });

  it("dismisses + hides itself when the × button is clicked (optimistic)", async () => {
    render(
      <ResumeBanner
        status={{
          visible: true,
          hasCapturedTopics: true,
          pendingCount: 2,
          pendingTopicLabels: ["schedule", "milestones"],
          totalTopics: 8,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    // Optimistic — banner hides immediately even before the server
    // action resolves; the spec's "Banner gone for good" UX shouldn't
    // wait on a network round-trip.
    expect(screen.queryByText(/setup with Katie/i)).not.toBeInTheDocument();
    await waitFor(() => expect(dismissSpy).toHaveBeenCalledTimes(1));
  });

  it("recovers (re-shows) when the dismiss server action fails", async () => {
    dismissSpy.mockResolvedValueOnce({
      success: false,
      error: "update_failed",
    });
    render(
      <ResumeBanner
        status={{
          visible: true,
          hasCapturedTopics: true,
          pendingCount: 2,
          pendingTopicLabels: ["schedule", "milestones"],
          totalTopics: 8,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    // After the failed server action resolves, the banner reappears
    // so the user can retry. Better than a silent "looks dismissed
    // but isn't" state.
    await waitFor(() =>
      expect(screen.getByText(/setup with Katie/i)).toBeInTheDocument(),
    );
  });

  it("recovers (re-shows) when the dismiss server action throws", async () => {
    dismissSpy.mockRejectedValueOnce(new Error("network error"));
    render(
      <ResumeBanner
        status={{
          visible: true,
          hasCapturedTopics: true,
          pendingCount: 2,
          pendingTopicLabels: ["schedule", "milestones"],
          totalTopics: 8,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    // The catch branch re-shows the banner the same way the
    // !success branch does — symmetric recovery for both
    // application-level failures and transport throws.
    await waitFor(() =>
      expect(screen.getByText(/setup with Katie/i)).toBeInTheDocument(),
    );
  });
});
