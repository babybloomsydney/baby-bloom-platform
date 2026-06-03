/**
 * Does Stripe accept id_number = "01234567891" at AU Express create?
 *
 * If id_number_provided=true on response → Stripe accepted it.
 * If id_number_provided=undefined → Stripe silently dropped it.
 * Cleans up after itself.
 */

import { readFileSync } from "node:fs";
import Stripe from "stripe";

const envPath = "./.env.local";
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (!m) continue;
  let [, k, v] = m;
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  )
    v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

async function test(label, idNumber) {
  console.log("\n[" + label + "] id_number =", idNumber);
  try {
    const a = await stripe.accounts.create({
      type: "express",
      country: "AU",
      email: `probe-${Date.now()}@example.test`,
      business_type: "individual",
      capabilities: { transfers: { requested: true } },
      business_profile: {
        mcc: "8351",
        product_description: "Private Childcare Services",
      },
      individual: {
        email: `probe-${Date.now()}@example.test`,
        id_number: idNumber,
      },
    });
    console.log("  account.id                    =", a.id);
    console.log(
      "  individual.id_number_provided =",
      a.individual?.id_number_provided,
    );
    console.log(
      "  individual.id_number          =",
      a.individual?.id_number ?? "(redacted as expected)",
    );
    await stripe.accounts.del(a.id);
    console.log("  cleaned up.");
  } catch (err) {
    console.log("  THREW:", err.message ?? String(err));
  }
}

await test("VALID checksum, leading 5", "51824753556");
await test("VALID checksum, BUT leading 0", "01234567891");
await test("VALID checksum, leading 5 again", "53004085616");
