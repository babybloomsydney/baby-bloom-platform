import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, key, { auth: { persistSession: false } });

const CHILD_ID = '1282ae4e-e681-4d33-85b7-2746b1c8ebe3'; // Obie
const PARENT_APP_CONSENT_AGREEMENT_ID = 'PARENT-APP-CONSENT';

console.log('=== Step 1: child lookup ===');
const { data: child, error: childErr } = await admin
  .from('child_client')
  .select('id, date_of_birth, age_months_approx')
  .eq('id', CHILD_ID)
  .maybeSingle();
console.log({ child, childErr });

console.log('\n=== Step 2: consent lookup (gate query verbatim) ===');
const { data: top, error: topErr } = await admin
  .from('consent_records')
  .select('user_id, consent_given, created_at')
  .eq('agreement_id', PARENT_APP_CONSENT_AGREEMENT_ID)
  .eq('related_entity_id', CHILD_ID)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();
console.log({ top, topErr });

if (top) {
  const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;
  const signedAt = new Date(top.created_at);
  const expiresAt = new Date(signedAt.getTime() + TWELVE_MONTHS_MS);
  const msRemaining = expiresAt.getTime() - Date.now();
  console.log('\n=== Step 3: TTL math ===');
  console.log({ signedAt: signedAt.toISOString(), expiresAt: expiresAt.toISOString(), msRemaining, daysRemaining: msRemaining / 86400000 });
}
