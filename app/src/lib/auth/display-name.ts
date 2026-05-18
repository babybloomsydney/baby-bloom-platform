import type { User } from "@supabase/supabase-js";
import type { UserProfile } from "./types";

// Why: the header avatar + dropdown used to fall back to the literal string
// "User" whenever `profile.first_name` was missing (or the profile hadn't
// finished fetching). That made the launch surface read as "User" with a
// generic "U" initial avatar for real users — Bailey 2026-05-18 smoke.
//
// The signup action writes `first_name` to both `user_profiles` AND
// `auth.users.user_metadata`, so the metadata source is available before
// the DB fetch completes. If neither survived, fall back to the email
// local-part (capitalised). "User" remains as the last-resort string
// only when we're truly looking at an unauthenticated render.

export function displayName(
  profile: Pick<UserProfile, "first_name"> | null,
  user: User | null,
): string {
  const fromProfile = trimmed(profile?.first_name);
  if (fromProfile) return fromProfile;

  const fromMetadata = trimmed(
    typeof user?.user_metadata?.first_name === "string"
      ? user.user_metadata.first_name
      : null,
  );
  if (fromMetadata) return fromMetadata;

  const fromEmail = emailLocalPart(user?.email);
  if (fromEmail) return capitalise(fromEmail);

  return "User";
}

export function displayFullName(
  profile: Pick<UserProfile, "first_name" | "last_name"> | null,
  user: User | null,
): string {
  const first = trimmed(profile?.first_name);
  const last = trimmed(profile?.last_name);
  if (first || last) return [first, last].filter(Boolean).join(" ");

  // The profile arg already satisfies the narrower Pick<"first_name"> shape
  // displayName expects, so pass it through instead of allocating a new slice.
  return displayName(profile, user);
}

function trimmed(s: string | null | undefined): string {
  return typeof s === "string" ? s.trim() : "";
}

function emailLocalPart(email: string | undefined): string {
  if (!email) return "";
  const at = email.indexOf("@");
  if (at <= 0) return "";
  return email.slice(0, at);
}

function capitalise(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
