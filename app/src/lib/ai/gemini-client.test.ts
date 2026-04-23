import { describe, it, expect } from "vitest";
import {
  echoModelParts,
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
