import { useState } from "react";
import { PublicShell } from "~/components/layout";
import { Alert, Button, Card, Field } from "~/components/ui";
import { motionApi } from "~/lib/stack";

const TOPICS = ["bug", "feature", "billing", "other"] as const;

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>("other");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

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
      <section className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl font-bold tracking-tight">Contact</h1>
        <div className="mt-6 grid gap-4 text-sm md:grid-cols-3">
          <Card><p className="text-dim">Email</p><p className="mt-1">hello@slyxup.com</p></Card>
          <Card><p className="text-dim">X</p><p className="mt-1">@slyxup</p></Card>
          <Card><p className="text-dim">Support</p><p className="mt-1">Replies within 2 days</p></Card>
        </div>
        {sent ? (
          <div className="mt-6"><Alert tone="success">Message received — we'll reply to your email.</Alert></div>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            {error ? <Alert>{error}</Alert> : null}
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
              <Field label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="topic" className="text-xs text-muted">Topic</label>
              <select
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value as (typeof TOPICS)[number])}
                className="h-10 rounded-md border border-line bg-panel px-3 text-sm outline-none focus:border-tungsten"
              >
                <option value="bug">Bug report</option>
                <option value="feature">Feature request</option>
                <option value="billing">Billing</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="message" className="text-xs text-muted">Message</label>
              <textarea
                id="message"
                required
                minLength={10}
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="rounded-md border border-line bg-panel px-3 py-2.5 text-sm outline-none placeholder:text-dim focus:border-tungsten"
                placeholder="What happened, and what did you expect?"
              />
            </div>
            <div><Button type="submit" loading={busy}>Send Message</Button></div>
          </form>
        )}
      </section>
    </PublicShell>
  );
}
