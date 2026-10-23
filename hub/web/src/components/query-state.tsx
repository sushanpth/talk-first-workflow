import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api';

export function ErrorBox({ error }: { error: Error }) {
  const expired = error instanceof ApiError && error.status === 401;
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
      {expired
        ? 'This hub session has ended. Open it again from Claude, or run `node hub/cli.ts open` in the plugin folder.'
        : error.message}
    </div>
  );
}

/** Loading and error states for one query; renders `children` with the data. */
export function QueryState<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (query.isError) return <ErrorBox error={query.error} />;
  return <>{children(query.data)}</>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
