import { openai } from './client';
import type { UserGuidance } from '@/lib/verification';

export interface WWCCVerificationResult {
  pass: boolean;
  extracted: {
    surname: string | null;
    first_name: string | null;
    other_names: string | null;
    wwcc_number: string | null;
    clearance_type: string | null;
    expiry: string | null;
  };
  reasoning: string;
  issues: string[];
  user_guidance?: UserGuidance | null;
}

const WWCC_GRANT_EMAIL_PROMPT = `You are a document verification specialist for Working With Children Check (WWCC) grants in New South Wales, Australia.

You are analysing a PDF or image of a WWCC grant notification email from the NSW Office of the Children's Guardian (OCG).

Follow these verification steps:

1. DOCUMENT AUTHENTICITY: Check if this looks like a genuine OCG notification email:
   - Should reference "Office of the Children's Guardian" or "NSW Government"
   - Should contain a WWCC clearance number in format WWC + 7 digits + 1 letter (e.g. WWC1234567A)
   - Should mention "Working With Children Check" or "WWCC"
   - Should have a clearance/grant decision

2. DATA EXTRACTION: Extract these fields:
   - Surname (family name)
   - First name
   - Other names (if present)
   - WWCC number (format: WWC + 7 digits + 1 capital letter)
   - Clearance type (e.g. "Paid" or "Volunteer" or "Both")
   - Expiry date (format as YYYY-MM-DD)

3. NAME MATCHING: Compare extracted name to submitted name. Flag if completely different. Allow minor variations.

4. NUMBER MATCHING: If a submitted WWCC number is provided, compare it to the extracted number — must match exactly. If no submitted number is provided, just extract and validate the format.

5. EXPIRY CHECK: Check the expiry date. WWCCs are typically valid for 5 years.
   - If expiry date is less than 3 months from today (${new Date().toISOString().split('T')[0]}), flag as FAIL with issue "WWCC expires within 3 months"
   - If already expired, flag as FAIL

6. FINAL ASSESSMENT: Determine pass/fail based on:
   PASS: Document appears genuine, name matches, number matches, not expired/expiring soon
   FAIL: Document looks fake/edited, names don't match, number doesn't match, expired or expiring within 3 months

Respond with ONLY valid JSON:
{
  "pass": true/false,
  "extracted": {
    "surname": "...",
    "first_name": "...",
    "other_names": "..." or null,
    "wwcc_number": "WWC...",
    "clearance_type": "...",
    "expiry": "YYYY-MM-DD"
  },
  "reasoning": "Step-by-step reasoning...",
  "issues": ["issue 1", "issue 2"],
  "user_guidance": null
}

IMPORTANT: When "pass" is false, you MUST provide "user_guidance":
{
  "user_guidance": {
    "title": "Short friendly summary of the problem",
    "explanation": "One sentence explaining what went wrong.",
    "steps_to_fix": ["Step 1", "Step 2", "Step 3"]
  }
}

When "pass" is true, set "user_guidance" to null.`;

const WWCC_SERVICE_NSW_PROMPT = `You are a document verification specialist for Working With Children Check (WWCC) in New South Wales, Australia.

You are analysing a screenshot from the Service NSW app showing a WWCC digital card/wallet entry.

Follow these verification steps:

1. DOCUMENT AUTHENTICITY: Check if this looks like a genuine Service NSW app screenshot:
   - Should show Service NSW app interface
   - Should display a WWCC card or credential
   - Should contain a clearance number
   - Should show validity/expiry information

2. DATA EXTRACTION: Extract these fields:
   - Surname (family name)
   - First name
   - Other names (if present)
   - WWCC number (format: WWC + 7 digits + 1 capital letter)
   - Clearance type (e.g. "Paid" or "Volunteer" or "Both")
   - Expiry date (format as YYYY-MM-DD)

3. NAME MATCHING: Compare extracted name to submitted name. Flag if completely different. Allow minor variations.

4. NUMBER MATCHING: If a submitted WWCC number is provided, compare it to the extracted number — must match exactly. If no submitted number is provided, just extract and validate the format.

5. EXPIRY CHECK: Check the expiry date.
   - If expiry date is less than 3 months from today (${new Date().toISOString().split('T')[0]}), flag as FAIL with issue "WWCC expires within 3 months"
   - If already expired, flag as FAIL

6. SCREENSHOT INTEGRITY: Check for signs of manipulation:
   - Consistent UI elements
   - No obvious Photoshop artifacts
   - Reasonable resolution and quality

7. FINAL ASSESSMENT: Determine pass/fail.

Respond with ONLY valid JSON:
{
  "pass": true/false,
  "extracted": {
    "surname": "...",
    "first_name": "...",
    "other_names": "..." or null,
    "wwcc_number": "WWC...",
    "clearance_type": "...",
    "expiry": "YYYY-MM-DD"
  },
  "reasoning": "Step-by-step reasoning...",
  "issues": ["issue 1", "issue 2"],
  "user_guidance": null
}

IMPORTANT: When "pass" is false, you MUST provide "user_guidance" — a friendly, non-combative message explaining the problem and how to fix it. Write as if speaking directly to the person.

Format for user_guidance when pass is false:
{
  "user_guidance": {
    "title": "Short friendly summary (e.g. 'We couldn't verify your Service NSW screenshot')",
    "explanation": "One sentence explaining what went wrong in plain language.",
    "steps_to_fix": [
      "Step 1 the user can take",
      "Step 2...",
      "Step 3..."
    ]
  }
}

When "pass" is true, set "user_guidance" to null.`;

export async function verifyWWCC(
  documentSignedUrl: string,
  method: 'grant_email' | 'service_nsw_app',
  submittedData: {
    surname: string;
    given_names: string;
    wwcc_number: string;
  },
  isPdf?: boolean
): Promise<WWCCVerificationResult> {
  try {
    const systemPrompt = method === 'grant_email'
      ? WWCC_GRANT_EMAIL_PROMPT
      : WWCC_SERVICE_NSW_PROMPT;

    // Build the document content block — PDF uses base64 file, images use URL
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let documentContent: any;
    if (isPdf) {
      const response = await fetch(documentSignedUrl);
      if (!response.ok) throw new Error(`Failed to download PDF: ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const base64 = buffer.toString('base64');
      documentContent = {
        type: 'file',
        file: {
          filename: 'wwcc-document.pdf',
          file_data: `data:application/pdf;base64,${base64}`,
        },
      };
    } else {
      documentContent = {
        type: 'image_url',
        image_url: { url: documentSignedUrl, detail: 'high' },
      };
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.4-nano',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Submitted details:\n- Surname: ${submittedData.surname}\n- Given Names: ${submittedData.given_names}\n- WWCC Number: ${submittedData.wwcc_number}\n\nPlease verify the WWCC document below.`,
            },
            documentContent,
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 2000,
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      return {
        pass: false,
        extracted: { surname: null, first_name: null, other_names: null, wwcc_number: null, clearance_type: null, expiry: null },
        reasoning: 'AI returned empty response',
        issues: ['AI analysis failed — empty response'],
      };
    }

    const parsed = JSON.parse(raw);

    return {
      pass: !!parsed.pass,
      extracted: {
        surname: parsed.extracted?.surname ?? null,
        first_name: parsed.extracted?.first_name ?? null,
        other_names: parsed.extracted?.other_names ?? null,
        wwcc_number: parsed.extracted?.wwcc_number ?? null,
        clearance_type: parsed.extracted?.clearance_type ?? null,
        expiry: parsed.extracted?.expiry ?? null,
      },
      reasoning: parsed.reasoning ?? '',
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      user_guidance: parsed.user_guidance ?? null,
    };
  } catch (error) {
    console.error('[verifyWWCC] AI analysis failed:', error);
    return {
      pass: false,
      extracted: { surname: null, first_name: null, other_names: null, wwcc_number: null, clearance_type: null, expiry: null },
      reasoning: `AI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      issues: ['AI analysis failed — please review manually'],
      user_guidance: null,
    };
  }
}
