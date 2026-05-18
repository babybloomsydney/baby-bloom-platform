import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { displayName, displayFullName } from "./display-name";

function user(
  overrides: { email?: string; metadata?: Record<string, unknown> } = {},
): User {
  return {
    id: "u1",
    email: overrides.email,
    user_metadata: overrides.metadata ?? {},
    app_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  } as unknown as User;
}

describe("displayName", () => {
  it("prefers profile.first_name when set", () => {
    expect(
      displayName(
        { first_name: "Alice" },
        user({ email: "fallback@example.com" }),
      ),
    ).toBe("Alice");
  });

  it("trims whitespace on profile.first_name", () => {
    expect(displayName({ first_name: "  Alice  " }, user())).toBe("Alice");
  });

  it("falls back to user_metadata.first_name when profile is null", () => {
    expect(displayName(null, user({ metadata: { first_name: "Bob" } }))).toBe(
      "Bob",
    );
  });

  it("falls back to user_metadata.first_name when profile.first_name is empty", () => {
    expect(
      displayName(
        { first_name: "" },
        user({ metadata: { first_name: "Bob" } }),
      ),
    ).toBe("Bob");
  });

  it("falls back to capitalised email local-part when no first_name anywhere", () => {
    expect(displayName(null, user({ email: "carla@example.com" }))).toBe(
      "Carla",
    );
  });

  it("returns 'User' as last resort when nothing is available", () => {
    expect(displayName(null, user())).toBe("User");
    expect(displayName(null, null)).toBe("User");
  });

  it("ignores non-string metadata values", () => {
    expect(
      displayName(
        null,
        user({
          metadata: { first_name: 42 as unknown as string },
          email: "fallback@example.com",
        }),
      ),
    ).toBe("Fallback");
  });
});

describe("displayFullName", () => {
  it("joins first + last when both present", () => {
    expect(
      displayFullName({ first_name: "Alice", last_name: "Smith" }, user()),
    ).toBe("Alice Smith");
  });

  it("returns just first when last is missing", () => {
    expect(
      displayFullName({ first_name: "Alice", last_name: "" }, user()),
    ).toBe("Alice");
  });

  it("falls back to displayName() when both are empty", () => {
    expect(
      displayFullName(
        { first_name: "", last_name: "" },
        user({ email: "carla@example.com" }),
      ),
    ).toBe("Carla");
  });
});
