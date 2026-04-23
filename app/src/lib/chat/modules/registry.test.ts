import { describe, it, expect } from "vitest";
import {
  getActiveModules,
  collectTools,
  findToolHandler,
  collectProactiveTriggers,
} from "./registry";

describe("module registry", () => {
  describe("getActiveModules", () => {
    it("returns all Phase 1 modules when no role given", () => {
      const mods = getActiveModules();
      const ids = mods.map((m) => m.id);
      expect(ids).toContain("child-profile");
      expect(ids).toContain("feed");
    });

    it("returns modules for nanny role", () => {
      const mods = getActiveModules("nanny");
      expect(mods.length).toBeGreaterThan(0);
    });

    it("returns modules for parent role", () => {
      const mods = getActiveModules("parent");
      expect(mods.length).toBeGreaterThan(0);
    });

    it("returns modules for admin role", () => {
      const mods = getActiveModules("admin");
      expect(mods.length).toBeGreaterThan(0);
    });
  });

  describe("collectTools", () => {
    it("flattens tools from all active modules", () => {
      const tools = collectTools();
      expect(tools.length).toBeGreaterThan(0);
      const names = tools.map((t) => t.name);
      expect(names).toContain("read_child_profile");
      expect(names).toContain("read_recent_feed");
    });

    it("tool names are globally unique", () => {
      const names = collectTools().map((t) => t.name);
      const uniq = new Set(names);
      expect(uniq.size).toBe(names.length);
    });
  });

  describe("findToolHandler", () => {
    it("finds the right module for a known tool", () => {
      expect(findToolHandler("read_child_profile")?.id).toBe("child-profile");
      expect(findToolHandler("read_recent_feed")?.id).toBe("feed");
    });

    it("returns null for an unknown tool", () => {
      expect(findToolHandler("nonexistent_tool")).toBeNull();
    });
  });

  describe("collectProactiveTriggers", () => {
    it("returns empty in Phase 1 (triggers added in Phase 2)", () => {
      expect(collectProactiveTriggers()).toEqual([]);
    });
  });
});
