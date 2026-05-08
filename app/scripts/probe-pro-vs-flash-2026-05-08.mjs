import path from "node:path";
import url from "node:url";
import fs from "node:fs";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "..");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const raw = fs.readFileSync(file, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined) continue;
    let val = m[2];
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}
loadEnv(path.join(APP_ROOT, ".env.local"));

const { GoogleGenAI } = await import("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

for (const model of ["gemini-3-pro-preview", "gemini-3-flash-preview"]) {
  const t0 = Date.now();
  let firstTextAt = null;
  let outputText = "";
  let usage = null;
  try {
    const stream = await ai.models.generateContentStream({
      model,
      contents: [{ role: "user", parts: [{ text: "Hi! Say hello back, briefly." }] }],
      config: { maxOutputTokens: 50 },
    });
    for await (const chunk of stream) {
      if (chunk.text && firstTextAt === null) firstTextAt = Date.now();
      if (chunk.text) outputText += chunk.text;
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
    }
    const t1 = Date.now();
    console.log(JSON.stringify({
      model,
      ok: true,
      ttft_ms: firstTextAt - t0,
      total_ms: t1 - t0,
      output: outputText,
      input_tokens: usage?.promptTokenCount,
      output_tokens: usage?.candidatesTokenCount,
    }));
  } catch (err) {
    console.log(JSON.stringify({ model, ok: false, error: String(err).slice(0, 200), elapsed_ms: Date.now() - t0 }));
  }
}
