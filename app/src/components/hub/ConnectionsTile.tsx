'use client';

import Link from 'next/link';
import { Users, Heart, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trackEvent } from '@/lib/analytics/trackEvent';

export interface ConnectedNanny {
  nannyId: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  suburb: string | null;
}

interface ConnectionsTileProps {
  connectionsCount: number;
  connectedNannies: ConnectedNanny[];  // max 3 for display
  placement: ConnectedNanny | null;    // active placement (hired nanny)
}

export function ConnectionsTile({ connectionsCount, connectedNannies, placement }: ConnectionsTileProps) {
  // Helper to get initials
  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  // Helper to format name (First + Last initial)
  const formatName = (firstName: string, lastName: string) => {
    return `${firstName} ${lastName.charAt(0)}.`;
  };

  // Has active placement
  if (placement) {
    return (
      <div className="rounded-2xl border border-l-4 border-l-green-400 bg-white shadow-sm hover:shadow-lg hover:border-violet-200 transition-all p-6">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">My Nanny</h3>
          <Heart className="w-5 h-5 text-green-400" fill="currentColor" />
        </div>

        {/* Placed nanny mini card */}
        <div className="flex items-center gap-3 mb-4">
          {placement.photoUrl ? (
            <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-green-100">
              <img
                src={placement.photoUrl}
                alt={`${placement.firstName} ${placement.lastName}`}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-violet-100 text-violet-500 font-semibold text-sm flex items-center justify-center ring-2 ring-green-100">
              {getInitials(placement.firstName, placement.lastName)}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <p className="font-medium text-slate-900">
              {formatName(placement.firstName, placement.lastName)}
            </p>
            {placement.suburb && (
              <p className="text-sm text-slate-500">{placement.suburb}</p>
            )}
          </div>
        </div>

        {/* CTA */}
        <Button
          asChild
          className="w-full bg-violet-600 hover:bg-violet-700 text-white"
          onClick={() => trackEvent({ event_name: 'connections_tile_view_placement_clicked' })}
        >
          <Link href="/parent">
            View Connection
          </Link>
        </Button>
      </div>
    );
  }

  // Has connections (no placement)
  if (connectionsCount > 0 && connectedNannies.length > 0) {
    const displayNannies = connectedNannies.slice(0, 3);
    const remainingCount = connectionsCount - displayNannies.length;

    return (
      <div className="rounded-2xl border bg-white shadow-sm hover:shadow-lg hover:border-violet-200 transition-all p-6">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center">
            <Users className="w-4 h-4 text-violet-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 flex-1">Connections</h3>
          <span className="bg-violet-100 text-violet-600 text-sm font-medium rounded-full px-2 py-0.5">
            {connectionsCount}
          </span>
        </div>

        {/* Avatar stack */}
        <div className="flex items-center mb-3">
          <div className="flex -space-x-2">
            {displayNannies.map((nanny) => (
              <div key={nanny.nannyId} className="relative">
                {nanny.photoUrl ? (
                  <div className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-white">
                    <img
                      src={nanny.photoUrl}
                      alt={`${nanny.firstName} ${nanny.lastName}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-full bg-violet-100 text-violet-500 font-semibold text-sm flex items-center justify-center ring-2 ring-white">
                    {getInitials(nanny.firstName, nanny.lastName)}
                  </div>
                )}
              </div>
            ))}
          </div>

          {remainingCount > 0 && (
            <span className="ml-2 text-sm text-slate-500 font-medium">
              +{remainingCount} more
            </span>
          )}
        </div>

        {/* Names list */}
        <p className="text-sm text-slate-600 mb-4 line-clamp-1">
          {displayNannies.map((nanny, idx) => (
            <span key={nanny.nannyId}>
              {formatName(nanny.firstName, nanny.lastName)}
              {idx < displayNannies.length - 1 && ', '}
            </span>
          ))}
        </p>

        {/* CTA */}
        <Button
          asChild
          className="w-full bg-violet-600 hover:bg-violet-700 text-white"
          onClick={() => trackEvent({ event_name: 'connections_tile_view_all_clicked', metadata: { count: connectionsCount } })}
        >
          <Link href="/parent/connections">
            View All
          </Link>
        </Button>
      </div>
    );
  }

  // Empty state (no connections)
  return (
    <div className="rounded-2xl border border-dashed bg-slate-50/50 shadow-sm hover:shadow-lg hover:border-violet-200 transition-all p-6 flex flex-col items-center text-center">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
        <Users className="w-6 h-6 text-slate-300" />
      </div>

      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        No Connections Yet
      </h3>

      <p className="text-sm text-slate-500 mb-4">
        Browse our verified nannies and start connecting
      </p>

      {/* CTA */}
      <Button
        asChild
        className="w-full bg-violet-600 hover:bg-violet-700 text-white"
        onClick={() => trackEvent({ event_name: 'connections_tile_browse_clicked' })}
      >
        <Link href="/parent/browse" className="flex items-center justify-center gap-2">
          Browse Nannies
          <ArrowRight className="w-4 h-4" />
        </Link>
      </Button>
    </div>
  );
}
