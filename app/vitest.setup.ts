import "@testing-library/jest-dom/vitest";

// Prevent SDK clients from throwing at module-load time when tests don't
// set real credentials. Tests that exercise AI calls mock the clients
// outright; this just lets transitive imports succeed.
process.env.OPENAI_API_KEY ??= "test-openai-key";
process.env.GOOGLE_GENAI_API_KEY ??= "test-gemini-key";
