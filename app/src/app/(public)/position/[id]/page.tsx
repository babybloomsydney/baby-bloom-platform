import { getPublicPositionProfile } from "@/lib/actions/matching";
import { PositionJobView } from "./PositionJobView";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONNECTION_STAGE } from "@/lib/position/constants";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const { data: position } = await getPublicPositionProfile(params.id);

  if (!position) {
    return { title: "Job Not Found | Baby Bloom Sydney" };
  }

  const suburb = position.suburb ?? "Sydney";
  const isAdmin = position.source && position.source !== 'parent';
  const familyLabel = isAdmin
    ? position.parentFirstName
    : `The ${position.parentLastName ?? position.parentFirstName} family`;
  const title = `${familyLabel} is looking for a nanny | apply now`;
  const daysStr = position.daysRequired?.join(", ") ?? "";
  const hoursStr = position.hoursPerWeek ? `${position.hoursPerWeek} hrs/wk.` : "";
  const description = [
    `Nanny needed in ${suburb}.`,
    daysStr ? `${daysStr}.` : "",
    hoursStr,
    "Apply on Baby Bloom Sydney.",
  ].filter(Boolean).join(" ");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://app-babybloom.vercel.app";
  const ogImageUrl = `${siteUrl}/api/og/position/${params.id}`;
  const pageUrl = `${siteUrl}/position/${params.id}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: pageUrl,
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    other: {
      "fb:app_id": "4009164676060901",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function PositionPublicPage({
  params,
}: {
  params: { id: string };
}) {
  const { data: position, error } = await getPublicPositionProfile(params.id);

  if (error || !position) {
    notFound();
  }

  // Check if logged-in nanny has already applied
  let alreadyApplied = false;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const admin = createAdminClient();
    const { data: nanny } = await admin
      .from('nannies')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (nanny) {
      const { data: existing } = await admin
        .from('connection_requests')
        .select('id')
        .eq('nanny_id', nanny.id)
        .eq('position_id', params.id)
        .eq('connection_stage', CONNECTION_STAGE.NANNY_APPLIED)
        .limit(1);

      alreadyApplied = !!(existing && existing.length > 0);
    }
  }

  return <PositionJobView position={position} alreadyApplied={alreadyApplied} />;
}
