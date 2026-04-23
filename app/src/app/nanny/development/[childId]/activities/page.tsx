import { getActivities } from "@/lib/actions/bapp/activities-feed";
import { getMilestones } from "@/lib/actions/bapp/milestones";
import { BAppActivitiesView } from "@/components/bapp/BAppActivitiesView";

export default async function ActivitiesPage({
  params,
}: {
  params: { childId: string };
}) {
  const [result, milestonesResult] = await Promise.all([
    getActivities(params.childId, null, 20),
    getMilestones(),
  ]);

  return (
    <BAppActivitiesView
      childId={params.childId}
      initialItems={result.data}
      initialCursor={result.nextCursor}
      milestones={milestonesResult.data ?? []}
    />
  );
}
