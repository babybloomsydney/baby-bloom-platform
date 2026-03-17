import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@/lib/auth/types';

const ROLE_DASHBOARDS: Record<UserRole, string> = {
  nanny: '/nanny',
  parent: '/parent',
  admin: '/admin/dashboard',
  super_admin: '/admin/dashboard',
};

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next');
  const origin = requestUrl.origin;

  if (code) {
    const supabase = createClient();

    // Exchange the code for a session
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // If a specific redirect was requested (e.g. password reset), go there
      if (next) {
        return NextResponse.redirect(new URL(next, origin));
      }

      // Otherwise, redirect to the user's dashboard
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .single();

        if (roleData?.role) {
          const dashboardPath = ROLE_DASHBOARDS[roleData.role as UserRole];
          return NextResponse.redirect(new URL(dashboardPath, origin));
        } else {
          return NextResponse.redirect(new URL('/signup', origin));
        }
      }
    }
  }

  // Error or no code - redirect to login with error
  return NextResponse.redirect(new URL('/login?error=auth_failed', origin));
}
