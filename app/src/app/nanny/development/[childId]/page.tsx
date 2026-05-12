import { getFeed } from "@/lib/actions/bapp/feed";
import { getMilestones } from "@/lib/actions/bapp/milestones";
import { getOnboardingBannerStatus } from "@/lib/actions/bapp/onboarding-banner";
import { BAppFeedView } from "@/components/bapp/BAppFeedView";
import { PreloadPublisher } from "@/components/preload/PreloadPublisher";
import { PRELOAD_RECENT_FEED_CAP } from "@/lib/chat/preload/predicates";
import { requireChildFamilyAccess } from "@/lib/payments/access-gate";

export default async function DevelopmentFeedPage({
  params,
}: {
  params: { childId: string };
}) {
  const [feedRes, milestonesRes, bannerStatus, access] = await Promise.all([
    getFeed(params.childId),
    getMilestones(),
    getOnboardingBannerStatus(),
    // UX-FIX-PLAN FIX-7 — surface the family-access gate to the
    // feed view so the empty-state can be suppressed when the
    // sibling LapsedBanner is doing the talking.
    requireChildFamilyAccess(params.childId),
  ]);

  return (
    <>
      {/* Latency:Efficiency build, WU8 — publish the recent feed
          slice into PreloadContext so KatieDeck can ship it on the
          next chat turn. Capped at 10 to match the always-on
          builder's per-child cap (`PRELOAD_RECENT_FEED_CAP`).
          children_profiles is intentionally NOT published here:
          the server-side always-on builder already covers it for
          all accessible children, and adding a child-profile fetch
          just for the publisher would add a round-trip with no
          freshness gain on a read-only page. */}
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
