import { openai } from './client';

import type { UserGuidance } from '@/lib/verification';

export interface DriversLicenseVerificationResult {
  pass: boolean;
  extracted: {
    surname: string | null;
    given_names: string | null;
    dob: string | null;
    license_number: string | null;
    license_expiry: string | null;
    state_province: string | null;
    license_class: string | null;
  };
  selfie_confidence: number | null;
  reasoning: string;
  issues: string[];
  user_guidance?: UserGuidance | null;
}

const SELFIE_PASS_THRESHOLD = 75;

const DRIVERS_LICENSE_SYSTEM_PROMPT = `You are an identity verification specialist tasked with validating driver's licenses and selfie photos.

Your job is to analyze:
1. A driver's license document image
2. A selfie photo

Follow these steps precisely:

**STEP 1: DOCUMENT ANALYSIS**
Examine the driver's license image carefully. A valid driver's license should contain:
- A photograph of the license holder
- Biographical data (full name, date of birth)
- License number
- Issuing authority (state/province/country)
- Expiry date
- Holographic elements or other security features

Support common formats from:
- Australia (state-issued cards with license number)
- United Kingdom (photocard format, DVLA)
- New Zealand (NZTA format)
- United States (state DMV cards)
- European Union (EU standard format)

If the image does NOT clearly show a driver's license, set document_valid to false.

**STEP 2: DATA EXTRACTION**
Extract the following data fields EXACTLY as they appear on the license:
- Surname (family name/last name)
- Given names (first name and middle names)
- Date of birth (convert to YYYY-MM-DD format)
- License number
- Expiry date (convert to YYYY-MM-DD format)
- State/Province (issuing jurisdiction)
- License class/category

If any field is unclear or missing, set it to null. Extract exactly as printed - do not correct spelling or formatting.

**STEP 3: PHOTO QUALITY**
Assess whether the driver's license image is:
- "good": Clear, readable, all text visible
- "poor": Somewhat blurry but still readable
- "unreadable": Too blurry, dark, or obscured to verify

**STEP 4: SELFIE VALIDITY**
The selfie must show:
- A clear, front-facing view of one person's face
- Good lighting (not too dark or overexposed)
- No sunglasses, hats, or face masks
- Eyes open and visible
- Face not obscured

If any of these conditions are not met, set selfie_valid to false and list the issues.

**STEP 5: SELFIE CONFIDENCE SCORE**
Rate the likelihood (0-100) that the selfie is of the same person shown in the driver's license photo.
- 90-100: Very high confidence - strong facial feature match
- 75-89: Good confidence - clear similarities in facial structure
- 60-74: Moderate confidence - some similarities but notable differences
- 40-59: Low confidence - significant differences
- 0-39: Very low confidence - appears to be different people

Consider: facial structure, eye shape, nose, mouth, jawline, and any distinguishing features.

**STEP 6: COUNTRY-SPECIFIC NOTES**
- Australia: State-issued cards. Note difference between card number and license number.
- UK: Photocard format with DVLA reference
- NZ: NZTA standard format
- US: State DMV cards with varied formats
- EU: EU standard photocard format

Respond ONLY with valid JSON matching this exact structure:
{
  "document_valid": true/false,
  "image_quality": "good" | "poor" | "unreadable",
  "extracted": {
    "surname": "EXACT TEXT or null",
    "given_names": "EXACT TEXT or null",
    "dob": "YYYY-MM-DD or null",
    "license_number": "EXACT TEXT or null",
    "license_expiry": "YYYY-MM-DD or null",
    "state_province": "EXACT TEXT or null",
    "license_class": "EXACT TEXT or null"
  },
  "selfie_valid": true/false,
  "selfie_validity_issues": ["issue 1", "issue 2"],
  "selfie_confidence": 0-100,
  "selfie_reasoning": "Detailed explanation of facial comparison...",
  "document_concerns": ["concern 1", "concern 2"]
}`;

export async function verifyDriversLicense(
  licenseSignedUrl: string,
  selfieSignedUrl: string,
  submittedData: {
    surname: string;
    given_names: string;
    date_of_birth: string;
    issuing_country: string;
  }
): Promise<DriversLicenseVerificationResult> {
  try {
    // 1. Call OpenAI with the two images
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.4-nano',
      messages: [
        {
          role: 'system',
          content: DRIVERS_LICENSE_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Please analyze these images:\n1. Driver's License\n2. Selfie\n\nSubmitted data for comparison:\n- Surname: ${submittedData.surname}\n- Given Names: ${submittedData.given_names}\n- DOB: ${submittedData.date_of_birth}\n- Issuing Country: ${submittedData.issuing_country}`,
            },
            {
              type: 'image_url',
              image_url: { url: licenseSignedUrl, detail: 'high' },
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

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      throw new Error('No response from OpenAI');
    }

    const aiResult = JSON.parse(rawContent);

    // 2. Server-side validation
    const issues: string[] = [];
    let pass = true;
    let userGuidance: UserGuidance | null = null;

    // 2a. Document validity
    if (!aiResult.document_valid) {
      issues.push('Invalid or unrecognizable driver\'s license document');
      pass = false;
    }

    // 2b. Selfie validity
    if (!aiResult.selfie_valid) {
      issues.push('Selfie does not meet quality requirements');
      pass = false;
    }

    // 2c. Selfie confidence
    const selfieConfidence = aiResult.selfie_confidence ?? 0;
    if (selfieConfidence < SELFIE_PASS_THRESHOLD) {
      issues.push(`Selfie confidence too low: ${selfieConfidence}%`);
      pass = false;
    }

    // 2d. Surname comparison
    const extractedSurname = aiResult.extracted?.surname?.toLowerCase().trim();
    const submittedSurname = submittedData.surname.toLowerCase().trim();
    const surnameMatch = extractedSurname === submittedSurname;
    if (!surnameMatch && extractedSurname) {
      issues.push(
        `Surname mismatch: extracted "${aiResult.extracted.surname}" vs submitted "${submittedData.surname}"`
      );
      pass = false;
    }

    // 2e. Given names comparison (first name only)
    const extractedGivenNames = aiResult.extracted?.given_names?.toLowerCase().trim();
    const submittedGivenNames = submittedData.given_names.toLowerCase().trim();
    const extractedFirstName = extractedGivenNames?.split(/\s+/)[0];
    const submittedFirstName = submittedGivenNames.split(/\s+/)[0];
    const givenNamesMatch = extractedFirstName === submittedFirstName;
    if (!givenNamesMatch && extractedGivenNames) {
      issues.push(
        `Given names mismatch: extracted "${aiResult.extracted.given_names}" vs submitted "${submittedData.given_names}"`
      );
      pass = false;
    }

    // 2f. DOB comparison
    const extractedDob = aiResult.extracted?.dob;
    const submittedDob = submittedData.date_of_birth;
    const dobMatch = extractedDob === submittedDob;
    if (!dobMatch && extractedDob) {
      issues.push(
        `Date of birth mismatch: extracted "${extractedDob}" vs submitted "${submittedDob}"`
      );
      pass = false;
    }

    // 2g. License expiry check
    const licenseExpiry = aiResult.extracted?.license_expiry;
    if (licenseExpiry) {
      const expiryDate = new Date(licenseExpiry);
      const now = new Date();
      if (expiryDate < now) {
        issues.push(`Driver's license is expired (expiry: ${licenseExpiry})`);
        pass = false;
      }
    }

    // 2h. Document concerns
    if (aiResult.document_concerns?.length > 0) {
      issues.push(...aiResult.document_concerns.map((c: string) => `Document concern: ${c}`));
    }

    // 3. Generate user guidance based on failure reasons
    if (!pass) {
      const hasNameMismatch = !surnameMatch || !givenNamesMatch;
      const hasSelfieIssue = !aiResult.selfie_valid || selfieConfidence < SELFIE_PASS_THRESHOLD;
      const hasInvalidDoc = !aiResult.document_valid;
      const hasExpiredDoc = licenseExpiry && new Date(licenseExpiry) < new Date();

      if (hasNameMismatch) {
        userGuidance = {
          title: 'Name Mismatch Detected',
          explanation:
            'The name on your driver\'s license does not match the name you provided.',
          steps_to_fix: [
            'Check your surname and given names match your license exactly',
            'Re-enter your details and try again',
          ],
        };
      } else if (hasSelfieIssue) {
        userGuidance = {
          title: 'Selfie Quality Issue',
          explanation:
            'Your selfie did not meet our verification requirements.',
          steps_to_fix: [
            'Face the camera directly with your whole face clearly visible',
            'Remove any sunglasses, hats, or face coverings',
            'Use good, even lighting — natural light works best',
            'Take a new selfie and try again',
          ],
        };
      } else if (hasInvalidDoc) {
        userGuidance = {
          title: 'Invalid Driver\'s License Document',
          explanation:
            'We could not verify your driver\'s license document.',
          steps_to_fix: [
            'Take a clear photo of your driver\'s license in good lighting',
            'Make sure all text is sharp and readable',
            'Avoid glare — tilt the document slightly if needed',
          ],
        };
      } else if (hasExpiredDoc) {
        userGuidance = {
          title: 'Expired Driver\'s License',
          explanation:
            'Your driver\'s license has expired. We can only accept current, valid licenses.',
          steps_to_fix: [
            'Upload a valid, non-expired driver\'s license',
          ],
        };
      } else {
        userGuidance = {
          title: 'Verification Failed',
          explanation:
            'We were unable to verify your driver\'s license at this time.',
          steps_to_fix: [
            'Ensure your driver\'s license photo is clear and complete',
            'Ensure your selfie is well-lit and clearly shows your face',
            'Try again or submit for manual review',
          ],
        };
      }
    }

    return {
      pass,
      extracted: {
        surname: aiResult.extracted?.surname ?? null,
        given_names: aiResult.extracted?.given_names ?? null,
        dob: aiResult.extracted?.dob ?? null,
        license_number: aiResult.extracted?.license_number ?? null,
        license_expiry: aiResult.extracted?.license_expiry ?? null,
        state_province: aiResult.extracted?.state_province ?? null,
        license_class: aiResult.extracted?.license_class ?? null,
      },
      selfie_confidence: selfieConfidence,
      reasoning: aiResult.selfie_reasoning || 'No reasoning provided',
      issues,
      user_guidance: userGuidance,
    };
  } catch (error) {
    console.error('Error verifying driver\'s license:', error);

    // Detect OpenAI unsupported image format error
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isUnsupportedFormat = errorMsg.includes('unsupported image') || errorMsg.includes('Could not process image');

    return {
      pass: false,
      extracted: {
        surname: null,
        given_names: null,
        dob: null,
        license_number: null,
        license_expiry: null,
        state_province: null,
        license_class: null,
      },
      selfie_confidence: null,
      reasoning: `Error during verification: ${errorMsg}`,
      issues: [isUnsupportedFormat
        ? 'Unsupported image format — only PNG, JPEG, GIF, and WebP are accepted'
        : 'Verification process failed'],
      user_guidance: isUnsupportedFormat
        ? {
            title: 'Unsupported Image Format',
            explanation: 'One of your uploaded images is in a format we can\'t process (e.g. HEIC). We only support PNG, JPEG, and WebP.',
            steps_to_fix: [
              'Re-upload your driver\'s license as a PNG or JPEG image',
              'Re-upload your selfie as a PNG or JPEG image',
              'On iPhone, take a screenshot of the photo and upload that instead',
            ],
          }
        : {
            title: 'Verification Error',
            explanation: 'An error occurred during verification. Please try again.',
            steps_to_fix: ['Re-upload your driver\'s license and selfie.'],
          },
    };
  }
}
