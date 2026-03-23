'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { UserRole } from './types';
import { getDashboardPath } from './roles';
import { sendEmail } from '@/lib/email/resend';

export interface ActionResult {
  error?: string;
  success?: boolean;
  redirectTo?: string;
}

export async function signUp(formData: FormData): Promise<ActionResult> {
  const supabase = createClient();

  // Clear any existing session first to prevent conflicts
  await supabase.auth.signOut();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const firstName = formData.get('firstName') as string;
  const lastName = formData.get('lastName') as string;
  const role = formData.get('role') as UserRole;
  const signupSource = (formData.get('signupSource') as string) || 'direct';

  // Validate required fields
  if (!email || !password || !firstName || !lastName || !role) {
    return { error: 'All fields are required' };
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { error: 'Please enter a valid email address' };
  }

  // Validate password length
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters' };
  }

  // Validate role
  if (!['nanny', 'parent'].includes(role)) {
    return { error: 'Invalid role' };
  }

  // 1. Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
      },
    },
  });

  if (authError) {
    console.error('Auth signup error:', authError);
    if (authError.message.includes('already registered')) {
      return { error: 'An account with this email already exists' };
    }
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: 'Failed to create user account' };
  }

  const userId = authData.user.id;

  // Use admin client for post-signup inserts to bypass RLS
  // The user's session isn't fully established yet, so RLS auth.uid() checks fail
  const adminClient = createAdminClient();

  try {
    // 2. Insert user role
    const { error: roleError } = await adminClient
      .from('user_roles')
      .insert({ user_id: userId, role });

    if (roleError) {
      console.error('Role insert error:', roleError);
      // Clean up auth user on failure
      await adminClient.auth.admin.deleteUser(userId);
      return { error: 'Failed to set up user role. Please try again.' };
    }

    // 3. Insert user profile
    const { error: profileError } = await adminClient
      .from('user_profiles')
      .insert({
        user_id: userId,
        first_name: firstName,
        last_name: lastName,
        email: email,
      });

    if (profileError) {
      console.error('Profile insert error:', profileError);
      // Clean up auth user and role on failure
      await adminClient.from('user_roles').delete().eq('user_id', userId);
      await adminClient.auth.admin.deleteUser(userId);
      return { error: 'Failed to create user profile. Please try again.' };
    }

    // 4. Insert role-specific record (nanny or parent)
    if (role === 'nanny') {
      const { error: nannyError } = await adminClient
        .from('nannies')
        .insert({
          user_id: userId,
          status: 'pending_verification',
          verification_tier: 'tier1',
        });

      if (nannyError) {
        console.error('Nanny insert error:', nannyError);
        return { error: 'Failed to create nanny profile. Please try again.' };
      }
    } else if (role === 'parent') {
      const { error: parentError } = await adminClient
        .from('parents')
        .insert({
          user_id: userId,
          status: 'active',
          signup_source: signupSource,
        });

      if (parentError) {
        console.error('Parent insert error:', parentError);
        return { error: 'Failed to create parent profile. Please try again.' };
      }
    }

    // 5. Insert user progress
    const { error: progressError } = await adminClient
      .from('user_progress')
      .insert({
        user_id: userId,
        stage: role === 'nanny' ? 'nanny_profile_created' : 'parent_signup',
      });

    if (progressError) {
      console.error('Progress insert error:', progressError);
      // Non-critical, don't fail the signup
    }

    // 6. Send welcome email (fire-and-forget)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app-babybloom.vercel.app';
    const baseStyle = `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;`;
    const btnStyle = `background: #8B5CF6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;`;

    if (role === 'nanny') {
      sendEmail({
        to: email,
        subject: 'Welcome to Baby Bloom! 🎉',
        html: `<div style="${baseStyle}">
          <h1 style="color: #8B5CF6; font-size: 24px; margin-bottom: 16px;">Baby Bloom Sydney</h1>
          <p style="color: #374151; font-size: 16px; line-height: 1.6;">[TBD] ACC-001 — Nanny Welcome. Welcomes nanny to Baby Bloom. Next step: complete your profile and start verification to become visible to families.</p>
          <p style="margin-top: 24px;"><a href="${appUrl}/nanny/profile" style="${btnStyle}">Complete Your Profile</a></p>
        </div>`,
        emailType: 'welcome',
        recipientUserId: userId,
      }).catch(err => console.error('[Signup] ACC-001 email error:', err));
    } else {
      sendEmail({
        to: email,
        subject: 'Welcome to Baby Bloom! 🎉',
        html: `<div style="${baseStyle}">
          <h1 style="color: #8B5CF6; font-size: 24px; margin-bottom: 16px;">Baby Bloom Sydney</h1>
          <p style="color: #374151; font-size: 16px; line-height: 1.6;">[TBD] ACC-002 — Parent Welcome. Welcomes parent to Baby Bloom. Next step: browse verified nannies and create a position to start matching.</p>
          <p style="margin-top: 24px;"><a href="${appUrl}/parent/browse" style="${btnStyle}">Browse Nannies</a></p>
        </div>`,
        emailType: 'welcome',
        recipientUserId: userId,
      }).catch(err => console.error('[Signup] ACC-002 email error:', err));
    }

    return {
      success: true,
      redirectTo: getDashboardPath(role)
    };
  } catch (error) {
    console.error('Signup error:', error);
    return { error: 'An unexpected error occurred. Please try again.' };
  }
}

export async function signIn(formData: FormData): Promise<ActionResult> {
  const supabase = createClient();

  // Clear any existing session first to prevent conflicts
  await supabase.auth.signOut();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email and password are required' };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('Sign in error:', error);
    if (error.message.includes('Invalid login credentials')) {
      return { error: 'Invalid email or password' };
    }
    return { error: error.message };
  }

  if (!data.user) {
    return { error: 'Failed to sign in' };
  }

  // Fetch user role to determine redirect
  const { data: roleData, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', data.user.id)
    .single();

  if (roleError || !roleData) {
    console.error('Role fetch error:', roleError);
    return { error: 'Failed to fetch user role' };
  }

  const role = roleData.role as UserRole;
  return {
    success: true,
    redirectTo: getDashboardPath(role)
  };
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function forgotPassword(formData: FormData): Promise<ActionResult> {
  const supabase = createClient();

  const email = formData.get('email') as string;

  if (!email) {
    return { error: 'Email is required' };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback?next=/reset-password`,
  });

  if (error) {
    console.error('Forgot password error:', error);
    return { error: 'Failed to send reset email. Please try again.' };
  }

  return { success: true };
}

export async function resetPassword(formData: FormData): Promise<ActionResult> {
  const supabase = createClient();

  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!password || !confirmPassword) {
    return { error: 'Both password fields are required' };
  }

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match' };
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters' };
  }

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    console.error('Reset password error:', error);
    return { error: 'Failed to reset password. Please try again.' };
  }

  return { success: true, redirectTo: '/login' };
}

export async function getUserRole(userId: string): Promise<UserRole | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.role as UserRole;
}
