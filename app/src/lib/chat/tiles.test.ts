import { describe, it, expect } from "vitest";
import { isChatTile, readPersistedTile, type ChatTile } from "./tiles";

describe("isChatTile", () => {
  it("accepts a valid katie_note tile", () => {
    const tile: ChatTile = {
      kind: "katie_note",
      data: { body: "Reminder: Obie's dentist appointment is tomorrow." },
    };
    expect(isChatTile(tile)).toBe(true);
  });

  it("accepts katie_note with optional fields", () => {
    const tile: ChatTile = {
      kind: "katie_note",
      data: {
        badge: "Reminder",
        title: "Dentist tomorrow",
        body: "Oliver has a dentist appointment at 10am.",
        action: { label: "Add to calendar", href: "/calendar" },
      },
    };
    expect(isChatTile(tile)).toBe(true);
  });

  it("rejects null / undefined / primitives", () => {
    expect(isChatTile(null)).toBe(false);
    expect(isChatTile(undefined)).toBe(false);
    expect(isChatTile("foo")).toBe(false);
    expect(isChatTile(42)).toBe(false);
  });

  it("rejects tile with missing kind", () => {
    expect(isChatTile({ data: { body: "x" } })).toBe(false);
  });

  it("rejects tile with unknown kind", () => {
    expect(isChatTile({ kind: "bsr_job", data: { id: "whatever" } })).toBe(
      false,
    );
  });

  it("rejects katie_note with empty body", () => {
    expect(isChatTile({ kind: "katie_note", data: { body: "" } })).toBe(false);
  });

  it("rejects katie_note missing body", () => {
    expect(isChatTile({ kind: "katie_note", data: { title: "t" } })).toBe(
      false,
    );
  });
});

describe("readPersistedTile", () => {
  it("returns null for null", () => {
    expect(readPersistedTile(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(readPersistedTile(undefined)).toBeNull();
  });

  it("returns null for malformed shapes without throwing", () => {
    expect(readPersistedTile({ kind: "not_a_real_kind" })).toBeNull();
    expect(readPersistedTile("string")).toBeNull();
    expect(readPersistedTile([])).toBeNull();
  });

  it("returns the tile for a valid katie_note", () => {
    const tile = { kind: "katie_note", data: { body: "hello" } };
    expect(readPersistedTile(tile)).toEqual(tile);
  });
});
