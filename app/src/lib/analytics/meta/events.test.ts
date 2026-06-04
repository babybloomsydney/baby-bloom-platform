/**
 * metaContentCategory — the single parent/nanny differentiator. Maps the user
 * role to the Meta content_category tag (or null for non-audience roles).
 */
import { describe, it, expect } from "vitest";
import { metaContentCategory } from "./events";

describe("metaContentCategory", () => {
  it("maps parent → parent", () => {
    expect(metaContentCategory("parent")).toBe("parent");
  });

  it("maps nanny → nanny", () => {
    expect(metaContentCategory("nanny")).toBe("nanny");
  });

  it("returns null for admin / unknown roles (no conversion fired)", () => {
    expect(metaContentCategory("admin")).toBeNull();
    expect(metaContentCategory("")).toBeNull();
    expect(metaContentCategory("something")).toBeNull();
  });
});
