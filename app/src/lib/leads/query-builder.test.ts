// T-032 — Unit tests for the leads URLSearchParams parser + filter builder.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  buildFilterOps,
  buildSortSpec,
  paginationRange,
  parseLeadQueryState,
  serialiseLeadQueryState,
} from "./query-builder";

describe("parseLeadQueryState", () => {
  it("returns sane defaults for empty input", () => {
    const state = parseLeadQueryState(new URLSearchParams());
    expect(state.filters.tab).toBe("all");
    expect(state.filters.wwcc).toBe("any");
    expect(state.filters.gov_id).toBe("any");
    expect(state.filters.photo).toBe("any");
    expect(state.filters.abn).toBe("any");
    expect(state.filters.level).toEqual([]);
    expect(state.filters.contributions).toBe("any");
    expect(state.filters.status).toEqual([]);
    expect(state.filters.suburb).toBeNull();
    expect(state.filters.responded).toBe("any");
    expect(state.filters.search).toBeNull();
    expect(state.sort).toBe("signup_newest");
    expect(state.page).toBe(1);
    expect(state.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("parses each tri-state verification filter", () => {
    const sp = new URLSearchParams("wwcc=has&gov_id=missing&photo=any&abn=has");
    const state = parseLeadQueryState(sp);
    expect(state.filters.wwcc).toBe("has");
    expect(state.filters.gov_id).toBe("missing");
    expect(state.filters.photo).toBe("any");
    expect(state.filters.abn).toBe("has");
  });

  it("falls back to 'any' for unknown tri-state values", () => {
    const sp = new URLSearchParams("wwcc=bogus");
    const state = parseLeadQueryState(sp);
    expect(state.filters.wwcc).toBe("any");
  });

  it("parses level multi-select", () => {
    const sp = new URLSearchParams("level=0,2,4");
    const state = parseLeadQueryState(sp);
    expect(state.filters.level).toEqual([0, 2, 4]);
  });

  it("drops invalid level values silently", () => {
    const sp = new URLSearchParams("level=0,99,foo,4");
    const state = parseLeadQueryState(sp);
    expect(state.filters.level).toEqual([0, 4]);
  });

  it("parses contributions complete/incomplete/any", () => {
    expect(
      parseLeadQueryState(new URLSearchParams("contributions=complete")).filters
        .contributions,
    ).toBe("complete");
    expect(
      parseLeadQueryState(new URLSearchParams("contributions=incomplete"))
        .filters.contributions,
    ).toBe("incomplete");
    expect(
      parseLeadQueryState(new URLSearchParams("contributions=garbage")).filters
        .contributions,
    ).toBe("any");
  });

  it("parses status multi-select and drops unknown values", () => {
    const sp = new URLSearchParams("status=untouched,foo,activated,dormant");
    const state = parseLeadQueryState(sp);
    // T-032b: "activated" is now a valid lead_status (kept); only "foo" is unknown.
    expect(state.filters.status).toEqual(["untouched", "activated", "dormant"]);
  });

  it("caps search input to 100 chars", () => {
    const big = "x".repeat(500);
    const state = parseLeadQueryState(new URLSearchParams(`search=${big}`));
    expect(state.filters.search?.length).toBe(100);
  });

  it("treats whitespace-only search as null", () => {
    const state = parseLeadQueryState(new URLSearchParams("search=   "));
    expect(state.filters.search).toBeNull();
  });

  it("clamps page < 1 to 1", () => {
    const state = parseLeadQueryState(new URLSearchParams("page=-5"));
    expect(state.page).toBe(1);
  });

  it("validates page_size against the choice list", () => {
    expect(
      parseLeadQueryState(new URLSearchParams("page_size=25")).pageSize,
    ).toBe(25);
    expect(
      parseLeadQueryState(new URLSearchParams("page_size=50")).pageSize,
    ).toBe(50);
    expect(
      parseLeadQueryState(new URLSearchParams("page_size=100")).pageSize,
    ).toBe(100);
    // Unknown values fall back to default.
    expect(
      parseLeadQueryState(new URLSearchParams("page_size=37")).pageSize,
    ).toBe(DEFAULT_PAGE_SIZE);
  });

  it("accepts a record-shaped searchParams object as well as URLSearchParams", () => {
    const state = parseLeadQueryState({
      tab: "cold_7d",
      wwcc: "has",
      page: "3",
    });
    expect(state.filters.tab).toBe("cold_7d");
    expect(state.filters.wwcc).toBe("has");
    expect(state.page).toBe(3);
  });
});

describe("serialiseLeadQueryState", () => {
  it("round-trips defaults to an empty querystring", () => {
    const state = parseLeadQueryState(new URLSearchParams());
    const params = serialiseLeadQueryState(state);
    expect(params.toString()).toBe("");
  });

  it("serialises non-default values only", () => {
    const state = parseLeadQueryState(
      new URLSearchParams("wwcc=has&abn=missing&page=2&level=3,4"),
    );
    const params = serialiseLeadQueryState(state);
    const out = params.toString();
    expect(out).toContain("wwcc=has");
    expect(out).toContain("abn=missing");
    expect(out).toContain("page=2");
    expect(out).toContain("level=3%2C4");
  });
});

describe("buildFilterOps", () => {
  it("emits no ops for the default state", () => {
    const state = parseLeadQueryState(new URLSearchParams());
    expect(buildFilterOps(state)).toEqual([]);
  });

  it("emits an `eq true` op for `wwcc=has`", () => {
    const state = parseLeadQueryState(new URLSearchParams("wwcc=has"));
    const ops = buildFilterOps(state);
    expect(ops).toContainEqual({
      column: "verifications.wwcc_verified",
      op: "eq",
      value: true,
    });
  });

  it("emits a `not_is true` op for `wwcc=missing`", () => {
    const state = parseLeadQueryState(new URLSearchParams("wwcc=missing"));
    const ops = buildFilterOps(state);
    expect(ops).toContainEqual({
      column: "verifications.wwcc_verified",
      op: "not_is",
      value: true,
    });
  });

  it("emits `is null` op for photo=missing", () => {
    const state = parseLeadQueryState(new URLSearchParams("photo=missing"));
    const ops = buildFilterOps(state);
    expect(ops).toContainEqual({
      column: "user_profiles.profile_picture_url",
      op: "is",
      value: null,
    });
  });

  it("emits an `in` op for level multi-select", () => {
    const state = parseLeadQueryState(new URLSearchParams("level=3,4"));
    const ops = buildFilterOps(state);
    expect(ops).toContainEqual({
      column: "verification_level",
      op: "in",
      value: [3, 4],
    });
  });

  it("emits derived responded hint", () => {
    const state = parseLeadQueryState(new URLSearchParams("responded=yes"));
    const ops = buildFilterOps(state);
    expect(ops).toContainEqual({
      column: "__derived_responded__",
      op: "eq",
      value: true,
    });
  });

  it("emits search ilike across name/email/mobile", () => {
    const state = parseLeadQueryState(new URLSearchParams("search=alice"));
    const ops = buildFilterOps(state);
    const searchOp = ops.find((o) => o.op === "or_ilike_any");
    expect(searchOp).toBeDefined();
    expect(searchOp?.value).toMatchObject({
      columns: ["first_name", "last_name", "email", "mobile_number"],
      pattern: "alice",
    });
  });

  it("stacks multiple verification filters as AND", () => {
    const state = parseLeadQueryState(
      new URLSearchParams("wwcc=has&abn=missing&contributions=incomplete"),
    );
    const ops = buildFilterOps(state);
    expect(ops.length).toBe(3);
  });
});

describe("buildSortSpec", () => {
  it("maps signup_newest", () => {
    expect(buildSortSpec("signup_newest")).toEqual({
      column: "created_at",
      ascending: false,
    });
  });

  it("maps last_contact_recent with foreign-table reference", () => {
    expect(buildSortSpec("last_contact_recent")).toEqual({
      column: "last_contact_at",
      ascending: false,
      nullsFirst: false,
      foreignTable: "nanny_contact_state",
    });
  });

  it("maps next_action_soonest with nulls-last semantics", () => {
    const spec = buildSortSpec("next_action_soonest");
    expect(spec.column).toBe("next_action_at");
    expect(spec.ascending).toBe(true);
    expect(spec.nullsFirst).toBe(false);
  });
});

describe("paginationRange", () => {
  it("calculates range for page 1", () => {
    const state = parseLeadQueryState(new URLSearchParams());
    const range = paginationRange(state);
    expect(range).toEqual({ from: 0, to: 49 });
  });

  it("calculates range for page 3 with size 25", () => {
    const state = parseLeadQueryState(
      new URLSearchParams("page=3&page_size=25"),
    );
    const range = paginationRange(state);
    expect(range).toEqual({ from: 50, to: 74 });
  });
});
