import { openai } from './client';

import type { UserGuidance } from '@/lib/verification';

export interface PassportVerificationResult {
  pass: boolean;
  extracted: {
    surname: string | null;
    given_names: string | null;
    dob: string | null;
    nationality: string | null;
    passport_number: string | null;
    expiry: string | null;
  };
  selfie_confidence: number | null;
  reasoning: string;
  issues: string[];
  user_guidance?: UserGuidance | null;
}

const SELFIE_PASS_THRESHOLD = 75;

const PASSPORT_SYSTEM_PROMPT = `You are an identity verification specialist for a childcare platform. Your job is to extract data from a passport image and evaluate a selfie comparison. Do NOT decide pass/fail — just extract data and score honestly.

Follow this process:

1. DOCUMENT ANALYSIS: Is this a real passport document? Look for MRZ zone, biographical data page, photo, holograms, issuing country. If you cannot identify it as a passport, set document_valid to false.

2. DATA EXTRACTION: Extract these fields EXACTLY as printed on the passport. Do NOT correct, guess, or interpret — transcribe exactly:
   - Surname (as printed)
   - Given names (all given names as printed, space-separated)
   - Date of birth (format YYYY-MM-DD)
   - Nationality (as printed)
   - Passport number (as printed)
   - Expiry date (format YYYY-MM-DD)
   If a field is unreadable, set it to null.

3. PHOTO QUALITY: Is the passport image clear enough to read all text? Are the biographical details legible?

4. SELFIE VALIDITY: Before scoring the match, check whether the selfie is usable for verification:
   - Is this a real, live selfie taken by a person (not a photo of a screen, printout, or another photograph)?
   - Is the face clearly visible — facing the camera, well-lit, and in focus?
   - Is the face unobstructed? The following MUST cause selfie_valid=false:
     * Sunglasses or tinted glasses (prescription clear glasses are fine)
     * Hats, caps, hoods (religious headwear that leaves the face uncovered is fine)
     * Face masks, scarves, or any covering over the face
     * Hands or objects blocking part of the face
     * Heavy theatrical makeup that obscures natural features
     * Face turned significantly to the side or looking away from camera
     * Face cropped or partially out of frame
   If any of the above apply, set selfie_valid to false and explain in selfie_validity_issues.

5. SELFIE CONFIDENCE SCORE: If the selfie is valid, compare the selfie face to the passport photo face. Give a percentage confidence score from 0 to 100 that they are the SAME person.

   Score guidelines:
   - Focus on STRUCTURAL features that don't change: bone structure, face shape, eye spacing, eye shape, nose bridge width and shape, ear shape/position, brow ridge, chin shape, jawline
   - ALLOW LENIENCY for changeable features: facial hair (beard, moustache, stubble), hairstyle, hair length/colour, slight weight changes, aging, tan/pale skin, minor blemishes
   - A person with a beard in the selfie but clean-shaven in the passport (or vice versa) can still score 85-95% if the underlying facial structure matches well
   - A person with different hairstyle should still score high if face structure matches
   - 90-100%: Clearly the same person — strong structural match across multiple features
   - 75-89%: Same person with some expected variation (aging, facial hair, weight, lighting differences)
   - 50-74%: Uncertain — some features match but enough differences to raise doubt
   - 25-49%: Unlikely the same person — significant structural differences
   - 0-24%: Clearly different people

   Explain your reasoning: which features matched, which differed, and why you scored as you did.

   If selfie_valid is false, set selfie_confidence to 0 (the selfie cannot be evaluated).

6. MRZ CROSS-CHECK: If the MRZ zone is visible, cross-check the machine-readable data against the visual biographical data. Flag any discrepancies.

Respond with ONLY valid JSON:
{
  "document_valid": true/false,
  "image_quality": "good" | "poor" | "unreadable",
  "extracted": {
    "surname": "EXACT TEXT or null",
    "given_names": "EXACT TEXT or null",
    "dob": "YYYY-MM-DD or null",
    "nationality": "EXACT TEXT or null",
    "passport_number": "EXACT TEXT or null",
    "expiry": "YYYY-MM-DD or null"
  },
  "selfie_valid": true/false,
  "selfie_validity_issues": ["issue 1", ...],
  "selfie_confidence": 0-100,
  "selfie_reasoning": "Detailed explanation of which features matched/differed and why",
  "mrz_consistent": true/false/null,
  "document_concerns": ["concern 1", ...]
}

CRITICAL: Extract text EXACTLY as printed. Do not normalize case, fix typos, or fill in missing data. If you're unsure about a character, use null for that field. Accuracy matters more than completeness.`;

export async function verifyPassport(
  passportSignedUrl: string,
  selfieSignedUrl: string,
  submittedData: {
    surname: string;
    given_names: string;
    date_of_birth: string;
    passport_country: string;
  }
): Promise<PassportVerificationResult> {
  try {
    // Step 1: AI extracts data from passport image (does NOT decide pass/fail)
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.4-nano',
      messages: [
        { role: 'system', content: PASSPORT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract all data from this passport and evaluate the selfie comparison. Return ONLY the JSON extraction with your confidence score.`,
            },
            {
              type: 'image_url',
              image_url: { url: passportSignedUrl, detail: 'high' },
            },
            {
              type: 'image_url',
              image_url: { url: selfieSignedUrl, detail: 'auto' },
            },
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
        extracted: { surname: null, given_names: null, dob: null, nationality: null, passport_number: null, expiry: null },
        selfie_confidence: null,
        reasoning: 'AI returned empty response',
        issues: ['AI analysis failed — empty response'],
      };
    }

    const ai = JSON.parse(raw);
    console.log('[verifyPassport] AI extraction:', JSON.stringify(ai, null, 2));

    const extracted = {
      surname: ai.extracted?.surname ?? null,
      given_names: ai.extracted?.given_names ?? null,
      dob: ai.extracted?.dob ?? null,
      nationality: ai.extracted?.nationality ?? null,
      passport_number: ai.extracted?.passport_number ?? null,
      expiry: ai.extracted?.expiry ?? null,
    };

    const selfieConfidence: number = typeof ai.selfie_confidence === 'number' ? ai.selfie_confidence : 0;
    const selfieValid: boolean = ai.selfie_valid !== false;
    const selfieReasoning: string = ai.selfie_reasoning ?? '';

    // Step 2: Server-side validation — CODE decides pass/fail, not AI
    const issues: string[] = [];
    const reasoning: string[] = [];

    // 2a. Document validity
    if (!ai.document_valid) {
      issues.push('Document does not appear to be a valid passport');
    }
    if (ai.image_quality === 'unreadable') {
      issues.push('Passport image is too blurry or dark to read');
    }
    if (ai.image_quality === 'poor') {
      issues.push('Passport image quality is poor — some fields may be misread');
    }
    reasoning.push(`Document valid: ${ai.document_valid}, Image quality: ${ai.image_quality}`);

    // 2b. Selfie validity checks (before confidence score)
    if (!selfieValid) {
      const validityIssues = ai.selfie_validity_issues ?? [];
      issues.push('Selfie is not suitable for verification');
      if (validityIssues.length > 0) {
        issues.push(...validityIssues.map((i: string) => `Selfie: ${i}`));
      }
    }

    // 2c. Selfie confidence score (only meaningful if selfie is valid)
    if (selfieValid && selfieConfidence < SELFIE_PASS_THRESHOLD) {
      issues.push(`Selfie match confidence too low (${selfieConfidence}%) — minimum ${SELFIE_PASS_THRESHOLD}% required`);
    }
    reasoning.push(`Selfie valid: ${selfieValid}, Confidence: ${selfieConfidence}%, Threshold: ${SELFIE_PASS_THRESHOLD}%`);
    if (selfieReasoning) {
      reasoning.push(`Selfie analysis: ${selfieReasoning}`);
    }

    // 2d + 2e. Name comparison with swap detection
    // Users commonly enter surname/given names in the wrong fields, especially
    // with Asian passports where name order conventions differ. If the names are
    // simply swapped, we correct them silently and pass.
    if (extracted.surname && extracted.given_names && submittedData.surname?.trim() && submittedData.given_names?.trim()) {
      const extSurname = extracted.surname.toLowerCase().trim();
      const extGivenFirst = extracted.given_names.toLowerCase().trim().split(/\s+/)[0];
      const subSurname = submittedData.surname.toLowerCase().trim();
      const subGivenFirst = submittedData.given_names.toLowerCase().trim().split(/\s+/)[0];

      const surnameMatch = extSurname === subSurname;
      const givenMatch = extGivenFirst === subGivenFirst;

      // Check if names are swapped: submitted surname matches extracted given name AND vice versa
      const swapped = !surnameMatch && !givenMatch
        && extSurname === subGivenFirst
        && extGivenFirst === subSurname;

      if (swapped) {
        // Names are swapped — correct the extracted order to match passport and pass
        reasoning.push(`Names SWAPPED: user entered surname="${submittedData.surname}" given="${submittedData.given_names}" but passport shows surname="${extracted.surname}" given="${extracted.given_names}" — auto-corrected`);
      } else {
        if (!surnameMatch) {
          issues.push(`Surname mismatch: passport shows "${extracted.surname}" but you entered "${submittedData.surname}"`);
        }
        if (!givenMatch) {
          issues.push(`First name mismatch: passport shows "${extracted.given_names}" but you entered "${submittedData.given_names}"`);
        }
        reasoning.push(`Surname: extracted="${extracted.surname}" submitted="${submittedData.surname}" ${surnameMatch ? 'MATCH' : 'MISMATCH'}`);
        reasoning.push(`Given names: extracted="${extracted.given_names}" submitted="${submittedData.given_names}" first="${givenMatch ? 'MATCH' : 'MISMATCH'}"`);
      }
    } else {
      // Fallback: individual checks when one name is missing from extraction
      if (extracted.surname && submittedData.surname?.trim()) {
        const extractedSurname = extracted.surname.toLowerCase().trim();
        const submittedSurname = submittedData.surname.toLowerCase().trim();
        if (extractedSurname !== submittedSurname) {
          issues.push(`Surname mismatch: passport shows "${extracted.surname}" but you entered "${submittedData.surname}"`);
        }
        reasoning.push(`Surname: extracted="${extracted.surname}" submitted="${submittedData.surname}" ${extractedSurname === submittedSurname ? 'MATCH' : 'MISMATCH'}`);
      } else if (!extracted.surname) {
        issues.push('Could not read surname from passport');
      }

      if (extracted.given_names && submittedData.given_names?.trim()) {
        const extractedFirst = extracted.given_names.toLowerCase().trim().split(/\s+/)[0];
        const submittedFirst = submittedData.given_names.toLowerCase().trim().split(/\s+/)[0];
        if (extractedFirst !== submittedFirst) {
          issues.push(`First name mismatch: passport shows "${extracted.given_names}" but you entered "${submittedData.given_names}"`);
        }
        reasoning.push(`Given names: extracted="${extracted.given_names}" submitted="${submittedData.given_names}" first="${extractedFirst === submittedFirst ? 'MATCH' : 'MISMATCH'}"`);
      } else if (!extracted.given_names) {
        issues.push('Could not read given names from passport');
      }
    }

    // 2f. Date of birth — EXACT match required
    if (extracted.dob && submittedData.date_of_birth) {
      if (extracted.dob !== submittedData.date_of_birth) {
        issues.push(`Date of birth mismatch: passport shows "${extracted.dob}" but you entered "${submittedData.date_of_birth}"`);
      }
      reasoning.push(`DOB: extracted="${extracted.dob}" submitted="${submittedData.date_of_birth}" ${extracted.dob === submittedData.date_of_birth ? 'MATCH' : 'MISMATCH'}`);
    } else if (!extracted.dob) {
      issues.push('Could not read date of birth from passport');
    }

    // 2g. Passport expiry — must not be expired
    if (extracted.expiry) {
      const expiryDate = new Date(extracted.expiry);
      const now = new Date();
      if (expiryDate < now) {
        issues.push(`Passport has expired (${extracted.expiry})`);
      }
      reasoning.push(`Expiry: ${extracted.expiry} ${expiryDate < now ? 'EXPIRED' : 'valid'}`);
    } else if (ai.document_valid) {
      issues.push('Could not read expiry date from passport');
    }

    // 2h. MRZ consistency
    if (ai.mrz_consistent === false) {
      issues.push('MRZ data does not match visual data on passport — possible alteration');
    }

    // 2i. Document concerns from AI
    if (ai.document_concerns?.length > 0) {
      issues.push(...ai.document_concerns.map((c: string) => `Document: ${c}`));
    }

    // Step 3: Determine pass/fail based on hard rules
    const hasNameMismatch = issues.some(i => i.includes('name mismatch') || i.includes('Name mismatch'));
    const hasDobMismatch = issues.some(i => i.includes('Date of birth mismatch'));
    const hasExpired = issues.some(i => i.includes('expired'));
    const hasInvalidDoc = issues.some(i => i.includes('not appear to be a valid passport') || i.includes('too blurry'));
    const hasSelfieInvalid = !selfieValid;
    const hasLowSelfieConfidence = selfieValid && selfieConfidence < SELFIE_PASS_THRESHOLD;
    const hasMrzIssue = issues.some(i => i.includes('MRZ data does not match'));
    const missingCritical = !extracted.surname || !extracted.given_names || !extracted.dob;

    const pass = !hasNameMismatch && !hasDobMismatch && !hasExpired && !hasInvalidDoc && !hasSelfieInvalid && !hasLowSelfieConfidence && !hasMrzIssue && !missingCritical;

    // Step 4: Generate user guidance if failed
    let user_guidance: UserGuidance | null = null;
    if (!pass) {
      if (hasNameMismatch || hasDobMismatch) {
        user_guidance = {
          title: 'Your details don\'t match your passport',
          explanation: 'The information you entered doesn\'t match what\'s printed on your passport.',
          steps_to_fix: [
            'Check your surname and given names match your passport exactly',
            'Check your date of birth matches your passport exactly',
            'Re-enter your details and try again',
          ],
        };
      } else if (hasSelfieInvalid || hasLowSelfieConfidence) {
        user_guidance = {
          title: 'We were unable to verify your ID',
          explanation: 'We were not able to match your ID to your selfie with high confidence. To be verified successfully, please try again with the tips below.',
          steps_to_fix: [
            'Face the camera directly with your whole face clearly visible',
            'Remove any sunglasses, hats, or face coverings',
            'Use good, even lighting — natural light works best',
            'Keep a neutral expression and ensure the photo is in focus',
            'A plain background helps improve accuracy',
            'If you continue having trouble, you can submit for manual review instead',
          ],
        };
      } else if (hasInvalidDoc) {
        user_guidance = {
          title: 'We couldn\'t read your passport',
          explanation: 'The passport image wasn\'t clear enough to verify.',
          steps_to_fix: [
            'Take a photo of your passport biographical page in good lighting',
            'Make sure all text is sharp and readable',
            'Avoid glare from holograms — tilt the passport slightly if needed',
          ],
        };
      } else if (hasExpired) {
        user_guidance = {
          title: 'Your passport has expired',
          explanation: 'We can only accept a current, non-expired passport.',
          steps_to_fix: [
            'Upload a valid, non-expired passport',
          ],
        };
      } else {
        user_guidance = {
          title: 'We couldn\'t verify your identity',
          explanation: 'Some required information couldn\'t be read from your passport.',
          steps_to_fix: [
            'Re-upload a clearer photo of your passport biographical page',
            'Make sure all text is readable',
            'Try again or submit for manual review',
          ],
        };
      }
    }

    return {
      pass,
      extracted,
      selfie_confidence: selfieValid ? selfieConfidence : null,
      reasoning: reasoning.join('\n'),
      issues,
      user_guidance,
    };
  } catch (error) {
    console.error('[verifyPassport] AI analysis failed:', error);

    // Detect OpenAI unsupported image format error
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isUnsupportedFormat = errorMsg.includes('unsupported image') || errorMsg.includes('Could not process image');

    return {
      pass: false,
      extracted: { surname: null, given_names: null, dob: null, nationality: null, passport_number: null, expiry: null },
      selfie_confidence: null,
      reasoning: `AI analysis failed: ${errorMsg}`,
      issues: [isUnsupportedFormat
        ? 'Unsupported image format — only PNG, JPEG, GIF, and WebP are accepted'
        : 'AI analysis failed — please review manually'],
      user_guidance: isUnsupportedFormat
        ? {
            title: 'Unsupported Image Format',
            explanation: 'One of your uploaded images is in a format we can\'t process (e.g. HEIC). We only support PNG, JPEG, and WebP.',
            steps_to_fix: [
              'Re-upload your passport as a PNG or JPEG image',
              'Re-upload your selfie as a PNG or JPEG image',
              'On iPhone, take a screenshot of the photo and upload that instead',
            ],
          }
        : null,
    };
  }
}
