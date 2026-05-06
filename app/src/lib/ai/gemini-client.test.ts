import { describe, it, expect } from "vitest";
import {
  echoModelParts,
  generate,
  generateStream,
  GEMINI_MODELS,
  GEMINI_TIMEOUT_MS,
} from "./gemini-client";

describe("gemini-client", () => {
  describe("GEMINI_MODELS", () => {
    it("exposes the expected preview model IDs", () => {
      expect(GEMINI_MODELS.flash).toBe("gemini-3-flash-preview");
      expect(GEMINI_MODELS.pro).toBe("gemini-3-pro-preview");
    });
  });

  describe("GEMINI_TIMEOUT_MS", () => {
    it("matches the openai client timeout (50s)", () => {
      expect(GEMINI_TIMEOUT_MS).toBe(50_000);
    });
  });

  // Guard against a regression of the 2026-05-06 real-soak bug: passing
  // both `cachedContent` and `tools` (or systemPrompt) on the same
  // GenerateContent call. Gemini rejects with HTTP 400; we throw client-
  // side so any caller's broken assumption surfaces immediately, not
  // after a network round-trip.
  describe("cachedContent / tools / systemPrompt conflict guard", () => {
    it("generate throws when cachedContent is set alongside tools", async () => {
      await expect(() =>
        generate({
          model: GEMINI_MODELS.flash,
          contents: "x",
          cachedContent: "caches/abc",
          tools: [
            {
              functionDeclarations: [
                { name: "x", description: "", parameters: {} },
              ],
            },
          ],
        }),
      ).rejects.toThrow(/cachedContent is incompatible with tools/);
    });

    it("generate throws when cachedContent is set alongside systemPrompt", async () => {
      await expect(() =>
        generate({
          model: GEMINI_MODELS.flash,
          contents: "x",
          cachedContent: "caches/abc",
          systemPrompt: "hi",
        }),
      ).rejects.toThrow(/cachedContent is incompatible with systemPrompt/);
    });

    it("generateStream throws when cachedContent is set alongside tools", async () => {
      await expect(() =>
        generateStream({
          model: GEMINI_MODELS.flash,
          contents: [],
          cachedContent: "caches/abc",
          tools: [
            {
              functionDeclarations: [
                { name: "x", description: "", parameters: {} },
              ],
            },
          ],
        }),
      ).rejects.toThrow(/cachedContent is incompatible with tools/);
    });

    it("generate accepts cachedContent alone (tools live inside the cache)", async () => {
      // The SDK call would reach the network and fail here without a real
      // API key, but the guard runs before any SDK call. We assert the
      // failure mode is anything OTHER than the conflict-guard error.
      await expect(
        generate({
          model: GEMINI_MODELS.flash,
          contents: "x",
          cachedContent: "caches/abc",
        }),
      ).rejects.not.toThrow(/cachedContent is incompatible/);
    });

    it("empty tools array is treated as 'no tools' and does not conflict", async () => {
      await expect(
        generate({
          model: GEMINI_MODELS.flash,
          contents: "x",
          cachedContent: "caches/abc",
          tools: [],
        }),
      ).rejects.not.toThrow(/cachedContent is incompatible/);
    });
  });

  describe("echoModelParts", () => {
    it("wraps parts in a model turn preserving references", () => {
      const parts = [{ text: "hi" }, { functionCall: { name: "x", args: {} } }];
      const turn = echoModelParts(parts);
      expect(turn.role).toBe("model");
      expect(turn.parts).toBe(parts); // same reference — preserves thoughtSignature fields
    });

    it("throws if parts is undefined or empty", () => {
      expect(() => echoModelParts(undefined)).toThrow(/no parts/);
      expect(() => echoModelParts([])).toThrow(/no parts/);
    });
  });
});
