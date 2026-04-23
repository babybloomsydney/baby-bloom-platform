import { openai } from './client';
import { type ShareCaseType, SHARE_CASE_TYPE } from '@/lib/viral-loop/constants';

// ── Result type ──

export interface ScreenshotCheckResult {
  verdict: 'approved' | 'failed';
  confidence: number;
  checks: {
    is_facebook: boolean;
    is_group_post: boolean;
    is_relevant_group: boolean;
    content_matches: boolean;
    is_recent: boolean;
    is_publicly_visible: boolean;
    link_present: boolean;
    name_matches: boolean;
    reference_code_matches: boolean;
  };
  detected_group_name: string | null;
  fail_reasons: string[];
  user_guidance: string | null;
  ai_raw: Record<string, unknown>;
}

// ── Hard-coded user-friendly guidance messages ──

const GUIDANCE = {
  not_facebook:
    "Oops! It looks like the image you uploaded isn't of your shared profile. Try uploading a screenshot of your post in a Facebook group.",
  not_group_post:
    "Oops! It looks like your screenshot isn't showing a Facebook group post. Try taking a new screenshot that shows the group name at the top and your post in the group feed.",
  not_relevant_group:
    "Oops! It looks like your post wasn't shared in a childcare or parenting group. Try sharing in a Sydney mums, nannies, or childcare Facebook group — that's where families will see you!",
  no_link:
    "We couldn't find the link to your profile in your screenshot. Try taking the screenshot again showing your full post on the screen so we can spot it!",
  content_mismatch:
    "Hmm, we couldn't match your post to your Baby Bloom listing. Make sure you're sharing the post we generated for you — it contains specific details about your listing!",
  name_mismatch:
    "The name on your post doesn't seem to match your Baby Bloom account. Make sure you're sharing from your own Facebook profile!",
  not_recent:
    "Hmm, it looks like your post wasn't shared recently. Let's give families a fresh opportunity to discover you by sharing your profile again!",
  not_visible:
    "Oops! It looks like your post was shared privately. Try sharing in a Sydney mums, nannies, or childcare Facebook group — that's where families will see you!",
  technical_error:
    "Oops, looks like we're having technical issues on our end. Please try uploading your screenshot again!",
  reference_code_mismatch:
    "We couldn't spot your job's reference code in the screenshot. Make sure the link preview image is visible in your screenshot — it has a small code in the bottom-right corner!",
  generic_fallback:
    "We couldn't quite verify your screenshot. Try taking a clear screenshot showing your full post in a Sydney childcare Facebook group and upload it again!",
} as const;

// ── Shared system prompt (Facebook UI verification) ──

const FB_UI_SYSTEM_BASE = `You are a Facebook screenshot verifier. Your job is to catch obvious fraud — not to be a strict quality gate. Be LENIENT. When in doubt, APPROVE.

We want to catch: private posts, personal profile posts (not in a group), someone else's post, very old posts, and posts pending admin approval. Everything else — let it through.

Use chain-of-thought reasoning internally, then output ONLY JSON.

## Checks

### 1. Is this Facebook?
Look for any Facebook UI indicators: blue header, reactions, comment/share buttons, profile pictures, navigation icons, Messenger chat heads, notification bell. If it's clearly not Facebook, set is_facebook to false.

### 2. Is this a Group Post?
The post can appear in MANY contexts on mobile and desktop — all are valid if a group name is visible:

**A. Inside a group (browsing the group directly):**
- Mobile: group name in the TOP HEADER BAR (e.g. "< [GroupPic] GROUP NAME [search] [...]") with a back arrow — the group name appears as a title bar at the very top of the screen, with the group's profile picture next to it
- Desktop: group name in banner/header with cover photo
- "Write something..." compose box below header, "Anonymous post", "Feeling", "Poll" buttons
- "Most relevant" or sorting options above posts
- Group navigation tabs (Discussion, Members, Events)
- "Join/Joined" button, member count visible

**B. In the news feed (scrolling home feed):**
- The post tile shows the GROUP NAME in BOLD as the primary name, with the poster's name in smaller text below it (e.g. "GROUP NAME" on first line, "User Name · Just now · 🌐" on second line) — the group's profile picture appears to the left
- OR: "[User Name] posted in [Group Name]" header above the post
- OR: "[User Name] · [Group Name]" next to each other
- The Facebook bottom tab bar is visible (Home, Reels, Friends, Marketplace, Notifications, Profile)
- Stories carousel may be visible at the top
- This is STILL a valid group post — it just appears in the feed

**C. Shared post / cross-posted:**
- "Shared to [Group Name]" or "Posted in [Group Name]" label
- Any indication that a group name is associated with the post

**Group badges (valid in all views):**
- Three-people silhouette, shield, hand/wave, star, crown/key icons next to poster name

**IMPORTANT: If ANY group name is visible anywhere in the screenshot associated with the post (header bar, above the post, next to the user's name, in a "posted in" label), it IS a group post. Set is_group_post to true.**

**REJECT as not a group post ONLY if:**
- It's clearly a personal profile/timeline post (no group name visible ANYWHERE)
- It's a Facebook Page post ("Page · X followers")
- It's a Story, Reel, or Marketplace listing

### 3. Poster Identity
Check if the poster's name resembles the expected user name. Be very lenient:
- First name match alone is fine
- Nicknames, shortened names, middle names, maiden/married names — all OK
- Only set name_matches to false if the names are completely different people
- If no expected name provided, set to true

### 4. Privacy & Visibility
Set is_publicly_visible to false ONLY if you see a PADLOCK icon next to the poster's name or timestamp. No padlock = assume visible. "Public Group"/"Private Group" labels are fine — that's the group's setting, not the post's.

Also set is_publicly_visible to false if the post shows "Pending Approval", "Pending", "Under Review", or similar admin moderation text — the post hasn't been approved by group admins yet and is not visible to group members.

### 5. Recency
APPROVE if timestamp shows: "Just now", minutes, hours, "Yesterday", or days (up to 7 days).
FAIL if: weeks/months/years old, a specific date older than 7 days, or no timestamp visible.

### 6. Group Relevance — BE LENIENT
We want ANY legitimate community group, ideally in Sydney/Australia. This includes:
- Childcare, nanny, babysitting, parenting groups
- Local community groups, buy/sell/swap groups, mums groups
- Suburb-specific groups, neighbourhood groups
- Any group based in Sydney, NSW, or an Australian city/suburb

Set is_relevant_group to true if the group appears to be any kind of community/local group. Only set to false if it's clearly unrelated (e.g. a gaming group, an overseas group with no Australian connection, a meme page).

If the group name is not fully visible, give benefit of the doubt and set to true.

### 7. OG Image / Link Check
Look for a Baby Bloom link preview card or the URL "babybloomsydney.com.au" anywhere in the post. The link preview image (OG card) is the most important indicator — it's a branded card with nanny/family info.

### 8. Post Content — BE VERY LENIENT
{CONTENT_CHECK_INSTRUCTIONS}

### 9. Reference Code (if provided)
If a reference code was specified, look at the link preview card/image. In the bottom-right corner, above the "BabyBloom" logo text, there may be a 5-character code in small gray text. Do your best to read it. Set reference_code_matches to true if it matches, false otherwise. If no code was specified, set to true.

## Decision Approach
Be LENIENT. The goal is fraud prevention, not perfection. If the screenshot looks like a genuine recent group post with a Baby Bloom link, APPROVE it. Only DECLINE for clear violations.

## Output Format
Return ONLY this JSON:
{
  "verdict": "Approved" or "Declined",
  "confidence": 0-100,
  "is_facebook": true/false,
  "is_group_post": true/false,
  "is_relevant_group": true/false,
  "content_matches": true/false,
  "is_recent": true/false,
  "is_publicly_visible": true/false,
  "link_present": true/false,
  "name_matches": true/false,
  "reference_code_matches": true/false,
  "detected_group_name": "Group Name" or null,
  "detected_timestamp": "the timestamp text visible on the post" or null,
  "detected_poster_name": "the poster name visible on the post" or null,
  "detected_reference_code": "the code you read from the preview image" or null,
  "reasoning": "Brief explanation"
}`;

// ── Case-specific content check instructions ──

const CONTENT_CHECK_NANNY_PROFILE = `The post should be broadly related to childcare, nannying, or babysitting. The user may have edited the text — that's fine. As long as the Baby Bloom OG image/link is present and the post isn't about something completely unrelated (e.g. selling furniture, politics), set content_matches to true. Be very lenient here.`;

const CONTENT_CHECK_PARENT_POSITION = `The post should be broadly related to childcare, nannying, or looking for a nanny/babysitter. The user may have edited the text — that's fine. As long as the Baby Bloom OG image/link is present and the post isn't about something completely unrelated (e.g. selling furniture, politics), set content_matches to true. Be very lenient here.`;

const CONTENT_CHECK_PARENT_BSR = `The post should be broadly related to childcare or babysitting. The user may have edited the text — that's fine. As long as the Baby Bloom OG image/link is present and the post isn't about something completely unrelated (e.g. selling furniture, politics), set content_matches to true. Be very lenient here.`;

function getContentCheckInstructions(caseType: ShareCaseType): string {
  switch (caseType) {
    case SHARE_CASE_TYPE.NANNY_PROFILE:
      return CONTENT_CHECK_NANNY_PROFILE;
    case SHARE_CASE_TYPE.PARENT_POSITION:
      return CONTENT_CHECK_PARENT_POSITION;
    case SHARE_CASE_TYPE.PARENT_BSR:
      return CONTENT_CHECK_PARENT_BSR;
    default:
      return CONTENT_CHECK_NANNY_PROFILE;
  }
}

function buildSystemPrompt(caseType: ShareCaseType): string {
  return FB_UI_SYSTEM_BASE.replace(
    '{CONTENT_CHECK_INSTRUCTIONS}',
    getContentCheckInstructions(caseType)
  );
}

// ── Confidence threshold ──

const APPROVE_CONFIDENCE_THRESHOLD = 50;

// ── Main check function ──

export async function checkShareScreenshot(
  screenshotUrl: string,
  caseType: ShareCaseType,
  expectedUserName?: string,
  expectedReferenceCode?: string
): Promise<ScreenshotCheckResult> {
  try {
    const systemPrompt = buildSystemPrompt(caseType);

    let userText = `Analyse this screenshot. Determine if it is a genuine Facebook group post.`;
    if (expectedUserName) {
      userText += ` The expected poster name is "${expectedUserName}".`;
    }
    if (expectedReferenceCode) {
      userText += ` The post should contain a link preview card/image. In the bottom-right corner of that preview image, directly above the "BabyBloom" logo text, there must be a 5-character reference code "${expectedReferenceCode}" in small gray text. Check that this exact code is visible.`;
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.4-nano',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: screenshotUrl, detail: 'high' } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 1000,
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      return makeFailResult('AI returned empty response', {});
    }

    const ai = JSON.parse(raw);
    console.log('[checkShareScreenshot] AI result:', JSON.stringify(ai, null, 2));

    // ── Server-side validation — CODE decides, not AI ──

    const checks = {
      is_facebook: ai.is_facebook === true,
      is_group_post: ai.is_group_post === true,
      is_relevant_group: ai.is_relevant_group === true,
      content_matches: ai.content_matches === true,
      is_recent: ai.is_recent === true,
      is_publicly_visible: ai.is_publicly_visible !== false, // default true if not explicitly false
      link_present: ai.link_present === true,
      name_matches: expectedUserName ? ai.name_matches === true : true,
      reference_code_matches: expectedReferenceCode ? ai.reference_code_matches === true : true,
    };

    const confidence: number = typeof ai.confidence === 'number' ? ai.confidence : 0;
    const detectedGroupName: string | null = ai.detected_group_name ?? null;

    // Build internal fail reasons (for admin/logging)
    const failReasons: string[] = [];
    if (!checks.is_facebook) failReasons.push('Not a Facebook screenshot');
    if (!checks.is_group_post) failReasons.push('Not a Facebook group post');
    if (!checks.is_relevant_group) failReasons.push('Group not childcare/parenting related');
    if (!checks.content_matches) failReasons.push('Content does not match expected type');
    if (!checks.is_recent) failReasons.push(`Post not recent (timestamp: ${ai.detected_timestamp ?? 'unknown'})`);
    if (!checks.is_publicly_visible) failReasons.push('Post appears private');
    if (!checks.link_present) failReasons.push('No babybloomsydney.com.au link found');
    if (!checks.name_matches) failReasons.push('Poster name mismatch');
    if (!checks.reference_code_matches) failReasons.push('Reference code not visible in screenshot');

    // ── Core checks (hard — these catch obvious fraud) ──
    // content_matches is NOT a hard check — user may edit text, OG image is enough
    const coreChecksPassed =
      checks.is_facebook &&
      checks.is_group_post &&
      checks.is_relevant_group &&
      checks.is_recent &&
      checks.is_publicly_visible &&
      checks.link_present;

    // ── Identity verification (name + reference code) ──
    // For BSR and position: name and code are COMPLEMENTARY soft checks.
    // Either one passing is enough. Both failing = fail.
    // For nanny profile: name is a hard check (no reference code used).
    const isBsrOrPosition =
      caseType === SHARE_CASE_TYPE.PARENT_BSR ||
      caseType === SHARE_CASE_TYPE.PARENT_POSITION;

    let identityPassed: boolean;
    if (isBsrOrPosition) {
      // Complementary: name OR code → pass; both fail → fail
      identityPassed = checks.name_matches || checks.reference_code_matches;
      if (!identityPassed) {
        failReasons.push('Neither name nor reference code could be verified');
      }
    } else {
      // Nanny profile: name is hard check
      identityPassed = checks.name_matches;
    }

    const approved = coreChecksPassed && identityPassed && confidence >= APPROVE_CONFIDENCE_THRESHOLD;

    if (!approved && failReasons.length === 0) {
      failReasons.push('Low confidence score');
    }

    // Pick the right user-facing guidance (hard-coded, prioritised)
    const userGuidance = approved ? null : pickGuidance(checks, caseType);

    return {
      verdict: approved ? 'approved' : 'failed',
      confidence,
      checks,
      detected_group_name: detectedGroupName,
      fail_reasons: approved ? [] : failReasons,
      user_guidance: userGuidance,
      ai_raw: ai,
    };
  } catch (error) {
    console.error('[checkShareScreenshot] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return makeFailResult(`AI check error: ${message}`, {});
  }
}

// ── Helpers ──

/** Pick the most relevant user guidance based on which check failed first (priority order) */
function pickGuidance(checks: ScreenshotCheckResult['checks'], caseType: ShareCaseType): string {
  const isBsr = caseType === SHARE_CASE_TYPE.PARENT_BSR;
  const isPosition = caseType === SHARE_CASE_TYPE.PARENT_POSITION;

  if (!checks.is_facebook) {
    if (isBsr) return "Oops! It looks like the image you uploaded isn't of your babysitting request. Try uploading a screenshot of your post in a Facebook group.";
    if (isPosition) return "Oops! It looks like the image you uploaded isn't of your position listing. Try uploading a screenshot of your post in a Facebook group.";
    return GUIDANCE.not_facebook;
  }
  if (!checks.is_group_post) {
    if (isBsr) return "Oops! It looks like your screenshot isn't showing a Facebook group post. Try taking a new screenshot from inside the group that shows the group name and your babysitting request.";
    if (isPosition) return "Oops! It looks like your screenshot isn't showing a Facebook group post. Try taking a new screenshot from inside the group that shows the group name and your position listing.";
    return GUIDANCE.not_group_post;
  }
  if (!checks.is_publicly_visible) return "It looks like your post hasn't been approved by the group admin yet, or was shared privately. Wait for admin approval then try again, or share in a group that doesn't require post approval!";
  if (!checks.is_relevant_group) {
    if (isBsr) return "Oops! It looks like your post wasn't shared in a childcare or parenting group. Try sharing in a Sydney mums or childcare Facebook group — that's where nannies will see it!";
    if (isPosition) return "Oops! It looks like your post wasn't shared in a childcare or parenting group. Try sharing in a Sydney mums or childcare Facebook group — that's where nannies will see it!";
    return GUIDANCE.not_relevant_group;
  }
  if (!checks.is_recent) return GUIDANCE.not_recent;
  if (!checks.link_present) {
    if (isBsr) return "We couldn't find the Baby Bloom link in your screenshot. Try taking the screenshot again showing your full babysitting request post with the link preview visible!";
    if (isPosition) return "We couldn't find the Baby Bloom link in your screenshot. Try taking the screenshot again showing your full position listing post with the link preview visible!";
    return GUIDANCE.no_link;
  }
  if (!checks.content_matches) return GUIDANCE.content_mismatch;
  if (!checks.name_matches) return GUIDANCE.name_mismatch;
  if (!checks.reference_code_matches) {
    if (isBsr) return "We couldn't verify that this post is for your babysitting request. Please make sure the full post (including the preview image) is visible in your screenshot.";
    if (isPosition) return "We couldn't verify that this post is for your position listing. Please make sure the full post (including the preview image) is visible in your screenshot.";
    return GUIDANCE.reference_code_mismatch;
  }
  if (isBsr) return "We couldn't quite verify your screenshot. Try taking a clear screenshot showing your full babysitting request in a Sydney childcare Facebook group and upload it again!";
  if (isPosition) return "We couldn't quite verify your screenshot. Try taking a clear screenshot showing your full position listing in a Sydney childcare Facebook group and upload it again!";
  return GUIDANCE.generic_fallback;
}

function makeFailResult(reason: string, aiRaw: Record<string, unknown>): ScreenshotCheckResult {
  return {
    verdict: 'failed',
    confidence: 0,
    checks: {
      is_facebook: false,
      is_group_post: false,
      is_relevant_group: false,
      content_matches: false,
      is_recent: false,
      is_publicly_visible: false,
      link_present: false,
      name_matches: false,
      reference_code_matches: false,
    },
    detected_group_name: null,
    fail_reasons: [reason],
    user_guidance: GUIDANCE.technical_error,
    ai_raw: aiRaw,
  };
}
