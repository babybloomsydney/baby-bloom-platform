"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { displayName, displayFullName } from "@/lib/auth/display-name";
import { UserAvatar } from "@/components/dashboard/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PublicHeaderProps {
  onMenuClick?: () => void;
}

export function PublicHeader({ onMenuClick }: PublicHeaderProps) {
  const { user, profile, role, signOut } = useAuth();

  const fullName = displayFullName(profile, user);
  const firstName = displayName(profile, user);

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-white px-4 lg:px-6">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle menu</span>
      </Button>

      {/* Mobile logo */}
      <Link
        href="/"
        className="flex items-center gap-0.5 text-xl font-bold lg:hidden"
      >
        <span className="text-slate-900">Baby</span>
        <span className="text-violet-500">Bloom</span>
      </Link>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Auth buttons or user menu */}
      <div className="flex items-center gap-2">
        {user ? (
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
                    {role}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link
                  href={
                    role === "nanny"
                      ? "/nanny"
                      : role === "parent"
                        ? "/parent"
                        : "/admin/dashboard"
                  }
                >
                  Dashboard
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={signOut} className="cursor-pointer">
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <>
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild className="bg-violet-500 hover:bg-violet-600">
              <Link href="/signup">Sign Up</Link>
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
