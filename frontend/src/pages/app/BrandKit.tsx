import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, Field, LoadingPage } from "~/components/ui";
import { MotionApiError, motionApi, motionUpload } from "~/lib/stack";
import { Page, PageHeader, useMotionToken } from "./data";

interface BrandKit {
  logo_primary_url: string | null;
  logo_dark_url: string | null;
  colors: string | null;
  font_heading: string | null;
  font_body: string | null;
}

export default function BrandKit() {
  const token = useMotionToken();
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gated, setGated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [colors, setColors] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadLogo = (file: File) => {
    setUploading(true);
    setError(null);
    motionUpload(token, "/api/brand-kit/upload", file)
      .then((res) => setKit({ ...(kit ?? ({} as BrandKit)), logo_primary_url: res.url }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Upload failed."))
      .finally(() => setUploading(false));
  };

  useEffect(() => {
    motionApi<{ brandKit: BrandKit | null }>(token, "/api/brand-kit")
      .then((res) => {
        setKit(res.brandKit);
        try {
          const parsed = res.brandKit?.colors ? JSON.parse(res.brandKit.colors) : [];
          if (Array.isArray(parsed)) setColors(parsed.join(", "));
        } catch {
          setColors(res.brandKit?.colors ?? "");
        }
      })
      .catch((err: unknown) => {
        if (err instanceof MotionApiError && err.code === "upgrade_required") setGated(true);
        else setError(err instanceof Error ? err.message : "Load failed.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const list = colors.split(",").map((c) => c.trim()).filter(Boolean);
    motionApi(token, "/api/brand-kit", {
      method: "PUT",
      body: JSON.stringify({
        logo_primary_url: kit?.logo_primary_url ?? null,
        logo_dark_url: kit?.logo_dark_url ?? null,
        colors: JSON.stringify(list),
        font_heading: kit?.font_heading ?? null,
        font_body: kit?.font_body ?? null,
      }),
    })
      .then(() => undefined)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Save failed."))
      .finally(() => setSaving(false));
  };

  if (loading) return <Page><LoadingPage /></Page>;
  if (gated) {
    return (
      <Page>
        <PageHeader title="Brand Kit" />
        <Card>
          <p className="text-sm text-muted">Brand Kit is a Pro feature.</p>
          <Link to="/pricing" className="mt-3 inline-block">
            <Button size="sm">See Plans</Button>
          </Link>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title="Brand Kit" />
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      <form onSubmit={save} className="flex max-w-xl flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">Primary logo</span>
          {kit?.logo_primary_url ? (
            <img src={kit.logo_primary_url} alt="Primary logo" className="h-16 w-fit rounded-md border border-line bg-ink object-contain p-2" />
          ) : null}
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadLogo(f);
                e.target.value = "";
              }}
            />
            <Button type="button" size="sm" variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()}>
              Upload Logo
            </Button>
          </div>
        </div>
        <Field
          label="Primary logo URL"
          value={kit?.logo_primary_url ?? ""}
          onChange={(e) => setKit({ ...(kit ?? {} as BrandKit), logo_primary_url: e.target.value })}
        />
        <Field
          label="Dark-mode logo URL"
          value={kit?.logo_dark_url ?? ""}
          onChange={(e) => setKit({ ...(kit ?? {} as BrandKit), logo_dark_url: e.target.value })}
        />
        <Field
          label="Brand colors (comma-separated hex)"
          placeholder="#FFB340, #0E0F13"
          value={colors}
          onChange={(e) => setColors(e.target.value)}
        />
        <Field
          label="Heading font"
          value={kit?.font_heading ?? ""}
          onChange={(e) => setKit({ ...(kit ?? {} as BrandKit), font_heading: e.target.value })}
        />
        <Field
          label="Body font"
          value={kit?.font_body ?? ""}
          onChange={(e) => setKit({ ...(kit ?? {} as BrandKit), font_body: e.target.value })}
        />
        <div><Button type="submit" loading={saving}>Save Brand Kit</Button></div>
      </form>
    </Page>
  );
}
