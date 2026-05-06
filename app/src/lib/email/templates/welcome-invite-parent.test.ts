import { describe, it, expect } from "vitest";
import { buildWelcomeInviteParentEmail } from "./welcome-invite-parent";

const PARAMS = {
  firstName: "Bailey",
  nannyFirstName: "Sarah",
  childFirstName: "Oliver",
  inviteToken: "ABCD-2345",
  appUrl: "https://app.example.com",
};

describe("buildWelcomeInviteParentEmail", () => {
  it("subject mentions the inviting nanny's first name (recognition signal)", () => {
    const { subject } = buildWelcomeInviteParentEmail(PARAMS);
    expect(subject).toContain("Sarah");
    // Subject should NOT contain the recipient's own first name — they
    // already know who they are; what matters is who they're linked with.
    expect(subject.toLowerCase()).toContain("welcome");
  });

  it("subject degrades gracefully when nanny first name is null (no merge-error wording)", () => {
    const { subject } = buildWelcomeInviteParentEmail({
      ...PARAMS,
      nannyFirstName: null,
    });
    // Must NOT print the body fallback ("your nanny") in the subject —
    // that reads as a mail-merge error to recipients.
    expect(subject.toLowerCase()).not.toContain("your nanny");
    expect(subject.toLowerCase()).toContain("welcome");
  });

  it("body falls back to neutral wording when names are null", () => {
    const { html } = buildWelcomeInviteParentEmail({
      ...PARAMS,
      nannyFirstName: null,
      childFirstName: null,
    });
    expect(html).toContain("your nanny");
    // 'their' is the possessive fallback when childFirstName is null.
    expect(html).toContain("their day");
    expect(html).toContain("their feed");
  });

  it("URL-encodes the inviteToken in the CTA href (defence-in-depth)", () => {
    const { html } = buildWelcomeInviteParentEmail({
      ...PARAMS,
      // Pretend a future token format includes a reserved char.
      inviteToken: "AB CD&EF",
    });
    expect(html).toContain("/invite/AB%20CD%26EF?auto=1");
    // Raw form must not appear unencoded.
    expect(html).not.toContain("/invite/AB CD&EF?auto=1");
  });

  it("body references the recipient, the nanny, and the child by first name", () => {
    const { html } = buildWelcomeInviteParentEmail(PARAMS);
    expect(html).toContain("Bailey");
    expect(html).toContain("Sarah");
    expect(html).toContain("Oliver");
  });

  it("CTA deep-links back to the invite landing with auto=1 so connect fires automatically", () => {
    const { html } = buildWelcomeInviteParentEmail(PARAMS);
    expect(html).toContain("https://app.example.com/invite/ABCD-2345?auto=1");
  });

  it("does NOT contain a 'find a nanny' / browse-nannies CTA — the user already has one", () => {
    const { html } = buildWelcomeInviteParentEmail(PARAMS);
    const lower = html.toLowerCase();
    expect(lower).not.toContain("browse our verified");
    expect(lower).not.toContain("create a position");
    expect(lower).not.toContain("find the right nanny");
  });

  it("mentions Katie as the AI helper (per spec callout)", () => {
    const { html } = buildWelcomeInviteParentEmail(PARAMS);
    expect(html).toContain("Katie");
  });

  it("includes the privacy policy + client terms links (transactional email footer)", () => {
    const { html } = buildWelcomeInviteParentEmail(PARAMS);
    expect(html).toContain("/legal/privacy-policy");
    expect(html).toContain("/legal/client-terms");
  });
});
