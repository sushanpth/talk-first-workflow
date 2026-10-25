import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from '@codemirror/autocomplete';
import type { LinkTarget } from '../types.ts';
import { inCode } from './syntax.ts';

/** `[[` completes note titles and memory notes; picking one closes the link. */
export function wikiLinkCompletion(targets: () => readonly LinkTarget[]): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/\[\[[^[\]|#\n]*$/);
    if (!match || inCode(context.state, match.from)) return null;
    const options = targets().map(
      (t): Completion => ({
        label: t.label,
        detail: t.kind === 'memory' ? 'memory' : undefined,
        apply: (view, completion, from, to) => {
          const closed = view.state.sliceDoc(to, to + 2) === ']]';
          const insert = closed ? completion.label : `${completion.label}]]`;
          view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: from + completion.label.length + 2 },
            userEvent: 'input.complete',
          });
        },
      }),
    );
    return { from: match.from + 2, options, validFor: /^[^[\]|#\n]*$/ };
  };
}

/** `#` completes existing tags. */
export function tagCompletion(tags: () => readonly string[]): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/(?<=^|[\s(])#[\p{L}\p{N}_/-]*$/u);
    if (!match || inCode(context.state, match.from)) return null;
    return {
      from: match.from + 1,
      options: tags().map((tag): Completion => ({ label: tag })),
      validFor: /^[\p{L}\p{N}_/-]*$/u,
    };
  };
}
