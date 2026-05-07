import "@testing-library/jest-dom/vitest";

// Prevent SDK clients from throwing at module-load time when tests don't
// set real credentials. Tests that exercise AI calls mock the clients
// outright; this just lets transitive imports succeed.
process.env.OPENAI_API_KEY ??= "test-openai-key";
process.env.GOOGLE_GENAI_API_KEY ??= "test-gemini-key";
// Resend client is new'd at top of lib/email/resend.ts; without a key
// the constructor throws, which cascades into any module that
// transitively imports a server action under @/lib/actions/*.
process.env.RESEND_API_KEY ??= "re_test_key";

// jsdom doesn't ship ResizeObserver. Components that observe DOM size
// (KatieTabs' ChromeTabBackdrop, etc.) crash on mount without a stub.
// Minimal no-op implementation — observe/unobserve do nothing, so the
// component falls through to its empty render branch instead of
// invoking the SVG path math, which is fine for behaviour tests.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
