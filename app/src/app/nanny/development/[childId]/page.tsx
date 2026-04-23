import { getFeed } from "@/lib/actions/bapp/feed";
import { getMilestones } from "@/lib/actions/bapp/milestones";
import { BAppFeedView } from "@/components/bapp/BAppFeedView";

export default async function DevelopmentFeedPage({
  params,
}: {
  params: { childId: string };
}) {
  const [feedRes, milestonesRes] = await Promise.all([
    getFeed(params.childId),
    getMilestones(),
  ]);

  return (
    <BAppFeedView
      childId={params.childId}
      initialFeed={feedRes.data}
      milestones={milestonesRes.data}
    />
  );
}
