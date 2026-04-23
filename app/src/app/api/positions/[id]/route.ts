import { NextRequest, NextResponse } from 'next/server';
import { getAdminPosition, updateAdminPosition, closeAdminPosition } from '@/lib/actions/admin-positions';

export const dynamic = 'force-dynamic';

function authorize(req: NextRequest): boolean {
  const token = process.env.ADMIN_API_TOKEN;
  if (!token) return false;
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${token}`;
}

// GET /api/positions/[id] — Get single position
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!authorize(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const result = await getAdminPosition(id);

  if (result.error || !result.position) {
    return NextResponse.json({ success: false, error: result.error ?? 'Position not found' }, { status: 404 });
  }

  return NextResponse.json({ position: result.position });
}

// PATCH /api/positions/[id] — Update position
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!authorize(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = await updateAdminPosition(id, body as Parameters<typeof updateAdminPosition>[1]);

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, position_id: result.position_id });
}

// DELETE /api/positions/[id] — Close position (soft delete)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!authorize(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const result = await closeAdminPosition(id);

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, position_id: id, status: 'cancelled' });
}
