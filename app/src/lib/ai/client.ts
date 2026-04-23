import OpenAI from "openai";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  _client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 50_000, // 50s — hard-kill the HTTP request if it exceeds this
    dangerouslyAllowBrowser: true, // Node-only code; flag silences jsdom-based test init
  });
  return _client;
}

// Proxy preserves the legacy `openai.chat.completions.create(...)` call shape
// while deferring instantiation until the first property access.
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const inst = getClient() as unknown as Record<string | symbol, unknown>;
    const value = inst[prop];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(inst)
      : value;
  },
});
