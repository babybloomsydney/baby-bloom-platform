import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Inbox, AlertCircle } from "lucide-react";
import { getNannyConnectionRequests } from "@/lib/actions/connection";
import { getInboxMessages } from "@/lib/actions/inbox";
import { NannyInboxClient } from "./NannyInboxClient";
import { PreloadPublisher } from "@/components/preload/PreloadPublisher";

const INBOX_RECENT_CAP = 5;

export default async function NannyInboxPage() {
  const [connectionsResult, inboxResult] = await Promise.all([
    getNannyConnectionRequests(),
    getInboxMessages(),
  ]);

  if (connectionsResult.error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
          <p className="mt-1 text-slate-500">
            Connection requests and notifications
          </p>
        </div>
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-red-600">{connectionsResult.error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeStatuses = ["pending", "accepted", "confirmed"];
  const pendingRequests = connectionsResult.data.filter((r) =>
    activeStatuses.includes(r.status),
  );
  const pastConnections = connectionsResult.data.filter(
    (r) => !activeStatuses.includes(r.status),
  );
  const notifications = inboxResult.data.filter(
    (msg) =>
      !msg.reference_type ||
      msg.reference_type !== "connection_request" ||
      !["connection_request"].includes(msg.type),
  );

  const isEmpty =
    pendingRequests.length === 0 &&
    notifications.length === 0 &&
    pastConnections.length === 0;

  return (
    <div className="space-y-6">
      {/* Latency:Efficiency build, WU8 — surface-scoped publish.
          connection_inbox is intentionally absent from the always-on
          builder (D-04 amendment 2026-05-09) and only fires on this
          page. read_connection_inbox short-circuits when the slot is
          present. */}
      <PreloadPublisher
        slots={{
          connection_inbox: {
            pending_count: pendingRequests.length,
            recent: pendingRequests.slice(0, INBOX_RECENT_CAP).map((r) => ({
              partner_name: `${r.parent?.first_name ?? "Unknown"}${
                r.parent?.last_name ? ` ${r.parent.last_name[0]}.` : ""
              }`.trim(),
              received_at: r.created_at,
            })),
          },
        }}
      />
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
        <p className="mt-1 text-slate-500">
          Connection requests and notifications
        </p>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={Inbox}
          title="Your inbox is empty"
          description="When families send connection requests or you receive notifications, they'll appear here."
        />
      ) : (
        <NannyInboxClient
          pendingRequests={pendingRequests}
          notifications={notifications}
          pastConnections={pastConnections}
        />
      )}
    </div>
  );
}
