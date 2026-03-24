'use client';

import Link from 'next/link';
import type { CheckpointConfig } from '@/lib/legal/types';

interface ConsentCheckboxGroupProps {
  checkpoints: CheckpointConfig[];
  checked: Record<string, boolean>;
  onChange: (id: string, checked: boolean) => void;
  disabled?: boolean;
}

function renderTextWithLinks(text: string, links?: { label: string; href: string }[]) {
  if (!links || links.length === 0) return text;

  let result: (string | JSX.Element)[] = [text];

  for (const link of links) {
    const newResult: (string | JSX.Element)[] = [];
    for (const part of result) {
      if (typeof part !== 'string') {
        newResult.push(part);
        continue;
      }
      // Match [Label] pattern
      const bracketPattern = `[${link.label}]`;
      const idx = part.indexOf(bracketPattern);
      if (idx !== -1) {
        if (idx > 0) newResult.push(part.slice(0, idx));
        newResult.push(
          <Link
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-600 underline hover:text-violet-700"
            onClick={(e) => e.stopPropagation()}
          >
            {link.label}
          </Link>
        );
        const after = part.slice(idx + bracketPattern.length);
        if (after) newResult.push(after);
      } else {
        // Try matching the label directly in the text
        const directIdx = part.indexOf(link.label);
        if (directIdx !== -1) {
          if (directIdx > 0) newResult.push(part.slice(0, directIdx));
          newResult.push(
            <Link
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-600 underline hover:text-violet-700"
              onClick={(e) => e.stopPropagation()}
            >
              {link.label}
            </Link>
          );
          const after = part.slice(directIdx + link.label.length);
          if (after) newResult.push(after);
        } else {
          newResult.push(part);
        }
      }
    }
    result = newResult;
  }

  return <>{result}</>;
}

export function ConsentCheckboxGroup({
  checkpoints,
  checked,
  onChange,
  disabled = false,
}: ConsentCheckboxGroupProps) {
  return (
    <div className="space-y-1.5">
      {checkpoints.map((cp) => (
        <label
          key={cp.id}
          className={`flex items-start gap-2 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input
            type="checkbox"
            checked={checked[cp.id] || false}
            onChange={(e) => !disabled && onChange(cp.id, e.target.checked)}
            disabled={disabled}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
          />
          <span className="text-xs text-slate-500 leading-relaxed">
            {renderTextWithLinks(cp.text, cp.links)}
          </span>
        </label>
      ))}
    </div>
  );
}
