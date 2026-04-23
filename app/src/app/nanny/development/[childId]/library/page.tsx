import { getLibraryImages } from "@/lib/actions/bapp/library";
import { getMilestones } from "@/lib/actions/bapp/milestones";
import { BAppLibraryView } from "@/components/bapp/BAppLibraryView";
import type { Milestone } from "@/types/bapp";

export default async function LibraryPage({
  params,
}: {
  params: { childId: string };
}) {
  const [result, milestonesResult] = await Promise.all([
    getLibraryImages(params.childId, null, 12),
    getMilestones(),
  ]);

  const milestoneMap = new Map<string, Milestone>();
  for (const m of milestonesResult.data ?? []) {
    milestoneMap.set(m.id, m);
  }

  return (
    <BAppLibraryView
      childId={params.childId}
      initialImages={result.data}
      initialCursor={result.nextCursor}
      milestoneMap={milestoneMap}
    />
  );
}
