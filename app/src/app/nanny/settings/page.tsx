import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NannySettingsClient } from './NannySettingsClient';

export default async function NannySettingsPage() {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/login');

  const admin = createAdminClient();

  const [profileRes, nannyRes, verificationRes] = await Promise.all([
    admin.from('user_profiles')
      .select('first_name, last_name, email, mobile_number, date_of_birth, suburb, postcode')
      .eq('user_id', user.id).single(),
    admin.from('nannies')
      .select('verification_level')
      .eq('user_id', user.id).single(),
    admin.from('verifications')
      .select('wwcc_number, wwcc_status, wwcc_expiry_date')
      .eq('user_id', user.id).maybeSingle(),
  ]);

  return (
    <NannySettingsClient
      profile={{
        first_name: profileRes.data?.first_name || '',
        last_name: profileRes.data?.last_name || '',
        email: profileRes.data?.email || '',
        mobile_number: profileRes.data?.mobile_number || '',
        date_of_birth: profileRes.data?.date_of_birth || '',
        suburb: profileRes.data?.suburb || '',
        postcode: profileRes.data?.postcode || '',
      }}
      verificationLevel={nannyRes.data?.verification_level ?? 0}
      wwcc={verificationRes.data ? {
        number: verificationRes.data.wwcc_number || null,
        status: verificationRes.data.wwcc_status || null,
        expiryDate: verificationRes.data.wwcc_expiry_date || null,
      } : null}
    />
  );
}
