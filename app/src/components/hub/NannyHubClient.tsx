'use client';

import { useEffect } from 'react';
import { Award, Briefcase } from 'lucide-react';
import { NannyProfileTile } from '@/components/hub/NannyProfileTile';
import { HubTile } from '@/components/hub/HubTile';
import { VerificationBanner } from '@/components/hub/VerificationBanner';
import { trackEvent } from '@/lib/analytics/trackEvent';

interface NannyHubClientProps {
  firstName: string;
  lastName: string;
  profilePictureUrl: string | null;
  suburb: string;
  verificationLevel: number;
  visibleInBsr: boolean;
  aiHeadline: string | null;
  shareStatus: number;
  connectionsCount: number;
  bsrCount: number;
}

export function NannyHubClient({
  firstName,
  lastName,
  profilePictureUrl,
  suburb,
  verificationLevel,
  visibleInBsr,
  aiHeadline,
  shareStatus,
  connectionsCount,
  bsrCount,
}: NannyHubClientProps) {
  const isVerified = verificationLevel >= 3;
  const isShareCompleted = visibleInBsr || shareStatus >= 50;

  useEffect(() => {
    trackEvent({ event_name: 'nanny_hub_viewed', user_role: 'nanny' });
  }, []);

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <h1 className="text-2xl font-bold text-slate-900">
        Welcome back, {firstName}!
      </h1>

      {/* Verification Banner */}
      {!isVerified && (
        <VerificationBanner
          role="nanny"
          message="Complete your verification to start receiving connections and appearing in matchmaking"
          submessage="Upload your WWCC and passport to get verified"
        />
      )}

      {/* Profile Tile — full width */}
      <NannyProfileTile
        firstName={firstName}
        lastName={lastName}
        profilePictureUrl={profilePictureUrl}
        suburb={suburb}
        verificationLevel={verificationLevel}
        aiHeadline={aiHeadline}
      />

      {/* Tiles Grid */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2">
        {/* Positions Tile */}
        <HubTile
          title="Your Positions"
          icon={<Award className="h-5 w-5" />}
          status={isVerified ? (connectionsCount > 0 ? 'active' : 'empty') : 'locked'}
          lockedMessage="Complete verification to start receiving position connections from families."
          emptyMessage="No active positions yet. Once families match with you, they'll appear here."
          preview={
            <p className="text-sm text-slate-600">
              <span className="text-2xl font-bold text-violet-600">{connectionsCount}</span>{' '}
              active connection{connectionsCount !== 1 ? 's' : ''}
            </p>
          }
          primaryCTA={
            isVerified
              ? { label: 'View Positions', href: '/nanny/positions', trackingEvent: 'positions_tile_clicked' }
              : { label: 'Complete Verification', href: '/nanny/verification', trackingEvent: 'positions_tile_locked_cta_clicked' }
          }
          className="rounded-2xl hover:shadow-lg hover:border-violet-200 transition-all"
        />

        {/* Babysitting Tile */}
        <HubTile
          title="Babysitting"
          icon={<Briefcase className="h-5 w-5" />}
          status={isShareCompleted ? (bsrCount > 0 ? 'active' : 'empty') : 'locked'}
          lockedMessage="Share your profile to unlock babysitting job notifications."
          emptyMessage="No babysitting notifications yet. Jobs from nearby families will appear here."
          preview={
            <p className="text-sm text-slate-600">
              <span className="text-2xl font-bold text-violet-600">{bsrCount}</span>{' '}
              new notification{bsrCount !== 1 ? 's' : ''}
            </p>
          }
          primaryCTA={
            isShareCompleted
              ? { label: 'View Babysitting', href: '/nanny/babysitting', trackingEvent: 'babysitting_tile_clicked' }
              : { label: 'Unlock Babysitting', href: '/nanny/share', trackingEvent: 'babysitting_tile_locked_cta_clicked' }
          }
          className="rounded-2xl hover:shadow-lg hover:border-violet-200 transition-all"
        />
      </div>
    </div>
  );
}
