"use client";

/**
 * A nanny's name rendered as a button that opens the user drawer, or plain text when there's no
 * user_id to open. Narrows `userId` to a non-null string before the click closure (no cast) and
 * carries a designed focus-visible ring + aria-label.
 */
export function NannyNameLink({
  userId,
  name,
  onOpenUser,
}: {
  userId: string | null;
  name: string;
  onOpenUser: (userId: string) => void;
}) {
  if (!userId)
    return <span className="font-medium text-slate-800">{name}</span>;
  return (
    <button
      type="button"
      onClick={() => onOpenUser(userId)}
      aria-label={`Open ${name}'s profile`}
      className="rounded-sm font-medium text-violet-600 hover:text-violet-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1"
    >
      {name}
    </button>
  );
}
