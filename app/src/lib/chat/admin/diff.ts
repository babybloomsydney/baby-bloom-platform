/**
 * Minimal line-level diff for prompt-edit previews.
 *
 * Not a full Myers diff — an LCS-based line diff is plenty for our use
 * case: each prompt section is a few hundred lines at most, and the
 * reader is Gemini + a human, not a patch tool. The output reads
 * naturally (`+ added`, `- removed`) and is deterministic.
 */

export interface LineDiff {
  added: number;
  removed: number;
  unified: string;
}

function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp;
}

export function lineDiff(before: string, after: string): LineDiff {
  if (before === after) return { added: 0, removed: 0, unified: "" };

  const a = before.split("\n");
  const b = after.split("\n");
  const dp = lcsTable(a, b);

  const out: string[] = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push(`  ${a[i]}`);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`- ${a[i]}`);
      removed++;
      i++;
    } else {
      out.push(`+ ${b[j]}`);
      added++;
      j++;
    }
  }
  while (i < a.length) {
    out.push(`- ${a[i]}`);
    removed++;
    i++;
  }
  while (j < b.length) {
    out.push(`+ ${b[j]}`);
    added++;
    j++;
  }

  return { added, removed, unified: out.join("\n") };
}
