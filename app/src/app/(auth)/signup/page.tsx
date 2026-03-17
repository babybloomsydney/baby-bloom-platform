"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  // Clear any stale session when user lands on auth page
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.signOut();
  }, []);
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Create an account</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Choose your account type to get started
        </p>
      </div>

      <div className="grid gap-4">
        <Link href="/apply/nanny" className="block">
          <Card className="hover:border-primary hover:shadow-md transition-all cursor-pointer group">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Heart className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Apply as a childcare professional</CardTitle>
                  <CardDescription>
                    Join Baby Bloom and get matched with families
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>- Create your professional profile</li>
                <li>- Get matched with local families</li>
                <li>- Manage your availability</li>
              </ul>
            </CardContent>
          </Card>
        </Link>

        <Link href="/signup/parent" className="block">
          <Card className="hover:border-primary hover:shadow-md transition-all cursor-pointer group">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">I&apos;m a Parent</CardTitle>
                  <CardDescription>
                    Find the perfect nanny for your family
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>- Browse verified nanny profiles</li>
                <li>- See availability calendars</li>
                <li>- Request interviews easily</li>
              </ul>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="text-center text-sm">
        <span className="text-muted-foreground">Already have an account? </span>
        <Link href="/login" className="text-primary font-medium hover:underline">
          Sign in
        </Link>
      </div>
    </div>
  );
}
