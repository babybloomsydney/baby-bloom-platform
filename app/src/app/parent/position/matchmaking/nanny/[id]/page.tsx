import { getPublicNannyProfile } from "@/lib/actions/nanny";
import { NannyProfileView } from "@/app/(public)/nannies/[id]/NannyProfileView";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default async function MatchmakingNannyProfilePage({
  params,
}: {
  params: { id: string };
}) {
  const { data: nanny, error } = await getPublicNannyProfile(params.id);

  if (error || !nanny) {
    notFound();
  }

  return (
    <div>
      <Link
        href="/parent"
        className="inline-flex items-center gap-1 text-sm text-violet-600 hover:text-violet-700 mb-4 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to matchmaking
      </Link>

      <NannyProfileView
        nanny={nanny}
        isActiveNanny={true}
      />
    </div>
  );
}
