import { Link } from "react-router-dom";
import { ArrowRight, Clapperboard, Download, FileVideo, X } from "lucide-react";
import { Alert, Button, EmptyState, LoadingPage } from "~/components/ui";
import { motionApi } from "~/lib/stack";
import { Page as AppPage, PageHeader, useMotionGet, useMotionToken } from "./data";

interface ExportRow {
  id: string;
  preset: string;
  format: string | null;
  cdn_url: string | null;
  file_size_bytes: number | null;
  created_at: number;
}

export default function Downloads() {
  const token = useMotionToken();
  const { data, loading, error, reload } = useMotionGet<{ exports: ExportRow[] }>(
    "/api/exports",
  );

  const remove = (id: string) => {
    if (!confirm("Delete this file?")) return;
    motionApi(token, `/api/exports/${encodeURIComponent(id)}`, { method: "DELETE" })
      .then(() => reload())
      .catch(() => undefined);
  };

  return (
    <AppPage>
      <PageHeader
        title="Downloads"
        action={
          <span className="text-[11px] font-bold text-dim">{data?.exports.length ?? 0} files</span>
        }
      />
      <p className="mb-5 text-sm font-medium text-muted">
        Finished renders land here. Hit <span className="font-extrabold text-paper">Export</span> in the Studio, pick MP4 or WebM, and come back for the file.
      </p>
      {loading ? (
        <LoadingPage />
      ) : error ? (
        <Alert>{error}</Alert>
      ) : !data?.exports.length ? (
        <EmptyState
          icon={Clapperboard}
          title="No renders yet"
          body="Finish a cut in the Studio and export it — your MP4 or WebM will show up here."
          action={
            <Link to="/studio">
              <Button>
                Open Studio
                <ArrowRight size={15} aria-hidden />
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3">
          {data.exports.map((x) => (
            <div key={x.id} className="panel-lift card-hover flex items-center gap-4 p-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-paper text-ink">
                <FileVideo size={20} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-extrabold text-paper">{x.preset}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs font-bold text-dim">
                  <span className="rounded-full bg-panel-2 px-2 py-0.5 text-paper">{x.format ?? "Video"}</span>
                  <span>{x.file_size_bytes ? `${(x.file_size_bytes / 1048576).toFixed(1)} MB` : ""}</span>
                  <span>· {new Date(x.created_at).toLocaleDateString()}</span>
                </p>
              </div>
              {x.cdn_url ? (
                <a
                  href={x.cdn_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-paper px-5 text-sm font-extrabold text-ink transition-colors hover:bg-tungsten hover:text-white"
                >
                  <Download size={15} aria-hidden />
                  Download
                </a>
              ) : (
                <span className="shrink-0 text-xs font-bold text-dim">Rendering…</span>
              )}
              <button
                onClick={() => remove(x.id)}
                aria-label="Delete file"
                title="Delete file"
                className="shrink-0 rounded-full p-1.5 text-dim transition-colors hover:bg-bad/10 hover:text-bad"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
    </AppPage>
  );
}
