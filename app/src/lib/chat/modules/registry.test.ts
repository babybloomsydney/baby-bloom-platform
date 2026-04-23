import { describe, it, expect } from "vitest";
import {
  getActiveModules,
  collectTools,
  findToolHandler,
  collectProactiveTriggers,
} from "./registry";

describe("module registry", () => {
  describe("getActiveModules", () => {
    it("returns all currently registered modules when no role given", () => {
      const mods = getActiveModules();
      const ids = mods.map((m) => m.id);
      expect(ids).toContain("child-profile");
      expect(ids).toContain("feed");
      expect(ids).toContain("progress");
      expect(ids).toContain("diary");
      expect(ids).toContain("observations");
      expect(ids).toContain("activities");
      expect(ids).toContain("feed-writer");
      expect(ids).toContain("agent-memory");
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
      expect(names).toContain("read_milestones");
      expect(names).toContain("read_progress_history");
      expect(names).toContain("update_progress");
      expect(names).toContain("log_food");
      expect(names).toContain("log_sleep");
      expect(names).toContain("log_observation");
      expect(names).toContain("plan_activity");
      expect(names).toContain("create_tile");
      expect(names).toContain("delete_tile");
      expect(names).toContain("write_memory");
      expect(names).toContain("read_memory");
      expect(names).toContain("update_memory");
      expect(names).toContain("delete_memory");
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
      expect(findToolHandler("read_milestones")?.id).toBe("progress");
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
