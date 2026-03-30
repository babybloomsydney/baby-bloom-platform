"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { BarChart3, Users, Calendar, TrendingUp, Activity, Briefcase, UserCheck, Globe, Eye, MousePointer, Loader2 } from "lucide-react";

interface AnalyticsData {
  totalUsers: number;
  totalNannies: number;
  totalParents: number;
  totalAdmins: number;
  signupsThisWeek: number;
  signupsLastWeek: number;
  signupTrend: number;
  signupTrendIsPositive: boolean;
  pendingVerifications: number;
  tier2Nannies: number;
  tier3Nannies: number;
  verificationRate: number;
  activeNannies: number;
  inactiveNannies: number;
  activeParents: number;
  totalPlacements: number;
  activePlacements: number;
  endedPlacements: number;
  interviewsThisMonth: number;
  activePositions: number;
  totalPageViews: number;
  pageViewsThisWeek: number;
  pageViewsToday: number;
  uniqueVisitors: number;
  topPages: { path: string; count: number }[];
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="mt-2 text-red-500">Failed to load analytics: {error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="mt-1 text-slate-500">
          Platform metrics and insights
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatsCard icon={Users} value={data.totalUsers} label="Total Users" iconColor="text-violet-500" iconBgColor="bg-violet-100" />
        <StatsCard icon={Calendar} value={data.interviewsThisMonth} label="Interviews This Month" iconColor="text-blue-500" iconBgColor="bg-blue-100" />
        <StatsCard icon={TrendingUp} value={data.totalPlacements} label="Total Placements" iconColor="text-green-500" iconBgColor="bg-green-100" />
        <StatsCard icon={Briefcase} value={data.activePositions} label="Open Positions" iconColor="text-yellow-500" iconBgColor="bg-yellow-100" />
      </div>

      {/* Web Traffic */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatsCard icon={Globe} value={data.totalPageViews} label="Total Page Views" iconColor="text-violet-500" iconBgColor="bg-violet-100" />
        <StatsCard icon={Eye} value={data.uniqueVisitors} label="Unique Visitors" iconColor="text-blue-500" iconBgColor="bg-blue-100" />
        <StatsCard icon={MousePointer} value={data.pageViewsThisWeek} label="Views This Week" iconColor="text-green-500" iconBgColor="bg-green-100" />
        <StatsCard icon={Activity} value={data.pageViewsToday} label="Views Today" iconColor="text-yellow-500" iconBgColor="bg-yellow-100" />
      </div>

      {/* Top Pages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-violet-500" />
            Top Pages
          </CardTitle>
          <CardDescription>Most visited pages (recent activity)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.topPages.map((page, i) => (
              <div key={page.path} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-400 w-5 text-right">{i + 1}</span>
                  <span className="text-sm text-slate-700 font-mono">{page.path}</span>
                </div>
                <span className="text-sm font-medium text-slate-900">{page.count}</span>
              </div>
            ))}
            {data.topPages.length === 0 && (
              <p className="text-sm text-slate-400">No page view data yet</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Signup Trends */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-violet-500" />
            Signup Trends
          </CardTitle>
          <CardDescription>Weekly comparison of new user registrations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border bg-slate-50 p-4">
              <p className="text-sm text-slate-500">This Week</p>
              <p className="text-3xl font-bold text-slate-900">{data.signupsThisWeek}</p>
            </div>
            <div className="rounded-lg border bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Last Week</p>
              <p className="text-3xl font-bold text-slate-900">{data.signupsLastWeek}</p>
            </div>
            <div className="rounded-lg border bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Week-over-Week</p>
              <p className={`text-3xl font-bold ${data.signupTrendIsPositive ? 'text-green-600' : 'text-red-600'}`}>
                {data.signupTrendIsPositive ? '+' : ''}{data.signupTrend}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Section */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-violet-500" />
              User Growth
            </CardTitle>
            <CardDescription>New user registrations over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-lg bg-slate-50">
              <div className="text-center">
                <BarChart3 className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-4 text-sm text-slate-500">Chart coming soon</p>
                <p className="text-xs text-slate-400">User growth trends will appear here</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-violet-500" />
              Platform Activity
            </CardTitle>
            <CardDescription>Daily active users and interactions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-lg bg-slate-50">
              <div className="text-center">
                <BarChart3 className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-4 text-sm text-slate-500">Chart coming soon</p>
                <p className="text-xs text-slate-400">Activity metrics will appear here</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Stats */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-violet-500" />
              Nanny Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Total Nannies</span><span className="font-medium">{data.totalNannies}</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Active Nannies</span><span className="font-medium">{data.activeNannies}</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Tier 2 Verified</span><span className="font-medium">{data.tier2Nannies}</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Tier 3 Verified</span><span className="font-medium">{data.tier3Nannies}</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Verification Rate</span><span className="font-medium">{data.verificationRate}%</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              Parent Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Total Parents</span><span className="font-medium">{data.totalParents}</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Active Parents</span><span className="font-medium">{data.activeParents}</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Open Positions</span><span className="font-medium">{data.activePositions}</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Interviews Requested</span><span className="font-medium">{data.interviewsThisMonth}</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Avg. Hire Time</span><span className="font-medium text-slate-400">-</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-green-500" />
              Matching Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Total Placements</span><span className="font-medium">{data.totalPlacements}</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Active Placements</span><span className="font-medium">{data.activePlacements}</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Ended Placements</span><span className="font-medium">{data.endedPlacements}</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Pending Verifications</span><span className="font-medium">{data.pendingVerifications}</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Avg. Match Score</span><span className="font-medium text-slate-400">-</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Coming Soon */}
      <Card className="border-violet-200 bg-violet-50">
        <CardHeader>
          <CardTitle className="text-violet-900">Advanced Analytics Coming Soon</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm text-violet-800 sm:grid-cols-2">
            <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-violet-500" />Conversion funnel analysis</li>
            <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-violet-500" />Cohort retention reports</li>
            <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-violet-500" />Geographic heat maps</li>
            <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-violet-500" />Revenue forecasting</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
