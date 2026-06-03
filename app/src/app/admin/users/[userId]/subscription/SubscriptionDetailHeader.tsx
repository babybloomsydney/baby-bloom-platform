"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink, UserCog, Baby } from "lucide-react";
import { UserDetailDrawer } from "@/app/admin/users/UserDetailDrawer";
import type { UserData } from "@/app/admin/users/page";
import type { ParentSubscriptionRow } from "./page";

interface Props {
  parentUserData: UserData | null;
  parentIsTestUser: boolean;
  nannyUserData: UserData | null;
  sub: ParentSubscriptionRow | null;
}

/** Top-of-page parent + nanny tiles with quick-access drawer buttons
 *  that open the same UserDetailDrawer used on `/admin/users` —
 *  inline, NOT a redirect. Bailey 2026-05-14. */
export function SubscriptionDetailHeader({
  parentUserData,
  parentIsTestUser,
  nannyUserData,
  sub,
}: Props) {
  const [drawerUser, setDrawerUser] = useState<UserData | null>(null);

  const parentName = parentUserData
    ? [parentUserData.first_name, parentUserData.last_name]
        .filter(Boolean)
        .join(" ") ||
      parentUserData.email ||
      parentUserData.user_id.slice(0, 8)
    : "—";
  const nannyName = nannyUserData
    ? [nannyUserData.first_name, nannyUserData.last_name]
        .filter(Boolean)
        .join(" ") ||
      nannyUserData.email ||
      nannyUserData.user_id.slice(0, 8)
    : null;

  return (
    <>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <PartyCard
          kind="parent"
          name={parentName}
          email={parentUserData?.email ?? null}
          phone={parentUserData?.mobile_number ?? null}
          isTestUser={parentIsTestUser}
          onOpenProfile={() => parentUserData && setDrawerUser(parentUserData)}
          stripeCustomerHref={
            sub?.stripe_customer_id
              ? `https://dashboard.stripe.com/test/customers/${sub.stripe_customer_id}`
              : null
          }
        />
        {nannyUserData && nannyName ? (
          <PartyCard
            kind="nanny"
            name={nannyName}
            email={nannyUserData.email}
            phone={nannyUserData.mobile_number}
            isTestUser={false}
            onOpenProfile={() => setDrawerUser(nannyUserData)}
            stripeCustomerHref={null}
          />
        ) : (
          <Card className="border-dashed bg-slate-50/50">
            <CardContent className="flex flex-col items-center justify-center gap-1 py-8 text-center">
              <Baby className="h-5 w-5 text-slate-400" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-600">
                No nanny linked yet
              </p>
              <p className="text-xs text-slate-500">
                Parent hasn&apos;t connected any nanny via the child invite
                flow.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <UserDetailDrawer
        user={drawerUser}
        open={drawerUser !== null}
        onOpenChange={(o) => {
          if (!o) setDrawerUser(null);
        }}
      />
    </>
  );
}

interface PartyCardProps {
  kind: "parent" | "nanny";
  name: string;
  email: string | null;
  phone: string | null;
  isTestUser: boolean;
  onOpenProfile: () => void;
  stripeCustomerHref: string | null;
}

function PartyCard({
  kind,
  name,
  email,
  phone,
  isTestUser,
  onOpenProfile,
  stripeCustomerHref,
}: PartyCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {kind === "parent" ? "Parent" : "Linked nanny"}
            </p>
            <h2 className="mt-1 truncate text-lg font-bold text-slate-900">
              {name}
            </h2>
            {email && (
              <p className="truncate text-sm text-slate-600">{email}</p>
            )}
            {phone && (
              <p className="truncate text-sm text-slate-500">{phone}</p>
            )}
          </div>
          {isTestUser && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Test
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenProfile}
            className="inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100"
          >
            <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
            Open profile
          </button>
          {stripeCustomerHref && (
            <a
              href={stripeCustomerHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Stripe Dashboard
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
