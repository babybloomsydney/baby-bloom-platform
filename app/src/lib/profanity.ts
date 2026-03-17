/**
 * Server-side profanity filter for AI content editing.
 * Uses whole-word matching to avoid false positives (e.g. "assessment", "class").
 */

const PROFANITY_WORDS = [
  // Slurs and hate speech
  "nigger", "nigga", "faggot", "fag", "dyke", "retard", "retarded",
  "tranny", "chink", "gook", "spic", "wetback", "kike", "coon",
  "beaner", "towelhead", "raghead", "cracker",
  // Sexual / explicit
  "fuck", "fucking", "fucker", "fucked", "motherfucker",
  "shit", "shitty", "bullshit", "horseshit",
  "cunt", "cock", "dick", "pussy", "asshole", "arse",
  "bitch", "whore", "slut", "skank", "hoe",
  "blowjob", "handjob", "wanker", "wank",
  "tits", "boobs", "titties",
  "cum", "jizz", "orgasm", "dildo", "vibrator",
  "porn", "porno", "pornography",
  // Violence
  "kill", "murder", "rape", "molest",
  // Predatorial / grooming
  "pedophile", "paedophile", "pedo", "paedo",
  "grooming", "molester", "sodomy", "incest",
  "lolita", "jailbait", "underage",
  // Drugs (explicit)
  "meth", "cocaine", "heroin", "crack",
  // General profanity
  "damn", "dammit", "goddam", "goddamn",
  "bastard", "piss", "crap", "prick",
  "stfu", "gtfo", "lmfao",
];

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

/**
 * Check if text contains profanity.
 * Strips HTML tags, then checks for whole-word matches (case-insensitive).
 */
export function containsProfanity(text: string): boolean {
  const plain = stripHtml(text).toLowerCase();
  return PROFANITY_WORDS.some((word) => {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    return regex.test(plain);
  });
}

/**
 * Check multiple text fields for profanity.
 * Returns the first offending field name, or null if all clean.
 */
export function findProfanityInFields(
  fields: Record<string, string | undefined>
): string | null {
  for (const [key, value] of Object.entries(fields)) {
    if (value && containsProfanity(value)) {
      return key;
    }
  }
  return null;
}

/**
 * Check multiple text fields for profanity.
 * Returns ALL offending field keys (not just the first).
 */
export function checkAllFields(
  fields: Record<string, string | undefined>
): { clean: boolean; offendingFields: string[] } {
  const offending: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value && containsProfanity(value)) {
      offending.push(key);
    }
  }
  return { clean: offending.length === 0, offendingFields: offending };
}
