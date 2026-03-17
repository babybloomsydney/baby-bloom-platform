'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { updateNannyAccountSettings, deactivateNannyAccount, updateAccountEmail } from '@/lib/actions/nanny';
import { Save, Loader2, CheckCircle, Lock, Shield, ExternalLink, AlertTriangle, X } from 'lucide-react';

interface Props {
  profile: {
    first_name: string;
    last_name: string;
    email: string;
    mobile_number: string;
    date_of_birth: string;
    suburb: string;
    postcode: string;
  };
  verificationLevel: number;
  wwcc: {
    number: string | null;
    status: string | null;
    expiryDate: string | null;
  } | null;
}

const WWCC_STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  not_started: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Not Started' },
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
  processing: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Processing' },
  doc_verified: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Verified' },
  review: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Under Review' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
  expired: { bg: 'bg-red-100', text: 'text-red-700', label: 'Expired' },
};

export function NannySettingsClient({ profile, verificationLevel, wwcc }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeConfirmName, setCloseConfirmName] = useState('');
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'saving' | 'sent' | 'error'>('idle');
  const [emailError, setEmailError] = useState<string | null>(null);

  const isLocked = verificationLevel >= 2;

  const [form, setForm] = useState({
    first_name: profile.first_name,
    last_name: profile.last_name,
    email: profile.email,
    date_of_birth: profile.date_of_birth,
    mobile_number: profile.mobile_number,
    suburb: profile.suburb,
    postcode: profile.postcode,
  });

  const emailChanged = form.email !== profile.email;
  const isDirty =
    form.first_name !== profile.first_name ||
    form.last_name !== profile.last_name ||
    form.date_of_birth !== profile.date_of_birth ||
    form.mobile_number !== profile.mobile_number ||
    form.suburb !== profile.suburb ||
    form.postcode !== profile.postcode;

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'email') {
      setEmailStatus('idle');
      setEmailError(null);
    } else {
      setSaveStatus('idle');
    }
  };

  const handleSave = () => {
    setSaveStatus('saving');
    setError(null);
    startTransition(async () => {
      const payload: Record<string, string | null> = {};
      if (!isLocked) {
        if (form.first_name !== profile.first_name) payload.first_name = form.first_name;
        if (form.last_name !== profile.last_name) payload.last_name = form.last_name;
        if (form.date_of_birth !== profile.date_of_birth) payload.date_of_birth = form.date_of_birth || null;
      }
      if (form.mobile_number !== profile.mobile_number) payload.mobile_number = form.mobile_number || null;
      if (form.suburb !== profile.suburb) payload.suburb = form.suburb;
      if (form.postcode !== profile.postcode) payload.postcode = form.postcode;

      const result = await updateNannyAccountSettings(payload);
      if (result.success) {
        setSaveStatus('saved');
        router.refresh();
      } else {
        setSaveStatus('error');
        setError(result.error);
      }
    });
  };

  const handleEmailUpdate = async () => {
    if (!emailChanged || !form.email.trim()) return;
    setEmailStatus('saving');
    setEmailError(null);
    const result = await updateAccountEmail(form.email.trim());
    if (result.success) {
      setEmailStatus('sent');
    } else {
      setEmailStatus('error');
      setEmailError(result.error);
    }
  };

  const fullName = `${profile.first_name} ${profile.last_name}`.trim();
  const nameMatches = closeConfirmName.toLowerCase() === fullName.toLowerCase();

  const handleDeactivate = async () => {
    setIsDeactivating(true);
    const result = await deactivateNannyAccount();
    if (result.success) {
      router.push('/login');
    } else {
      setIsDeactivating(false);
      setError(result.error);
    }
  };

  const wwccStatus = wwcc?.status ? WWCC_STATUS_COLORS[wwcc.status] || { bg: 'bg-slate-100', text: 'text-slate-600', label: wwcc.status } : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Account Settings</h1>
        <p className="mt-1 text-slate-500">Manage your personal information and account preferences</p>
      </div>

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Your private details — not shown on your public profile</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="flex items-center gap-1.5">
                First Name
                {isLocked && <Lock className="h-3 w-3 text-slate-400" />}
              </Label>
              <Input
                id="firstName"
                value={form.first_name}
                onChange={(e) => update('first_name', e.target.value)}
                disabled={isLocked}
                className={isLocked ? 'bg-slate-50 text-slate-500' : ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="flex items-center gap-1.5">
                Last Name
                {isLocked && <Lock className="h-3 w-3 text-slate-400" />}
              </Label>
              <Input
                id="lastName"
                value={form.last_name}
                onChange={(e) => update('last_name', e.target.value)}
                disabled={isLocked}
                className={isLocked ? 'bg-slate-50 text-slate-500' : ''}
              />
            </div>
          </div>
          {isLocked && (
            <p className="text-xs text-slate-400">Name is locked after identity verification</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="email">Email</Label>
              <div className="flex gap-2">
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  className="flex-1"
                />
                {emailChanged && (
                  <Button
                    onClick={handleEmailUpdate}
                    disabled={emailStatus === 'saving'}
                    size="sm"
                    className="bg-violet-600 hover:bg-violet-700 text-white h-10 px-4 shrink-0"
                  >
                    {emailStatus === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update'}
                  </Button>
                )}
              </div>
              {emailStatus === 'sent' && (
                <p className="text-xs text-green-600">Confirmation email sent — check your inbox to verify the new address.</p>
              )}
              {emailStatus === 'error' && (
                <p className="text-xs text-red-500">{emailError}</p>
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dob" className="flex items-center gap-1.5">
                Date of Birth
                {isLocked && <Lock className="h-3 w-3 text-slate-400" />}
              </Label>
              <Input
                id="dob"
                type="date"
                value={form.date_of_birth}
                onChange={(e) => update('date_of_birth', e.target.value)}
                disabled={isLocked}
                className={isLocked ? 'bg-slate-50 text-slate-500' : ''}
              />
              {isLocked && (
                <p className="text-xs text-slate-400">Locked after identity verification</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="mobile">Mobile Number</Label>
              <Input
                id="mobile"
                type="tel"
                value={form.mobile_number}
                onChange={(e) => update('mobile_number', e.target.value)}
                placeholder="04XX XXX XXX"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
          <CardDescription>Your location helps us match you with nearby families</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="suburb">Suburb</Label>
              <Input
                id="suburb"
                value={form.suburb}
                onChange={(e) => update('suburb', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postcode">Postcode</Label>
              <Input
                id="postcode"
                value={form.postcode}
                onChange={(e) => update('postcode', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* WWCC */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-violet-500" />
            Working With Children Check
          </CardTitle>
          <CardDescription>Your WWCC verification status</CardDescription>
        </CardHeader>
        <CardContent>
          {wwcc && wwcc.number ? (
            <div className="space-y-3">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1">WWCC Number</p>
                  <p className="text-sm font-medium text-slate-900">{wwcc.number}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Status</p>
                  {wwccStatus && (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${wwccStatus.bg} ${wwccStatus.text}`}>
                      {wwccStatus.label}
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Expiry Date</p>
                  <p className="text-sm font-medium text-slate-900">
                    {wwcc.expiryDate ? new Date(wwcc.expiryDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Not yet submitted</p>
              <Link href="/nanny/verification">
                <Button variant="outline" size="sm" className="gap-1.5">
                  Submit WWCC <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>Choose how you want to be notified</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-slate-500">Notification settings coming soon</p>
            <p className="mt-1 text-xs text-slate-400">
              You&apos;ll be able to customize email and push notifications here
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save bar */}
      {isDirty && (
        <div className="sticky bottom-4 z-10">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              {saveStatus === 'saved' && (
                <>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-green-600">Settings saved</span>
                </>
              )}
              {saveStatus === 'error' && <span className="text-red-500">{error}</span>}
              {saveStatus === 'idle' && <span className="text-slate-500">You have unsaved changes</span>}
            </div>
            <Button
              onClick={handleSave}
              disabled={isPending || saveStatus === 'saving'}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {saveStatus === 'saving' ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
              ) : (
                <><Save className="mr-2 h-4 w-4" />Save Settings</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Close account link */}
      <div className="pt-4 pb-8 text-center">
        <button
          onClick={() => setShowCloseModal(true)}
          className="text-xs text-red-400 hover:text-red-600 underline underline-offset-2 transition-colors"
        >
          Close your account
        </button>
      </div>

      {/* Close Account Confirmation Modal */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h3 className="text-lg font-semibold text-slate-900">Close Your Account</h3>
              </div>
              <button onClick={() => { setShowCloseModal(false); setCloseConfirmName(''); }} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              This will deactivate your account and hide your profile from all families.
              You will be signed out and will need to contact support to reactivate.
            </p>
            <div className="mb-2">
              <p className="text-xs text-slate-500 mb-1">
                Type <span className="font-semibold text-slate-700">{fullName}</span> to confirm
              </p>
              <Input
                value={closeConfirmName}
                onChange={(e) => setCloseConfirmName(e.target.value)}
                placeholder="Your full name"
                autoFocus
              />
            </div>
            <div className="flex gap-3 mt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setShowCloseModal(false); setCloseConfirmName(''); }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                disabled={!nameMatches || isDeactivating}
                onClick={handleDeactivate}
              >
                {isDeactivating ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Closing...</>
                ) : (
                  'Confirm & Close'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
