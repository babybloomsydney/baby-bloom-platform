"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { replyToContactMessage } from "@/lib/actions/admin/replyToContactMessage";

interface ReplyFormProps {
  messageId: string;
  defaultSubject: string;
}

export function ReplyForm({ messageId, defaultSubject }: ReplyFormProps) {
  const router = useRouter();
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (subject.trim().length === 0 || body.trim().length === 0) {
      setError("Subject and body are required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await replyToContactMessage({ messageId, subject, body });
      if (!r.success) {
        setError(
          r.error === "forbidden"
            ? "You don't have permission to reply here."
            : r.error === "message_not_found"
              ? "Message not found."
              : "Couldn't send the reply. Try again.",
        );
        return;
      }
      setSent(true);
      router.refresh();
    });
  }

  if (sent) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Reply sent + logged.
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div>
        <Label htmlFor="reply-subject">Subject</Label>
        <Input
          id="reply-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="reply-body">Reply</Label>
        <Textarea
          id="reply-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          maxLength={8000}
          className="mt-1"
          placeholder="Hi {name}, ..."
        />
        <p className="mt-1 text-xs text-slate-400">{body.length} / 8000</p>
      </div>
      <Button
        size="lg"
        className="bg-violet-600 hover:bg-violet-700"
        disabled={isPending}
        onClick={submit}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          "Send reply"
        )}
      </Button>
    </div>
  );
}
