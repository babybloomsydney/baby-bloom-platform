import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { visitor_id, consent_choice, analytics_enabled, marketing_enabled } = body;

    if (!visitor_id || !consent_choice) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Try to get authenticated user (may be null for visitors)
    let userId: string | null = null;
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id || null;
    } catch {
      // Not authenticated, that's fine
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const userAgent = request.headers.get('user-agent') || null;

    const adminClient = createAdminClient();
    const { error } = await adminClient.from('cookie_consent_records').insert({
      visitor_id,
      user_id: userId,
      consent_choice,
      analytics_enabled: analytics_enabled || false,
      marketing_enabled: marketing_enabled || false,
      ip_address: ip,
      user_agent: userAgent,
      expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    if (error) {
      console.error('Cookie consent record error:', error);
      return NextResponse.json({ error: 'Failed to record' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Cookie consent API error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
