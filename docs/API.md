# SlyxUp Motion — API Reference

Worker: `slyxup-motion-api` (Durable Object `Chat`, one instance per session).
Frontend: Cloudflare Pages, `motion.slyxup.com`. Chat transport: the Agents SDK
(`routeAgentRequest`, `/agents/*`) — responses pass through untouched so the
WebSocket upgrade survives.

## HTTP endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | `{ ok, model, provider, corsOrigin }`. Edge-cached 60s. |
| GET | `/agents/chat/:session/composition` | `{ code, plan, version }` — the Player's source of truth, off-transcript. |
| GET | `/agents/chat/:session/versions` | `{ current, versions[] }` — version list for rollback UI. |
| POST | `/agents/chat/:session/audit` | `{ frame, findings[] }` — browser layout measurements, kept off-transcript. |
| POST | `/agents/chat/:session/rating` | `{ version, stars }` — ★ satisfaction, always 204. |
| POST | `/agents/chat/:session/event` | `{ name, detail }` — advisory client events (compile ms, preset picks), always 204. |

Dynamic DO routes are `no-store` by nature (per-conversation SQLite reads);
client code polls `/composition` every 3s only while a turn streams.

## Tool catalogue (60, single-composition scoped — no project/file ids)

**Core (11):** `get_canvas`, `load_skill` (31 Remotion docs), `plan_motion`,
`read_file`, `write_composition` (refuses invalid source), `edit_file`
(exact-string ops), `validate_composition`, `preview_composition` (once, last),
`review_motion`, `list_versions`, `restore_version`.

**Phase 1 — reliability (7):** `pre_validate_plan`, `constraint_solve`,
`dependency_resolve`, `auto_fix_code`, `asset_search`, `asset_optimize`,
`font_suggest`.

**Phase 2 — intelligence (10):** `intent_deep_analyze`,
`intent_questionnaire`, `decision_make`, `preference_apply`, `brand_learn`,
`design_analyze`, `performance_profile`, `accessibility_audit`,
`template_apply_intelligent`, `template_list`.

**Phase 3 — orchestration (5):** `prefetch_tools` (turn-start: predict + warm
cache + clear blackboard), `execute_batch` (≤10 independent reads per model
request; writes refused), `blackboard_write/read/list`.

**Phase 4 — content (7):** `copy_generate`, `voiceover_generate`,
`music_search`, `sound_effects_library`, `subtitle_generate`, `icon_generate`,
`background_generate`.

**Phase 4 — export/delivery (9):** `export_preset` (9 platforms),
`export_bundle`, `cdn_publish` (R2-pending spec), `thumbnail_generate`,
`watermark_apply`, `analytics_track`, `version_tag`, `template_save`.

**Phase 4 — collab (5):** `share_create`, `comment_add` (frame-anchored, stored),
`feedback_request`, `team_invite`, `activity_log` (versions + tags + comments).

**Phase 4 — 3D (3):** `three_scene_create`, `three_camera_path`,
`three_model_animate` (scaffolds; packages not installed).

**Agent upgrade — motion system (4):** `load_motion_preset` (5 beat types +
paste-ready snippet, optional headline text animation: charByChar, wordByWord,
maskReveal), `layout_plan` (positioning + overflow/overlap/z-conflict
detection + code hints), `auto_enhance_motion` (linear→bezier upgrade +
stagger report, saves only when still valid), `verify_no_errors` (blocking
gate before preview — errors and layout warnings stop the turn).
`auto_fix_code` is confidence-scored: high-confidence fixes apply
automatically, medium/low return with a preview for approval.

Batchable in `execute_batch`: all pure reads/computes above. Never batched:
`plan_motion`, `write_composition`, `edit_file`, `preview_composition`,
`restore_version`, `auto_fix_code`, `auto_enhance_motion`, `version_tag`, `template_save`,
`comment_add`, `analytics_track`.

## Storage (DO SQLite)

`composition` (one row), `version` (last 20), `composition_analytics`
(turns + ratings + events), `blackboard` (per-turn workstream bus),
`comment` (review threads), `version_tag` (semver tags).

## Monitoring

- `turn-finished` JSON log per turn (`ms`, `toolCalls`, `version`) via
  `observability.enabled` in `wrangler.jsonc` — the dashboard feed until a
  vendor DSN (Sentry etc.) is configured.
- `gateway-rate-limited` JSON log on 429s with `retry-after` wait.
- `worker-unhandled` JSON log on 500s (CORS-safe JSON response).
- `ui-boundary` JSON log on panel crashes (client console).

## Rate limiting

`rate-limit.ts`: 12s pacing via `createPacedFetch` (5 req/min gateway key),
`retry-after`-honoring 429 recovery (2 retries), `maxRetries: 0` on the model.
Pacing is I/O wait — zero DO CPU.
