import { createAdminClient } from "@/lib/supabase/admin";

export default async function ProfileOGTagsTest() {
  const adminClient = createAdminClient();

  // Look up user by email → nanny ID
  const { data: profile } = await adminClient
    .from("user_profiles")
    .select("user_id")
    .eq("email", "baileywright.eu@gmail.com")
    .single();

  let nannyId: string | null = null;
  if (profile) {
    const { data: nanny } = await adminClient
      .from("nannies")
      .select("id")
      .eq("user_id", profile.user_id)
      .single();
    nannyId = nanny?.id ?? null;
  }

  if (!nannyId) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500 font-medium">Could not find nanny for baileywright.eu@gmail.com</p>
      </div>
    );
  }

  const ogUrl = `/api/og/nanny/${nannyId}`;
  const ogV2Url = `/api/og/nanny-v2/${nannyId}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-slate-800">OG Image Test</h1>
      <p className="text-sm text-slate-500">Nanny ID: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">{nannyId}</code></p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Current */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Old (v1)</h2>
          <div className="border border-slate-200 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ogUrl} alt="OG v1" className="w-full" />
          </div>
          <p className="text-xs text-slate-400 break-all">
            <a href={ogUrl} target="_blank" className="text-violet-500 hover:underline">{ogUrl}</a>
          </p>
        </div>

        {/* V2 */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Current (v2)</h2>
          <div className="border border-slate-200 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ogV2Url} alt="OG v2" className="w-full" />
          </div>
          <p className="text-xs text-slate-400 break-all">
            <a href={ogV2Url} target="_blank" className="text-violet-500 hover:underline">{ogV2Url}</a>
          </p>
        </div>
      </div>
    </div>
  );
}
