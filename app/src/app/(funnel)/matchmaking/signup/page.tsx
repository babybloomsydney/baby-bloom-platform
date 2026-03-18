import { redirect } from 'next/navigation';
import { runPreAuthMatching } from '@/lib/matching/pre-auth';
import { MatchmakingSignupClient } from './MatchmakingSignupClient';

interface Props {
  searchParams: Promise<{ lead?: string }>;
}

export default async function MatchmakingSignupPage({ searchParams }: Props) {
  const { lead } = await searchParams;

  if (!lead) {
    redirect('/matchmaking/onboarding');
  }

  // Fetch match data for context banner
  const { matches, totalEligible } = await runPreAuthMatching(lead);
  const topMatch = matches[0] ?? null;

  const matchSummary = topMatch
    ? {
        totalEligible,
        topMatchName: topMatch.profile.first_name,
        topMatchSuburb: topMatch.profile.suburb,
        topMatchScore: topMatch.finalScore,
        topMatchPhoto: topMatch.profile.profile_picture_url,
      }
    : null;

  return (
    <MatchmakingSignupClient
      leadId={lead}
      matchSummary={matchSummary}
    />
  );
}
