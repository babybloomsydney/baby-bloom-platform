import { NextRequest, NextResponse } from 'next/server';
import { createAdminPosition, listAdminPositions } from '@/lib/actions/admin-positions';

export const dynamic = 'force-dynamic';

function authorize(req: NextRequest): boolean {
  const token = process.env.ADMIN_API_TOKEN;
  if (!token) return false;
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${token}`;
}

// GET /api/positions — List admin/AI positions
export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? 'all';
  const source = url.searchParams.get('source') ?? 'all';
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

  const result = await listAdminPositions({ status, source, limit, offset });

  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    positions: result.positions,
    total: result.total,
    limit,
    offset,
  });
}

// POST /api/positions — Create a new admin/AI position
export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = await createAdminPosition(body as Parameters<typeof createAdminPosition>[0]);

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    position_id: result.position_id,
    public_url: result.public_url,
  }, { status: 201 });
}
