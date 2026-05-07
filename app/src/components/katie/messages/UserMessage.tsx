/**
 * User message row — right-aligned, white tile container, no tail.
 *
 * Bubble shape mirrors the universal tile pattern used across the
 * platform (e.g. `src/components/bapp/tiles/*Tile.tsx`):
 *   `rounded-xl border border-slate-200 bg-white shadow-sm`
 * — same corner radius, same outline, same shadow as every other
 * tile and tab head, so the user's messages read as the same
 * surface family as the rest of the UI rather than a chat-specific
 * gray pill.
 */

export function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm">
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}
