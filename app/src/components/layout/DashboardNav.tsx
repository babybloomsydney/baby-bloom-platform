"use client";

import Link from "next/link";
import { Baby, Bell, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/dashboard/UserAvatar";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trackEvent } from "@/lib/analytics/trackEvent";

interface DashboardNavProps {
  role: "nanny" | "parent";
}

export function DashboardNav({ role }: DashboardNavProps) {
  const { profile, role: authRole, signOut } = useAuth();

  const fullName = profile
    ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
    : "";
  const firstName = profile?.first_name || "User";

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-white px-4 lg:px-6">
      {/* Left: Logo → hub */}
      <Link
        href={`/${role}`}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        onClick={() =>
          trackEvent({ event_name: "logo_clicked", user_role: role })
        }
      >
        <Baby className="h-7 w-7 text-violet-500" />
        <span className="text-xl font-bold">
          <span className="text-slate-900">Baby</span>
          <span className="text-violet-500">Bloom</span>
        </span>
      </Link>

      {/* Right: Bell + Avatar dropdown.
          A-07: KatieSwapButton was removed. The new top-tab strip
          (rendered by KatieShell above the carousel viewport in
          narrow widths) is now the swap control. */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative" asChild>
          <Link
            href={`/${role}/inbox`}
            onClick={() =>
              trackEvent({
                event_name: "notifications_bell_clicked",
                user_role: role,
              })
            }
          >
            <Bell className="h-5 w-5" />
            <span className="sr-only">Notifications</span>
          </Link>
        </Button>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <UserAvatar
                name={fullName || firstName}
                imageUrl={profile?.profile_picture_url || undefined}
                className="h-8 w-8"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {fullName || firstName}
                </p>
                <p className="text-xs leading-none text-muted-foreground capitalize">
                  {authRole}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link
                href={`/${role}/settings`}
                onClick={() =>
                  trackEvent({
                    event_name: "settings_clicked",
                    user_role: role,
                  })
                }
              >
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => {
                trackEvent({ event_name: "sign_out_clicked", user_role: role });
                signOut();
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
