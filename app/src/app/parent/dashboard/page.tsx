"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ClipboardList, Calendar, Eye, Search, Heart, Baby, MessageSquare, ShieldAlert, ArrowRight } from "lucide-react";

export default function ParentDashboardPage() {
  const { profile, isLoading } = useAuth();
  const [verificationLevel, setVerificationLevel] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/parent-verification-status")
      .then((res) => res.json())
      .then((data) => {
        if (data.status !== null && data.status !== undefined) {
          setVerificationLevel(data.status >= 20 ? 1 : 0);
        } else {
          setVerificationLevel(0);
        }
      })
      .catch(() => setVerificationLevel(0));
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome, {profile?.first_name || "there"}!
        </h1>
        <p className="mt-1 text-slate-500">
          Find the perfect nanny for your family.
        </p>
      </div>

      {/* Verification Banner */}
      {verificationLevel === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">Verify your identity to start connecting with nannies</p>
              <p className="text-xs text-amber-600 mt-0.5">Quick verification with your passport or driver&apos;s license</p>
            </div>
          </div>
          <Button asChild size="sm" className="bg-violet-600 hover:bg-violet-700 text-white flex-shrink-0">
            <Link href="/parent/verification" className="flex items-center gap-1">
              Verify Now <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          icon={ClipboardList}
          value="No Position"
          label="Active Position"
          iconColor="text-violet-500"
          iconBgColor="bg-violet-100"
        />
        <StatsCard
          icon={Calendar}
          value="0"
          label="Interviews Scheduled"
          iconColor="text-blue-500"
          iconBgColor="bg-blue-100"
        />
        <StatsCard
          icon={Eye}
          value="0"
          label="Nannies Viewed"
          iconColor="text-green-500"
          iconBgColor="bg-green-100"
        />
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Quick Actions</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/parent/browse">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
                  <Search className="h-6 w-6 text-violet-500" />
                </div>
                <div>
                  <h3 className="font-medium">Browse Nannies</h3>
                  <p className="text-sm text-slate-500">Find your match</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/parent">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
                  <Heart className="h-6 w-6 text-violet-500" />
                </div>
                <div>
                  <h3 className="font-medium">Create Position</h3>
                  <p className="text-sm text-slate-500">Post your needs</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/parent/babysitting">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
                  <Baby className="h-6 w-6 text-violet-500" />
                </div>
                <div>
                  <h3 className="font-medium">Babysitting</h3>
                  <p className="text-sm text-slate-500">One-time care</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/parent/interviews">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
                  <MessageSquare className="h-6 w-6 text-violet-500" />
                </div>
                <div>
                  <h3 className="font-medium">Interviews</h3>
                  <p className="text-sm text-slate-500">View scheduled</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your latest updates and interactions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-slate-500">No recent activity to show</p>
            <p className="mt-1 text-xs text-slate-400">
              Start by browsing nannies or creating a position
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
