import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const visitSchema = z.object({
  visitor_id: z.string().min(1).max(100),
  page_path: z.string().min(1).max(500),
  referrer: z.string().max(2000).nullable().optional(),
  utm_source: z.string().max(200).optional(),
  utm_medium: z.string().max(200).optional(),
  utm_campaign: z.string().max(200).optional(),
  utm_content: z.string().max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = visitSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from('page_visits').insert({
      visitor_id: parsed.data.visitor_id,
      page_path: parsed.data.page_path,
      referrer: parsed.data.referrer || null,
      ...(parsed.data.utm_source && { utm_source: parsed.data.utm_source }),
      ...(parsed.data.utm_medium && { utm_medium: parsed.data.utm_medium }),
      ...(parsed.data.utm_campaign && { utm_campaign: parsed.data.utm_campaign }),
      ...(parsed.data.utm_content && { utm_content: parsed.data.utm_content }),
    });

    if (error) {
      console.error('[visit-track] insert error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
