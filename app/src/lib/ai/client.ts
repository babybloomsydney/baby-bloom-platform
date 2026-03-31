import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 50_000, // 50s — hard-kill the HTTP request if it exceeds this
});
