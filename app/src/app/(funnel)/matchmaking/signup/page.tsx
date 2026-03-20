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

  const topPhotos = matches
    .slice(0, 3)
    .map((m) => ({
      url: m.profile.profile_picture_url,
      initial: m.profile.first_name?.[0]?.toUpperCase() ?? "?",
    }));

  const matchSummary = topMatch
    ? {
        totalEligible,
        topPhotos,
      }
    : null;

  return (
    <MatchmakingSignupClient
      leadId={lead}
      matchSummary={matchSummary}
    />
  );
}
