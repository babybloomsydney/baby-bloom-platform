import { describe, it, expect, vi } from "vitest";
import { applyDraft } from "./apply";
import type { ChildSummary } from "@/lib/chat/modules/types";

function makeCtx(
  insertMock = vi.fn().mockResolvedValue({
    data: { id: "log-9" },
    error: null,
  }),
) {
  const supabase = {
    from: vi.fn(() => ({
      insert: () => ({
        select: () => ({
          single: () => insertMock(),
        }),
      }),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const children: ChildSummary[] = [
    {
      id: "c1",
      firstName: "Oliver",
      ageMonths: 14,
      ageBracket: "12-18 months",
      gender: "male",
    },
  ];
  return { supabase, children, insertMock };
}

describe("applyDraft", () => {
  it("dispatches log_food to applyLogFood", async () => {
    const { supabase, children, insertMock } = makeCtx();
    const r = await applyDraft(
      "log_food",
      { meal_type: "breakfast", items: ["banana"] },
      null,
      { userId: "u-1", children, supabase },
    );
    expect(r.ok).toBe(true);
    expect(insertMock).toHaveBeenCalled();
  });

  it("dispatches log_sleep to applyLogSleep", async () => {
    const { supabase, children, insertMock } = makeCtx();
    const r = await applyDraft("log_sleep", { duration_minutes: 45 }, null, {
      userId: "u-1",
      children,
      supabase,
    });
    expect(r.ok).toBe(true);
    expect(insertMock).toHaveBeenCalled();
  });

  it("merges imageUrl into args before applying", async () => {
    const { supabase, children, insertMock } = makeCtx();
    const r = await applyDraft(
      "log_food",
      { meal_type: "snack", items: ["apple"] },
      "https://example.com/apple.jpg",
      { userId: "u-1", children, supabase },
    );
    expect(r.ok).toBe(true);
    expect(insertMock).toHaveBeenCalled();
    if (r.ok) {
      const d = (
        r.tile.kind === "diary" ? r.tile.data.item.data : null
      ) as Record<string, unknown> | null;
      expect(d?.image_url).toBe("https://example.com/apple.jpg");
    }
  });

  it("clears image_url when imageUrl is null", async () => {
    // mergeImageUrl(args, null) deletes image_url from args. The
    // module's prepareFood then writes image_url: null into the
    // canonical FoodData (the DB sentinel for "no image"). Verify
    // the persisted shape ends up with image_url === null, not
    // the previous URL.
    const { supabase, children } = makeCtx();
    const r = await applyDraft(
      "log_food",
      {
        meal_type: "snack",
        items: ["apple"],
        image_url: "https://example.com/old.jpg",
      },
      null,
      { userId: "u-1", children, supabase },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const d = (
        r.tile.kind === "diary" ? r.tile.data.item.data : null
      ) as Record<string, unknown> | null;
      expect(d?.image_url).toBeNull();
    }
  });

  it("returns an error for unknown toolName", async () => {
    const { supabase, children } = makeCtx();
    const r = await applyDraft("log_unknown", {}, null, {
      userId: "u-1",
      children,
      supabase,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/Unknown draft toolName/);
    }
  });
});
