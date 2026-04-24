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
