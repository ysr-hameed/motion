import { useState } from "react";
import { Alert, Button, Card, LoadingPage } from "~/components/ui";
import { motionApi } from "~/lib/stack";
import { Page, PageHeader, useMotionGet, useMotionToken } from "./data";

interface ExportRow {
  id: string;
  preset: string;
  format: string | null;
  cdn_url: string | null;
  file_size_bytes: number | null;
  created_at: number;
}

export default function Exports() {
  const token = useMotionToken();
  const { data, loading, error, reload } = useMotionGet<{ exports: ExportRow[] }>(
    "/api/exports",
  );
  const [notice, setNotice] = useState<string | null>(null);

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(
      () => setNotice("Copied to clipboard ✓"),
      () => setNotice("Copy failed — select the link manually."),
    );
  };

  const share = (id: string) => {
    motionApi<{ url: string }>(token, `/api/exports/${encodeURIComponent(id)}/share`, { method: "POST" })
      .then((res) => {
        setNotice(null);
        copy(res.url);
      })
      .catch((err: unknown) => setNotice(err instanceof Error ? err.message : "Share failed."));
  };

  const remove = (id: string) => {
    if (!confirm("Delete this export record?")) return;
    motionApi(token, `/api/exports/${encodeURIComponent(id)}`, { method: "DELETE" })
      .then(() => reload())
      .catch(() => undefined);
  };

  return (
    <Page>
      <PageHeader title="Exports" />
      <p className="mb-4 text-xs text-dim">CDN URLs expire in 30 days on Free, permanent on Pro+.</p>
      {notice ? <div className="mb-3"><Alert tone="info">{notice}</Alert></div> : null}
      {loading ? (
        <LoadingPage />
      ) : error ? (
        <Alert>{error}</Alert>
      ) : !data?.exports.length ? (
        <Card><p className="text-center text-sm text-muted">No exports yet — finish a cut in the Studio, then export.</p></Card>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-dim">
                <th className="p-3">File</th>
                <th className="p-3">Format</th>
                <th className="p-3">Size</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.exports.map((x) => (
                <tr key={x.id} className="border-b border-line-soft last:border-0">
                  <td className="p-3 font-mono text-xs">{x.preset}</td>
                  <td className="p-3 text-muted">{x.format ?? "—"}</td>
                  <td className="p-3 text-muted">
                    {x.file_size_bytes ? `${(x.file_size_bytes / 1048576).toFixed(1)} MB` : "—"}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {x.cdn_url ? (
                        <>
                          <a href={x.cdn_url} target="_blank" rel="noreferrer" className="text-xs text-tungsten hover:underline">
                            Download
                          </a>
                          <button onClick={() => copy(x.cdn_url!)} className="text-xs text-muted hover:text-paper">
                            Copy URL
                          </button>
                        </>
                      ) : null}
                      <button onClick={() => share(x.id)} className="text-xs text-muted hover:text-paper">
                        Share
                      </button>
                      <button onClick={() => remove(x.id)} className="text-xs text-muted hover:text-bad">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4"><Button variant="secondary" size="sm" onClick={() => reload()}>Refresh</Button></div>
    </Page>
  );
}
