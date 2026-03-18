"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { signUpAndConvertLead } from "@/lib/actions/lead-conversion";
import {
  Loader2,
  ShieldCheck,
  CheckCircle,
  Sparkles,
  MapPin,
  ArrowRight,
} from "lucide-react";

const signupSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SignupFormData = z.infer<typeof signupSchema>;

interface MatchSummary {
  totalEligible: number;
  topMatchName: string;
  topMatchSuburb: string | null;
  topMatchScore: number;
  topMatchPhoto: string | null;
}

interface MatchmakingSignupClientProps {
  leadId: string;
  matchSummary: MatchSummary | null;
}

export function MatchmakingSignupClient({
  leadId,
  matchSummary,
}: MatchmakingSignupClientProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(data: SignupFormData) {
    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("email", data.email);
    formData.append("password", data.password);
    formData.append("firstName", data.firstName);
    formData.append("lastName", data.lastName);
    formData.append("role", "parent");

    const result = await signUpAndConvertLead(formData, leadId);

    if (result.error) {
      setError(result.error);
      setIsLoading(false);
    } else if (result.redirectTo) {
      setIsRedirecting(true);
      window.location.href = result.redirectTo;
    }
  }

  if (isRedirecting) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500 mb-3" />
        <p className="text-sm text-slate-500">
          Setting up your account & matches...
        </p>
      </div>
    );
  }

  const initials = matchSummary
    ? matchSummary.topMatchName[0]
    : "";

  return (
    <div className="min-h-[100dvh] flex flex-col bg-white relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute top-[-60px] right-[-40px] w-64 h-64 bg-violet-100 rounded-full blur-3xl opacity-50 pointer-events-none" />
      <div className="absolute bottom-[10%] left-[-60px] w-48 h-48 bg-violet-200 rounded-full blur-3xl opacity-30 pointer-events-none" />

      <div className="relative flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-6">
            <Link href="/">
              <h1 className="text-2xl font-bold text-violet-500">
                Baby Bloom
              </h1>
            </Link>
          </div>

          {/* Match context banner */}
          {matchSummary && (
            <div className="mb-6 rounded-2xl bg-violet-50 border border-violet-100 p-4">
              <div className="flex items-center gap-1.5 justify-center mb-3">
                <Sparkles className="w-4 h-4 text-violet-500" />
                <p className="text-sm font-semibold text-violet-700">
                  Your {matchSummary.totalEligible} matches are waiting
                </p>
              </div>

              {/* Top match preview */}
              <div className="flex items-center gap-3 bg-white rounded-xl p-3 border border-violet-100">
                {matchSummary.topMatchPhoto ? (
                  <img
                    src={matchSummary.topMatchPhoto}
                    alt={matchSummary.topMatchName}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
                    <span className="text-sm font-semibold text-violet-500">
                      {initials}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {matchSummary.topMatchName}
                  </p>
                  {matchSummary.topMatchSuburb && (
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {matchSummary.topMatchSuburb}
                    </p>
                  )}
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-green-100 text-green-700">
                  {matchSummary.topMatchScore}% match
                </span>
              </div>

              <p className="text-xs text-slate-400 text-center mt-2">
                {matchSummary.totalEligible > 1
                  ? `+ ${matchSummary.totalEligible - 1} more verified nannies`
                  : "Your top match is ready"}
              </p>
            </div>
          )}

          {/* Form card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-xl font-bold text-slate-900 text-center mb-1">
              Create your account
            </h2>
            <p className="text-sm text-slate-400 text-center mb-5">
              We&apos;ll connect you with your top nannies
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-3.5"
              >
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-slate-500">
                          First name
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Jane"
                            autoComplete="given-name"
                            disabled={isLoading}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-slate-500">
                          Last name
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Smith"
                            autoComplete="family-name"
                            disabled={isLoading}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-slate-500">
                        Email
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          autoComplete="email"
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-slate-500">
                        Password
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Min 8 characters"
                          autoComplete="new-password"
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-slate-500">
                        Confirm password
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Confirm your password"
                          autoComplete="new-password"
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full h-12 bg-violet-500 hover:bg-violet-600 text-white font-semibold shadow-md shadow-violet-200"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    <>
                      Create account & connect
                      <ArrowRight className="ml-2 w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </div>

          {/* Trust signals */}
          <div className="flex items-center justify-center gap-4 mt-4">
            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
              WWCC verified
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
              <CheckCircle className="w-3.5 h-3.5 text-violet-500" />
              200+ families
            </span>
          </div>

          {/* Sign in link */}
          <p className="text-center text-sm mt-4">
            <span className="text-slate-400">Already have an account? </span>
            <Link
              href="/login"
              className="text-violet-500 font-medium hover:underline"
            >
              Sign in
            </Link>
          </p>

          {/* Terms */}
          <p className="text-center text-xs text-slate-300 mt-4">
            By continuing, you agree to our{" "}
            <Link href="/terms" className="text-violet-400 hover:underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-violet-400 hover:underline">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
