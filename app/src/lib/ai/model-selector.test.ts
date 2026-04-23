import { describe, it, expect } from "vitest";
import {
  selectGeminiModel,
  resolveEffectiveRole,
  GEMINI_MODELS,
} from "./model-selector";

describe("selectGeminiModel", () => {
  it("returns Flash for nanny", () => {
    expect(selectGeminiModel("nanny")).toBe(GEMINI_MODELS.flash);
  });

  it("returns Flash for parent", () => {
    expect(selectGeminiModel("parent")).toBe(GEMINI_MODELS.flash);
  });

  it("returns Pro for admin", () => {
    expect(selectGeminiModel("admin")).toBe(GEMINI_MODELS.pro);
  });
});

describe("resolveEffectiveRole", () => {
  it("returns actual role when no effective role set", () => {
    expect(resolveEffectiveRole("admin")).toBe("admin");
    expect(resolveEffectiveRole("nanny")).toBe("nanny");
  });

  it("returns actual role when effective role is null/empty", () => {
    expect(resolveEffectiveRole("admin", null)).toBe("admin");
    expect(resolveEffectiveRole("admin", "")).toBe("admin");
  });

  it("ignores effective role for non-admin users (safety)", () => {
    expect(resolveEffectiveRole("nanny", "parent")).toBe("nanny");
    expect(resolveEffectiveRole("parent", "admin")).toBe("parent");
  });

  it("admin can simulate nanny", () => {
    expect(resolveEffectiveRole("admin", "nanny")).toBe("nanny");
  });

  it("admin can simulate parent", () => {
    expect(resolveEffectiveRole("admin", "parent")).toBe("parent");
  });

  it('admin effective role of "admin" is a no-op', () => {
    expect(resolveEffectiveRole("admin", "admin")).toBe("admin");
  });

  it("invalid effective role values fall back to actual role", () => {
    expect(resolveEffectiveRole("admin", "invalid")).toBe("admin");
    expect(resolveEffectiveRole("admin", "super_admin")).toBe("admin");
  });
});
