'use client';

import Link from 'next/link';
import { MapPin, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trackEvent } from '@/lib/analytics/trackEvent';

interface NannyProfileTileProps {
  firstName: string;
  lastName: string;
  profilePictureUrl: string | null;
  suburb: string;
  verificationLevel: number;
  aiHeadline: string | null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

export function NannyProfileTile({
  firstName,
  lastName,
  profilePictureUrl,
  suburb,
  verificationLevel,
  aiHeadline,
}: NannyProfileTileProps) {
  const fullName = `${firstName} ${lastName}`.trim();
  const initials = `${firstName[0] || ''}${lastName[0] || ''}`;
  const isVerified = verificationLevel >= 3;
  const bio = aiHeadline ? stripHtml(aiHeadline) : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden hover:shadow-lg hover:border-violet-200 transition-all">
      {/* Violet gradient header strip */}
      <div className="h-14 bg-gradient-to-br from-violet-100 to-violet-50" />

      {/* Avatar overlapping header */}
      <div className="flex flex-col items-center -mt-10 px-5">
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-4 border-white shadow-md overflow-hidden">
            {profilePictureUrl ? (
              <img
                src={profilePictureUrl}
                alt={fullName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-violet-50 text-violet-300 text-2xl font-bold flex items-center justify-center">
                {initials}
              </div>
            )}
          </div>

          {/* Verified badge overlay */}
          {isVerified && (
            <div className="absolute bottom-0 right-0 w-6 h-6 bg-green-500 rounded-full ring-2 ring-white flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="px-5 pb-5 mt-3">
        {/* Name */}
        <h3 className="text-xl font-bold text-slate-900 text-center">
          {fullName}
        </h3>

        {/* Suburb */}
        <div className="flex items-center justify-center gap-1 mt-0.5">
          <MapPin className="w-4 h-4 text-slate-500" />
          <span className="text-sm text-slate-500">{suburb}</span>
        </div>

        {/* Bio */}
        {bio && (
          <p className="text-sm text-slate-600 line-clamp-3 mt-2 leading-relaxed text-center">
            {bio}
          </p>
        )}

        {/* CTA Button */}
        <Link href="/nanny/profile" className="block mt-4">
          <Button
            className="w-full bg-violet-600 hover:bg-violet-700 text-white h-10 font-medium"
            onClick={() => {
              trackEvent({
                event_name: 'nanny_hub_profile_tile_clicked',
                user_role: 'nanny',
              });
            }}
          >
            View Profile
          </Button>
        </Link>
      </div>
    </div>
  );
}
