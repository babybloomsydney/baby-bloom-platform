import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Inbox, AlertCircle } from "lucide-react";
import { getInboxMessages } from "@/lib/actions/inbox";
import { getParentConnectionRequests } from "@/lib/actions/connection";
import { ParentInboxClient } from "./ParentInboxClient";
import { PreloadPublisher } from "@/components/preload/PreloadPublisher";

const INBOX_RECENT_CAP = 5;

export default async function ParentInboxPage() {
  // Latency:Efficiency build, WU8 — fetch connection requests
  // alongside inbox messages so the publisher can populate
  // connection_inbox. Promise.all keeps wall time bounded by the
  // slowest call.
  const [{ data: messages, error }, connectionsResult] = await Promise.all([
    getInboxMessages(),
    getParentConnectionRequests(),
  ]);
  if (connectionsResult.error) {
    // Surface in logs but don't fail the whole page — inbox messages
    // can still render. Per code-reviewer MEDIUM-3 on WU8 — silent
    // swallow would emit a misleading `pending_count: 0` to Katie.
    console.error(
      "[parent/inbox] getParentConnectionRequests failed:",
      connectionsResult.error,
    );
  }
  const activeStatuses = ["pending", "accepted", "confirmed"];
  const pendingConnections = connectionsResult.error
    ? []
    : connectionsResult.data.filter((r) => activeStatuses.includes(r.status));

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
          <p className="mt-1 text-slate-500">Notifications and updates</p>
        </div>
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Latency:Efficiency build, WU8 — surface-scoped publish.
          See nanny inbox publisher for shape rationale. */}
      <PreloadPublisher
        slots={{
          connection_inbox: {
            pending_count: pendingConnections.length,
            recent: pendingConnections.slice(0, INBOX_RECENT_CAP).map((r) => ({
              partner_name: `${r.nanny?.first_name ?? "Unknown"}${
                r.nanny?.last_name ? ` ${r.nanny.last_name[0]}.` : ""
              }`.trim(),
              received_at: r.created_at,
            })),
          },
        }}
      />
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
        <p className="mt-1 text-slate-500">Notifications and updates</p>
      </div>

      {messages.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Your inbox is empty"
          description="When you receive notifications about connections, verifications, or other updates, they'll appear here."
        />
      ) : (
        <ParentInboxClient messages={messages} />
      )}
    </div>
  );
}
