import { describe, it, expect } from "vitest";
import { mergePreloads } from "./merge";
import type { PreloadedContext } from "./types";

const t = "2026-05-09T10:00:00Z";

const child = (id: string, first_name: string) => ({
  child_id: id,
  profile: {
    id,
    first_name,
    date_of_birth: "2024-01-01",
    gender: null,
    under_three: true,
    status: "active" as const,
  },
});

describe("mergePreloads", () => {
  it("returns undefined when both inputs are undefined", () => {
    expect(
      mergePreloads({ client: undefined, server: undefined }),
    ).toBeUndefined();
  });

  it("returns server when client is undefined", () => {
    const server: PreloadedContext = {
      as_of: t,
      my_profile_basics: { first_name: "Emma", last_name: null, role: "nanny" },
    };
    const out = mergePreloads({ client: undefined, server });
    expect(out?.my_profile_basics?.first_name).toBe("Emma");
  });

  it("client wins per-child on children_profiles overlap", () => {
    const client: PreloadedContext = {
      as_of: t,
      children_profiles: [child("c1", "Oliver-FROM-CLIENT")],
    };
    const server: PreloadedContext = {
      as_of: t,
      children_profiles: [
        child("c1", "Oliver-FROM-SERVER"),
        child("c2", "Lily-FROM-SERVER"),
      ],
    };
    const out = mergePreloads({ client, server });
    expect(out?.children_profiles).toHaveLength(2);
    const oliver = out?.children_profiles?.find((p) => p.child_id === "c1");
    const lily = out?.children_profiles?.find((p) => p.child_id === "c2");
    expect(oliver?.profile.first_name).toBe("Oliver-FROM-CLIENT");
    expect(lily?.profile.first_name).toBe("Lily-FROM-SERVER");
  });

  it("client wins per-child on children_recent_feeds overlap", () => {
    const client: PreloadedContext = {
      as_of: t,
      children_recent_feeds: [
        { child_id: "c1", items: [{ id: "client-item" } as never] },
      ],
    };
    const server: PreloadedContext = {
      as_of: t,
      children_recent_feeds: [
        { child_id: "c1", items: [{ id: "server-item" } as never] },
        { child_id: "c2", items: [{ id: "lily-item" } as never] },
      ],
    };
    const out = mergePreloads({ client, server });
    const c1 = out?.children_recent_feeds?.find((f) => f.child_id === "c1");
    const c2 = out?.children_recent_feeds?.find((f) => f.child_id === "c2");
    expect((c1?.items[0] as { id: string }).id).toBe("client-item");
    expect((c2?.items[0] as { id: string }).id).toBe("lily-item");
  });

  it("server wins on singleton slots (my_placement, my_jobs, etc.)", () => {
    const client: PreloadedContext = {
      as_of: t,
      my_placement: {
        placement_id: "client-pl",
        summary: { partner_name: "X", started_at: t, role: "nanny" },
      },
    };
    const server: PreloadedContext = {
      as_of: t,
      my_placement: {
        placement_id: "server-pl",
        summary: { partner_name: "Y", started_at: t, role: "nanny" },
      },
    };
    const out = mergePreloads({ client, server });
    expect(out?.my_placement?.placement_id).toBe("server-pl");
  });

  it("falls back to client singleton when server doesn't have it", () => {
    const client: PreloadedContext = {
      as_of: t,
      my_placement: {
        placement_id: "client-only",
        summary: { partner_name: "X", started_at: t, role: "parent" },
      },
    };
    const server: PreloadedContext = { as_of: t };
    const out = mergePreloads({ client, server });
    expect(out?.my_placement?.placement_id).toBe("client-only");
  });

  it("picks the freshest as_of timestamp", () => {
    const old = "2026-05-09T09:00:00Z";
    const fresh = "2026-05-09T10:00:00Z";
    const out = mergePreloads({
      client: {
        as_of: old,
        my_profile_basics: { first_name: "A", last_name: null, role: "nanny" },
      },
      server: { as_of: fresh },
    });
    expect(out?.as_of).toBe(fresh);
  });

  it("returns undefined when both inputs are empty (no slots)", () => {
    expect(
      mergePreloads({ client: { as_of: t }, server: { as_of: t } }),
    ).toBeUndefined();
  });
});
