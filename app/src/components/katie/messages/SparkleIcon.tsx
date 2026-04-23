/**
 * Minimal sparkle / diamond accent used beside assistant messages.
 * Aligns with BabyBloom violet brand. Decorative — aria-hidden.
 */

export function SparkleIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
    >
      <path
        d="M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4z"
        fill="currentColor"
      />
    </svg>
  );
}
