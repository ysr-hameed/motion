/**
 * Fire-and-forget DO → REST sync. The Chat DO owns composition content; the
 * D1 metadata row (created by the browser's authenticated attach call) and
 * the analytics table live behind /api/internal/*, signed by INTERNAL_SECRET.
 * Everything here is advisory — it must never break a turn.
 */

interface SyncAgent {
  ctx: { waitUntil(p: Promise<unknown>): void };
  env: Record<string, string | undefined>;
}

export interface TurnMeta {
  title?: string | null;
  duration_s?: number | null;
  fps?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface TurnAnalytics {
  brief?: string;
  total_time_ms?: number;
  tool_calls?: number;
  errors_count?: number;
}

export function queueTurnSync(
  agent: SyncAgent,
  compositionId: string,
  meta: TurnMeta,
  analytics: TurnAnalytics,
): void {
  try {
    const base = agent.env.WORKER_SELF_URL;
    const secret = agent.env.INTERNAL_SECRET;
    if (!base || !secret || !compositionId) return;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    };
    agent.ctx.waitUntil(
      (async () => {
        try {
          await fetch(
            `${base}/api/internal/compositions/${encodeURIComponent(compositionId)}`,
            { method: "PATCH", headers, body: JSON.stringify(meta) },
          );
          await fetch(`${base}/api/internal/analytics`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              composition_id: compositionId,
              session_id: compositionId,
              ...analytics,
            }),
          });
        } catch (err) {
          console.error(JSON.stringify({ msg: "turn-sync-failed", err: String(err) }));
        }
      })(),
    );
  } catch {
    // Sync must never break the turn's closing sentence.
  }
}
