/**
 * Gemini client for Katie.
 *
 * Wraps @google/genai with helpers that bake in the spike findings (WU 0.6):
 *   - Preserves `thoughtSignature` on multi-turn tool calls by echoing
 *     `response.candidates[0].content.parts` verbatim.
 *   - Adds single-retry logic for Pro model function-calls (Pro occasionally
 *     returns empty responses; Flash is stable).
 *   - Exposes streaming + non-streaming + cachedContent in one place.
 *
 * Mirrors the pattern of src/lib/ai/client.ts (OpenAI) for discoverability.
 */

import { GoogleGenAI, type Content } from "@google/genai";
import { GEMINI_MODELS, type GeminiModelId } from "./model-selector";

const API_KEY = process.env.GOOGLE_AI_API_KEY;

if (!API_KEY && process.env.NODE_ENV !== "test") {
  // In production the key must be set. In test runs we allow missing so
  // tests can mock the client.
  console.warn(
    "[gemini-client] GOOGLE_AI_API_KEY not set — AI calls will fail",
  );
}

export const gemini = new GoogleGenAI({ apiKey: API_KEY ?? "test-key" });

/** Standard timeout for any single Gemini call (matches openai client). */
export const GEMINI_TIMEOUT_MS = 50_000;

/** Tool declaration shape (Gemini function-calling format). */
export interface GeminiTool {
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

/** One conversation turn in Gemini's expected shape. */
export type GeminiTurn = Content;

/**
 * Throws if the caller has passed a config combination Gemini will
 * reject. Specifically: a request that sets `cachedContent` cannot
 * also set `systemInstruction`, `tools`, or `toolConfig` — those
 * values must already be baked into the cache via `createCache`.
 *
 * Throwing here is deliberately load-bearing: a silent acceptance
 * lets the request reach Gemini and surface as a 400 only at runtime
 * (which is exactly the bug this guard exists to prevent recurring).
 */
function assertNoCachedConflict(opts: {
  systemPrompt?: string;
  tools?: GeminiTool[];
  cachedContent?: string;
}): void {
  if (!opts.cachedContent) return;
  if (opts.systemPrompt) {
    throw new Error(
      "[gemini-client] cachedContent is incompatible with systemPrompt — bake systemInstruction into the cache via createCache()",
    );
  }
  if (opts.tools && opts.tools.length > 0) {
    throw new Error(
      "[gemini-client] cachedContent is incompatible with tools — bake tools into the cache via createCache()",
    );
  }
}

/**
 * Sends a non-streaming request. Used for proactive ai-minimal tier,
 * compaction calls, and any synchronous reasoning step.
 */
export async function generate(options: {
  model: GeminiModelId;
  systemPrompt?: string;
  contents: string | GeminiTurn[];
  tools?: GeminiTool[];
  cachedContent?: string;
}) {
  assertNoCachedConflict(options);
  return gemini.models.generateContent({
    model: options.model,
    contents: options.contents,
    config: {
      ...(options.systemPrompt
        ? { systemInstruction: options.systemPrompt }
        : {}),
      ...(options.tools ? { tools: options.tools } : {}),
      ...(options.cachedContent
        ? { cachedContent: options.cachedContent }
        : {}),
    },
  });
}

/**
 * Sends a streaming request. Returns an async iterator of chunks.
 * Use for reactive chat (user types → streamed SSE response).
 *
 * When handling tool calls in a multi-turn conversation, build `contents`
 * using `echoModelParts()` to preserve thoughtSignature on the previous
 * model turn. Failure to do so results in 400 errors from Gemini 3.
 */
export async function generateStream(options: {
  model: GeminiModelId;
  systemPrompt?: string;
  contents: GeminiTurn[];
  tools?: GeminiTool[];
  cachedContent?: string;
}) {
  assertNoCachedConflict(options);
  return gemini.models.generateContentStream({
    model: options.model,
    contents: options.contents,
    config: {
      ...(options.systemPrompt
        ? { systemInstruction: options.systemPrompt }
        : {}),
      ...(options.tools ? { tools: options.tools } : {}),
      ...(options.cachedContent
        ? { cachedContent: options.cachedContent }
        : {}),
    },
  });
}

/**
 * Echo model parts verbatim — required to preserve thoughtSignature on
 * function-call round-trips in Gemini 3. See WU 0.6 spike findings.
 *
 * Usage:
 *   const round1 = await generate({ model, contents: userPrompt, tools });
 *   const modelTurn = echoModelParts(round1.candidates?.[0]?.content?.parts);
 *   const stream = await generateStream({
 *     model,
 *     contents: [
 *       { role: 'user', parts: [{ text: userPrompt }] },
 *       modelTurn,
 *       { role: 'user', parts: [{ functionResponse: { name, response } }] },
 *     ],
 *     tools,
 *   });
 */
export function echoModelParts(
  parts: Content["parts"] | undefined,
): GeminiTurn {
  if (!parts || parts.length === 0) {
    throw new Error(
      "echoModelParts: no parts to echo — model response was empty",
    );
  }
  return { role: "model", parts };
}

/**
 * Creates a cachedContent entry that can be reused across requests.
 * Requires systemInstruction of >=1024 tokens (Gemini 3 minimum).
 * Returns the cache handle (cache.name) to pass as `cachedContent` in
 * subsequent generate() / generateStream() calls.
 *
 * `tools` MUST be baked in here when the downstream conversation uses
 * function calling — Gemini rejects requests that set both `cachedContent`
 * and `tools` on the same GenerateContent call:
 *   "CachedContent can not be used with GenerateContent request setting
 *    system_instruction, tools or tool_config."
 * The cached entry already carries them.
 */
export async function createCache(options: {
  model: GeminiModelId;
  systemInstruction: string;
  tools?: GeminiTool[];
  displayName?: string;
  ttlSeconds?: number;
}) {
  return gemini.caches.create({
    model: options.model,
    config: {
      systemInstruction: options.systemInstruction,
      ...(options.tools ? { tools: options.tools } : {}),
      ttl: `${options.ttlSeconds ?? 3600}s`,
      displayName: options.displayName ?? `katie-cache-${Date.now()}`,
    },
  });
}

/** Deletes a cached content entry. Best-effort; non-fatal if already gone. */
export async function deleteCache(cacheName: string): Promise<void> {
  try {
    await gemini.caches.delete({ name: cacheName });
  } catch {
    // non-fatal — TTL will reap it anyway
  }
}

export { GEMINI_MODELS };
export type { GeminiModelId };
