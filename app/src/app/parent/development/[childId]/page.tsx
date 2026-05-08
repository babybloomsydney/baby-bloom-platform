import { getFeed } from "@/lib/actions/bapp/feed";
import { getMilestones } from "@/lib/actions/bapp/milestones";
import { getOnboardingBannerStatus } from "@/lib/actions/bapp/onboarding-banner";
import { BAppFeedView } from "@/components/bapp/BAppFeedView";

export default async function ParentDevelopmentFeedPage({
  params,
}: {
  params: { childId: string };
}) {
  const [feedRes, milestonesRes, bannerStatus] = await Promise.all([
    getFeed(params.childId),
    getMilestones(),
    getOnboardingBannerStatus(),
  ]);

  return (
    <BAppFeedView
      childId={params.childId}
      initialFeed={feedRes.data}
      milestones={milestonesRes.data}
      bannerStatus={bannerStatus}
    />
  );
}
