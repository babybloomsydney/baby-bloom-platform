"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type LegalPolicyDocument = {
  body_md: string | null;
  version: number;
  effective_date: string;
};

/**
 * Fetch the highest-version body for a legal-document slug from
 * `legal_documents`. Server-side: uses the admin client to bypass RLS.
 * Called by `PolicyModal` on open to render the body_md inline in a
 * Dialog. Lives behind a `'use server'` boundary so `createAdminClient`
 * stays out of client chunks.
 *
 * Returns `null` when the slug is unknown or the read errors.
 */
export async function getPolicyMarkdown(
  slug: string,
): Promise<LegalPolicyDocument | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("legal_documents")
      .select("body_md, version, effective_date")
      .eq("document_id", slug)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle<LegalPolicyDocument>();
    if (error || !data) return null;
    return data;
  } catch (err) {
    console.error("[getPolicyMarkdown] failed for slug=" + slug + ":", err);
    return null;
  }
}
