/**
 * User message row — right-aligned, subtle slate-100 container, no tail.
 */

export function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-900">
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}
