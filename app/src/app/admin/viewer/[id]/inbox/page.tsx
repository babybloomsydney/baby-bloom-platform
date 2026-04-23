import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NannyInboxClient } from "@/app/nanny/inbox/NannyInboxClient";
import { ParentInboxClient } from "@/app/parent/inbox/ParentInboxClient";
import { getPositionSummary } from "@/lib/actions/connection-helpers";
import type { ConnectionRequestWithDetails } from "@/lib/actions/connection";
import type { InboxMessage } from "@/lib/actions/inbox";

export default async function AdminViewerInboxPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const targetUserId = params.id;

  // Determine role
  const { data: roleData } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", targetUserId)
    .single();

  if (!roleData) redirect("/admin/users");

  const role = roleData.role as string;

  if (role === "nanny") {
    return renderNannyInbox(admin, targetUserId);
  }

  if (role === "parent") {
    return renderParentInbox(admin, targetUserId);
  }

  return (
    <div className="p-6 text-center text-slate-500">
      Inbox viewer not available for role: {role}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function renderNannyInbox(admin: any, targetUserId: string) {
  // Get nanny id
  const { data: nanny } = await admin
    .from("nannies")
    .select("id")
    .eq("user_id", targetUserId)
    .single();

  if (!nanny) {
    return <div className="p-6 text-center text-slate-500">Nanny record not found</div>;
  }

  const nannyId = nanny.id;

  // Fetch connection requests and inbox messages in parallel
  const [connectionsRes, inboxRes] = await Promise.all([
    admin
      .from("connection_requests")
      .select("*")
      .eq("nanny_id", nannyId)
      .order("created_at", { ascending: false }),
    admin
      .from("inbox_messages")
      .select("*")
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const connections = connectionsRes.data || [];
  const inboxMessages: InboxMessage[] = inboxRes.data || [];

  // Enrich connections with parent info
  let enrichedConnections: ConnectionRequestWithDetails[] = [];
  if (connections.length > 0) {
    const parentIds = Array.from(new Set(connections.map((r: { parent_id: string }) => r.parent_id)));
    const { data: parents } = await admin
      .from("parents")
      .select("id, user_id")
      .in("id", parentIds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parentMap = new Map<string, any>((parents || []).map((p: any) => [p.id, p]));
    const parentUserIds = (parents || []).map((p: { user_id: string }) => p.user_id);

    const { data: profiles } = await admin
      .from("user_profiles")
      .select("user_id, first_name, last_name, suburb")
      .in("user_id", parentUserIds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileMap = new Map<string, any>((profiles || []).map((p: any) => [p.user_id, p]));

    enrichedConnections = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      connections.map(async (req: any) => {
        const parent = parentMap.get(req.parent_id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const profile: any = parent ? profileMap.get(parent.user_id) : null;

        let position = null;
        if (req.position_id) {
          position = await getPositionSummary(req.position_id);
        }

        return {
          ...req,
          parent: {
            id: req.parent_id,
            user_id: parent?.user_id || "",
            first_name: profile?.first_name || "Unknown",
            last_name: profile?.last_name || "",
            suburb: profile?.suburb || "",
          },
          position,
        } as ConnectionRequestWithDetails;
      })
    );
  }

  const activeStatuses = ["pending", "accepted", "confirmed"];
  const pendingRequests = enrichedConnections.filter((r) =>
    activeStatuses.includes(r.status)
  );
  const pastConnections = enrichedConnections.filter(
    (r) => !activeStatuses.includes(r.status)
  );
  const notifications = inboxMessages.filter(
    (msg) =>
      !msg.reference_type ||
      msg.reference_type !== "connection_request" ||
      !["connection_request"].includes(msg.type)
  );

  const isEmpty =
    pendingRequests.length === 0 &&
    notifications.length === 0 &&
    pastConnections.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
        <p className="mt-1 text-slate-500">
          Connection requests and notifications
        </p>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={Inbox}
          title="Inbox is empty"
          description="No connection requests or notifications."
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function renderParentInbox(admin: any, targetUserId: string) {
  const { data: messages } = await admin
    .from("inbox_messages")
    .select("*")
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: false })
    .limit(50);

  const inboxMessages: InboxMessage[] = messages || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
        <p className="mt-1 text-slate-500">Notifications and updates</p>
      </div>

      {inboxMessages.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Inbox is empty"
          description="No notifications."
        />
      ) : (
        <ParentInboxClient messages={inboxMessages} />
      )}
    </div>
  );
}
