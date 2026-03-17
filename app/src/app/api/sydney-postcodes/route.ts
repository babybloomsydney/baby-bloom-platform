import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Cache the response for 24 hours (194 rows, tiny payload)
export const revalidate = 86400;

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('sydney_postcodes')
    .select('suburb, postcode')
    .order('suburb');

  if (error) {
    console.error('[sydney-postcodes] Error:', error);
    return NextResponse.json([], { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
