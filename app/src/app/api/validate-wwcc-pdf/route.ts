import { NextRequest, NextResponse } from 'next/server';
import { verifyWWCCPdf } from '@/lib/ai/verify-wwcc-pdf';

/**
 * Lightweight instant PDF validation endpoint.
 * No auth, no DB writes — just parses the PDF and returns results.
 * Used for client-side instant feedback on grant email uploads.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const surname = (formData.get('surname') as string) ?? '';
    const givenNames = (formData.get('given_names') as string) ?? '';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Server-side file type check — catches anything that bypasses client-side accept attribute
    if (file.type !== 'application/pdf' && !file.name?.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({
        pass: false,
        needsAIFallback: false,
        issues: ['This doesn\u2019t look like a PDF. Please save your grant email as a PDF first (Print \u2192 Save as PDF), then upload it here.'],
        extracted: null,
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await verifyWWCCPdf(buffer, {
      surname,
      given_names: givenNames,
      wwcc_number: '', // No submitted number for grant email uploads
    });

    return NextResponse.json({
      pass: result.pass,
      needsAIFallback: result.needsAIFallback,
      extracted: result.extracted,
      issues: result.issues,
      reasoning: result.reasoning,
    });
  } catch (error) {
    console.error('[validate-wwcc-pdf] Error:', error);
    return NextResponse.json(
      { error: 'Failed to validate PDF', pass: false, needsAIFallback: true },
      { status: 500 }
    );
  }
}
