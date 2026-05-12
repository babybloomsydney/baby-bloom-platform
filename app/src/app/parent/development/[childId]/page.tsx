import { getFeed } from "@/lib/actions/bapp/feed";
import { getMilestones } from "@/lib/actions/bapp/milestones";
import { getOnboardingBannerStatus } from "@/lib/actions/bapp/onboarding-banner";
import { BAppFeedView } from "@/components/bapp/BAppFeedView";
import { PreloadPublisher } from "@/components/preload/PreloadPublisher";
import { PRELOAD_RECENT_FEED_CAP } from "@/lib/chat/preload/predicates";
import { requireChildFamilyAccess } from "@/lib/payments/access-gate";

export default async function ParentDevelopmentFeedPage({
  params,
}: {
  params: { childId: string };
}) {
  const [feedRes, milestonesRes, bannerStatus, access] = await Promise.all([
    getFeed(params.childId),
    getMilestones(),
    getOnboardingBannerStatus(),
    // UX-FIX-PLAN FIX-7 — sibling banner + empty-state must not
    // contradict each other on lapsed/cancelled states.
    requireChildFamilyAccess(params.childId),
  ]);

  return (
    <>
      {/* Latency:Efficiency build, WU8 — see the parallel comment
          on the nanny development page for rationale. */}
      <PreloadPublisher
        slots={{
          children_recent_feeds: [
            {
              child_id: params.childId,
              items: (feedRes.data ?? []).slice(0, PRELOAD_RECENT_FEED_CAP),
            },
          ],
        }}
      />
      <BAppFeedView
        childId={params.childId}
        initialFeed={feedRes.data}
        milestones={milestonesRes.data}
        bannerStatus={bannerStatus}
        familyHasAccess={access.hasAccess}
      />
    </>
  );
}
