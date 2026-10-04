import { useState } from "react";
import { AtSign, CheckCircle2, Copy, Mail, MessageCircle, Send } from "lucide-react";
import { PublicShell } from "~/components/layout";
import { Magnetic, Reveal } from "~/components/motion";
import { Alert, Button, Field } from "~/components/ui";
import { motionApi } from "~/lib/stack";

const TOPICS = ["bug", "feature", "billing", "other"] as const;
const TOPIC_LABEL: Record<(typeof TOPICS)[number], string> = {
  bug: "Bug report",
  feature: "Feature request",
  billing: "Billing",
  other: "Other",
};

const CHANNELS = [
  { icon: Mail, label: "Email", value: "hello@slyxup.com", href: "mailto:hello@slyxup.com" },
  { icon: AtSign, label: "X", value: "@slyxup", href: "https://x.com/slyxup" },
  { icon: MessageCircle, label: "Support", value: "Replies in 2 days", href: undefined },
];

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>("other");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    motionApi(undefined, "/api/contact", {
      method: "POST",
      body: JSON.stringify({ name: name.trim(), email: email.trim(), topic, message: message.trim() }),
    })
      .then(() => setSent(true))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Send failed."))
      .finally(() => setBusy(false));
  };

  return (
    <PublicShell>
      <section className="dots relative overflow-hidden">
        <div className="relative mx-auto max-w-2xl px-4 pb-12 pt-14 md:pt-20">
          <Reveal className="text-center">
            <span className="sticker inline-block rotate-1 rounded-full bg-tungsten px-4 py-1.5 text-xs font-extrabold uppercase tracking-widest text-white">
              Talk to a human
            </span>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight md:text-6xl">
              Stuck on a cut? <span className="hl">Say cut.</span>
            </h1>
            <p className="mt-3 font-medium text-muted">Bugs, billing, features, press — one inbox, two-day replies.</p>
          </Reveal>

          <Reveal delay={100}>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {CHANNELS.map((c, i) => (
                <div key={c.label} className={`panel-lift card-hover p-4 ${i === 1 ? "rotate-1" : i === 2 ? "-rotate-1" : ""}`}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-paper text-ink">
                    <c.icon size={16} aria-hidden />
                  </span>
                  <p className="mt-2.5 text-[11px] font-extrabold uppercase tracking-widest text-dim">{c.label}</p>
                  {c.href ? (
                    <a href={c.href} className="mt-0.5 block truncate text-sm font-extrabold text-tungsten hover:underline">
                      {c.value}
                    </a>
                  ) : (
                    <p className="mt-0.5 text-sm font-extrabold text-paper">{c.value}</p>
                  )}
                </div>
              ))}
            </div>
          </Reveal>

          {sent ? (
            <Reveal delay={140}>
              <div className="panel-lift mt-5 p-8 text-center">
                <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-ok/15">
                  <CheckCircle2 size={26} className="text-ok" aria-hidden />
                </span>
                <Alert tone="success">Message received — we'll reply to {email} within 2 days.</Alert>
                <button onClick={() => { setSent(false); setMessage(""); }} className="mt-4 text-sm font-bold text-muted underline-offset-2 hover:text-paper hover:underline">
                  Send another
                </button>
              </div>
            </Reveal>
          ) : (
            <Reveal delay={140}>
              <form onSubmit={submit} className="panel-lift mt-5 flex flex-col gap-4 p-6 md:p-8">
                {error ? <Alert>{error}</Alert> : null}
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" />
                  <Field label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ada@studio.com" />
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold text-paper">Topic</span>
                  <div className="flex flex-wrap gap-2">
                    {TOPICS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTopic(t)}
                        aria-pressed={topic === t}
                        className={`rounded-full border-[1.5px] px-4 py-1.5 text-xs font-extrabold transition-all ${topic === t ? "border-paper bg-paper text-ink shadow-[2px_2px_0_rgb(217_72_0)]" : "border-line text-muted hover:border-paper/40 hover:text-paper"}`}
                      >
                        {TOPIC_LABEL[t]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="message" className="text-xs font-bold text-paper">
                    Message <span className="font-medium text-dim">({message.length}/2000)</span>
                  </label>
                  <textarea
                    id="message"
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={5}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="rounded-xl border-[1.5px] border-line bg-ink px-3.5 py-3 text-sm font-medium outline-none transition-all placeholder:font-normal placeholder:text-dim focus:border-tungsten focus:shadow-[0_0_0_3px_rgb(217_72_0/0.15)]"
                    placeholder="What happened, and what did you expect? Links welcome."
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Magnetic>
                    <Button type="submit" loading={busy} size="lg">
                      <Send size={15} aria-hidden /> Send message
                    </Button>
                  </Magnetic>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText("hello@slyxup.com").then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1600);
                      });
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-muted hover:text-paper"
                  >
                    <Copy size={13} aria-hidden /> {copied ? "Copied!" : "Copy email instead"}
                  </button>
                </div>
              </form>
            </Reveal>
          )}
        </div>
      </section>
    </PublicShell>
  );
}
