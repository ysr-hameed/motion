import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@slyxup/ui";
import { motionApi } from "~/lib/stack";

/** Authenticated Motion API access: token comes from the Stack session. */
export function useMotionToken(): string | undefined {
  const { sessionToken, client } = useAuth();
  return sessionToken ?? client.getToken() ?? undefined;
}

export function useMotionGet<T>(path: string | null) {
  const token = useMotionToken();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!path) return;
    setLoading(true);
    setError(null);
    motionApi<T>(token, path)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Load failed."))
      .finally(() => setLoading(false));
  }, [path, token]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}

export function PageHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      <div className="ml-auto flex items-center gap-2">{action}</div>
    </div>
  );
}

export function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-5xl p-4 md:p-6">{children}</div>;
}
