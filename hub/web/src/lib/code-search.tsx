import type { ReactNode } from 'react';
import type { CodeMatch } from '@/lib/code-api';

/** Splits `text` around case-(in)sensitive matches of `q` for highlighting. */
export function highlight(text: string, q: string, matchCase: boolean): ReactNode[] {
  const hay = matchCase ? text : text.toLowerCase();
  const needle = matchCase ? q : q.toLowerCase();
  const out: ReactNode[] = [];
  let from = 0;
  for (let at = hay.indexOf(needle); needle && at !== -1; at = hay.indexOf(needle, from)) {
    out.push(text.slice(from, at), <mark key={at}>{text.slice(at, at + needle.length)}</mark>);
    from = at + needle.length;
  }
  out.push(text.slice(from));
  return out;
}

/** Groups consecutive matches by file, keeping their order. */
export function groupByFile(matches: CodeMatch[]): { path: string; matches: CodeMatch[] }[] {
  const groups: { path: string; matches: CodeMatch[] }[] = [];
  for (const m of matches) {
    const last = groups.at(-1);
    if (last?.path === m.path) last.matches.push(m);
    else groups.push({ path: m.path, matches: [m] });
  }
  return groups;
}
