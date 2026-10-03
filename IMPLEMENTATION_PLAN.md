# SlyxUp Motion — Implementation Plan
**Derived from `ADVANCEMENT_PLAN.md` (50x plan, 2026-10-02). Nothing omitted.**

> Current: single-agent DO chat, 11 tools, `alibaba/qwen3.7-flash`, 5 req/min, `MAX_STEPS=12`.
> Target: orchestrated multi-agent, 50+ tools, <8 calls/turn, <30s turn, 80% zero-edit export.
> Constraints (do not violate): Workers Free (no `limits` block), DO SQLite 30s CPU/invocation,
> outer Worker ~10ms (forward-only), CORS `motion.slyxup.com` ↔ Worker, one cut per conversation
> (no project/file ids in tools), browser compile is render authority, `validate.ts` is cheap pre-pass.

---

## 0. File map (where everything lands)

```
backend/src/
  chat.ts                    # SYSTEM prompt, MAX_STEPS, model routing, prepareStep
  rate-limit.ts              # pacing, 429 recovery, batch window
  server.ts                  # /api/health, /agents/*, CORS
  remotion/
    tools.ts                 # ALL tool definitions (grows 11 → 50+)
    validate.ts              # checkComposition() + pre-validate + a11y + perf checks
    store.ts                 # composition + version + analytics + prefs + templates tables
    skills.generated.ts      # rebuilt by scripts/build-skills.mjs
    intelligence.ts   (NEW)  # intent_deep_analyze, decision_make, ab_test, preference_apply
    assets.ts         (NEW)  # asset_search/optimize, font_suggest, color_extract, brand_validate
    content.ts        (NEW)  # copy/voiceover/music/sfx/subtitle/icon/background
    export.ts         (NEW)  # export presets, CDN publish, thumbnail, watermark, batch
    collab.ts         (NEW)  # share/comment/feedback/team/activity
    motion3d.ts       (NEW)  # three.js helpers, camera paths, style transfer stubs
  analytics/
    schema.ts         (NEW)  # composition_analytics DDL + event writers
    patterns.ts       (NEW)  # pattern_analyzer, template recommender
frontend/src/
  components/
    Conversation.tsx         # intent capture, questionnaire, tool log, stall watchdog
    Stage.tsx                # player, timeline, transport, quality panel
    Timeline.tsx      (NEW)  # interactive beats (hover/click/drag/split) — extracted from Stage
    Inspector.tsx     (NEW)  # context-aware side panel (logo/text/idle states)
    ExportDialog.tsx  (NEW)  # smart presets + bundle + CDN URLs + embed
    ProgressView.tsx  (NEW)  # multi-agent progress, live quality bars, pre-export check
  lib/
    composition.ts           # CANVAS, MotionPlan types
    templates.ts      (NEW)  # 10 intelligent templates + variants
    exportPresets.ts  (NEW)  # 9 platform presets (IG/TikTok/YT/etc.)
```

---

## 1. Agent architecture — multi-agent orchestration (§1)

### 1.1 Roles → implementation
| Advancement role | Implementation |
|---|---|
| Orchestrator (master) | `Chat.onChatMessage` becomes dispatcher: runs `intent_deep_analyze`, writes sub-task specs to blackboard, calls `execute_batch`, synthesizes. No new DO class — one DO per conversation, fibers = sequential `streamText` sub-calls with scoped tool subsets. |
| Design Planner | SYSTEM section + `intelligence.ts:designPlan()` + uses `motion_preset_apply`, `timing_optimize`, `color_extract`, `font_suggest`. |
| Technical Architect | `tools.ts` code-gen subset (`write_composition`, `edit_file`, `dependency_resolve`, `pre_validate_plan`) + `validate.ts` extensions. |
| Content Analyzer | `assets.ts` + `content.ts` tool subset. |
| Quality Assurance | `review_motion` upgrade + `design_analyze`, `accessibility_audit`, `performance_profile`, `brand_validate`. |
| Render Optimizer | `export.ts` + `validate.ts` perf budget + frontend compile cache. |
| Delivery Manager | `export.ts` + `collab.ts` + CDN/version endpoints. |

### 1.2 Communication protocol (fiber-based, DO-compatible)
- [ ] `store.ts`: add `blackboard` table `(key TEXT PK, value TEXT, updated_at)` — agents read/write via `blackboard_get/set` internal fns (NOT model tools).
- [ ] Event bus = existing tool-result stream + new `ProgressView` SSE poll on `/agents/.../progress` (DO `state.audit`-style, off-transcript).
- [ ] Checkpoints: `store.write()` already versions every write; add `checkpoint(tag)` writing to `version` with `tag` column; `version_tag` tool surfaces it.
- [ ] Recovery: reuse `runFiber`/`onChatRecovery` + `chatRecovery` budgets — sub-agent failure retries only its workstream, not whole turn.
- [ ] Workflow order (enforced in SYSTEM prompt + `prepareStep`): intent → parallel (design/content/tech-plan) → blackboard → QA gate → codegen → render-opt → synthesize → preview → close sentence.

**Acceptance:** 3 workstreams run without transcript bloat (prune rule extended: sub-agent tool output `before-last-2-messages`), eviction resumes from last checkpoint.

---

## 2. Tool expansion — 11 → 50+ (§2)

All tools stay single-composition scoped (no id args). Each gets: zod schema, deterministic `execute`, SYSTEM-prompt line, `TOOL_LABEL` entry in `Conversation.tsx`, validator coverage where applicable.

### 2.1 Asset management (10) → `assets.ts`
- [ ] `asset_search(query, type, style, license)` — Unsplash/Pexels/Pixabay fetch, commercial-safe filter, attribution string. Cache 5 min.
- [ ] `asset_upload(file, metadata)` — R2 PUT, thumbnail gen, returns `staticFile()` URL.
- [ ] `asset_optimize(url, format, quality)` — resize to canvas, WebP/AVIF, returns URL.
- [ ] `video_trim(url, start, end)` — Worker FFmpeg stub → R2 clip (Phase 4; Phase 1 = passthrough + duration check).
- [ ] `audio_analyze(url)` — BPM/key/energy stub → beat markers (Phase 1: duration + naive beat grid from fps).
- [ ] `font_suggest(text, mood, brand)` — maps mood→Google-Fonts pairs from `fonts.ts` + typography skill.
- [ ] `color_extract(imageUrl)` — dominant palette + hex + contrast scores (Phase 1: reuse canvas palette + contrast fn).
- [ ] `brand_validate(composition, guidelines)` — color/font checks, violation list.
- [ ] `asset_version_control(id, action)` — wraps `store.versions()/restore()` + link table.
- [ ] `asset_batch_process(urls[], operations[])` — parallel `Promise.allSettled` + progress events + per-item error recovery.

### 2.2 Advanced motion (12) → `tools.ts` + skills + `validate.ts`
- [ ] `motion_preset_apply(element, preset)` — 50+ presets table (bounce/elastic/magnetic/liquid…) as code snippets with param overrides + timing auto-adjust.
- [ ] `physics_simulate(object, forces)` — gravity/collision/friction → deterministic keyframe path (seeded `random()`).
- [ ] `path_morph(pathA, pathB, easing)` — SVG interp snippet via `@remotion/paths`.
- [ ] `particle_system(config)` — canvas-optimized emitter component snippet.
- [ ] `camera_motion(type, params)` — pan/zoom/dolly/orbit snippet, frame-synced.
- [ ] `text_animator(text, style)` — per-char wave/typewriter/glitch/split with stagger param.
- [ ] `mask_reveal(element, path)` — mask shape + animated reveal path.
- [ ] `displacement_map(element, texture)` — WebGL displacement snippet (perf-flagged).
- [ ] `motion_path_follow(element, path)` — SVG path follow + auto-rotate + speed.
- [ ] `gesture_simulate(type)` — swipe/tap/pinch mobile snippet.
- [ ] `timing_optimize(composition)` — beat-structure analysis → timing suggestions (extends `review_motion`).
- [ ] `motion_export_curve(animation)` — AE/Figma/Lottie-compatible JSON timeline export.

### 2.3 Intelligence & analysis (8) → `intelligence.ts` + `validate.ts`
- [ ] `design_analyze(composition)` — 0-100 motion score + weak spots + specific fixes (upgrade of `review_motion` internals).
- [ ] `trend_research(category, period)` — static trend table per category (Phase 1) → live source later.
- [ ] `competitor_analyze(url)` — pattern extraction stub (Phase 4; Phase 1 returns "upload reference frames" guidance).
- [ ] `performance_profile(composition)` — frame-time estimate, bottleneck list, optimization recs.
- [ ] `accessibility_audit(composition)` — flash check, contrast, pause support, WCAG report.
- [ ] `brand_learn(examples[])` — brand profile row in store.
- [ ] `user_preference_learn(history)` — per-session prefs row, auto-apply.
- [ ] `composition_compare(id1, id2)` — version-to-version diff via `store.versions()`.

### 2.4 Content generation (7) → `content.ts`
- [ ] `copy_generate(brief, tone, length)` — headlines/taglines, N variations, brand voice.
- [ ] `voiceover_generate(script, voice, language)` — ElevenLabs stub + auto-timing sync (Phase 4 live).
- [ ] `music_search(mood, duration, bpm)` — royalty-free stub library, BPM match, auto-trim math.
- [ ] `sound_effects_library(action)` — contextual SFX + timing + volume balance.
- [ ] `subtitle_generate(audio)` — transcription stub → timed captions via `@remotion/captions`.
- [ ] `icon_generate(concept, style)` — lucide-react picker + consistent-style SVG wrapper.
- [ ] `background_generate(style, colors)` — procedural gradient/noise snippet via `@remotion/noise`.

### 2.5 Export & distribution (8) → `export.ts`
- [ ] `export_preset(composition, preset)` — IG Story/Reel/TikTok/YT/MP4/WebM/GIF/ProRes/PNG-seq math (dims, fps, frames).
- [ ] `cdn_publish(composition, config)` — R2 upload + share URL + embed code.
- [ ] `thumbnail_generate(composition, frame)` — frame capture → variations.
- [ ] `watermark_apply(composition, logo, position)` — dynamic placement snippet.
- [ ] `batch_export(compositions[], settings)` — parallel render queue + progress + retry.
- [ ] `analytics_track(compositionId, event)` — writes `composition_analytics`.
- [ ] `version_tag(composition, tag)` — semver + release notes + changelog.
- [ ] `template_save(composition, metadata)` — parameterized template row + marketplace listing flag.

### 2.6 Collaboration (5) → `collab.ts`
- [ ] `share_create(compositionId, permissions)` — link + view/comment/edit + expiry.
- [ ] `comment_add(compositionId, frame, text)` — frame-anchored threads + @mentions.
- [ ] `feedback_request(compositionId, emails[])` — invites + synthesis.
- [ ] `team_invite(email, role)` — roles + quota.
- [ ] `activity_log(compositionId, range)` — audit trail from `version` + comments tables.

**Phase 1 ships:** `pre_validate_plan`, `constraint_solve`, `dependency_resolve`, `auto_fix_code`, `asset_search`, `asset_optimize`, `font_suggest` (see §10). Rest follow phase order.

---

## 3. Intelligence layer (§3)

### 3.1 Intent understanding → `intelligence.ts:intent_deep_analyze`
- [ ] 4-pass pipeline: goal (showcase/explainer/ad/tutorial) + tone + length → industry/audience/platform inference → proactive fill (logo→palette, no music→auto-select, no VO→text-anim) → reference-URL pattern extraction.
- [ ] Tool `intent_deep_analyze(request, context)` returns complete spec; SYSTEM: ask clarifying Q only when ambiguous.
- [ ] Frontend `Conversation.tsx`: `EmptyBrief` → quick-start chips (Product Launch / Social Ad / Logo Reveal / Tutorial / Event / Brand Story) + Upload Reference + Start from Template (State 1 UI).

### 3.2 Autonomous decisions → `intelligence.ts`
- [ ] `decision_make(context, options, criteria)` — weighted scoring (motion quality, hierarchy, timing, brand).
- [ ] `ab_test_internal(variations[], metrics)` — internal simulate + winner.
- [ ] `preference_apply(decision, userProfile)` — past-choice lookup.
- [ ] Rule: best-practices default → learned prefs → internal A/B → ask user ONLY for business-critical missing info / ties / explicit advanced mode.

### 3.3 Error prevention → `validate.ts` + `tools.ts`
- [ ] `pre_validate_plan(motionPlan)` — frame/duration/overlap feasibility BEFORE codegen.
- [ ] `auto_fix_code(code, errors)` — targeted repair + re-validate, no full retry.
- [ ] `constraint_solve(requirements)` — timing/duration/frame-budget solver or impossibility report.
- [ ] `dependency_resolve(imports)` — scope map, missing-package suggest, path auto-correct.
- [ ] Pipeline: plan-check → incremental validation during gen → constraint solve → import resolve → inline types → auto-fix.
- [ ] `validate.ts` additions: `springTimingConfig` presence, `interpolate` frame range ≤900, `useCurrentFrame` pairing, font-scale floors/ceilings (already), a11y flash-rate, perf effect-count estimator.

---

## 4. UI/UX (§4) — frontend

### 4.1 Progressive disclosure (5 states)
- [ ] State 1 Intent Capture: centered input + 6 quick-starts + upload/template (`Conversation.tsx` EmptyBrief upgrade).
- [ ] State 2 Thinking: 3 cards (Analyzing/Planning/Sourcing with ✓/⏳) + motion-strategy summary (`ProgressView.tsx`).
- [ ] State 3 Building: timeline preview blocks + per-scene checklist (`Timeline.tsx` + progress feed).
- [ ] State 4 Preview: Player + transport + quality score 0-100 with ✓/⚠️ lines + [Refine][Export Now][Save as Template] (`Stage.tsx` + `ExportDialog.tsx`).
- [ ] State 5 Refinement: side-by-side preview + Inspector + NL edit box (`Inspector.tsx`).

### 4.2 Timeline (`Timeline.tsx` extracted from `Stage.tsx`)
- [ ] Blocks per beat with props (opacity/scale/easing), per-scene [Edit][Duplicate][Delete]/[Split], audio waveform row, [+ Add Scene][+ Add Audio][+ Add Effect].
- [ ] Interactions: hover→props tooltip, click→inspector, drag edges→retime (emits `edit_file` ops), drag→reorder, right-click menu, frame-accurate scrub, keyframe dots.

### 4.3 Inspector (`Inspector.tsx`)
- [ ] Logo-hover: duration/easing/damping + [Faster][Slower][Change Easing][Replace Asset] + suggestions.
- [ ] Text-select: style radio (Fade/Slide/Typewriter/Glitch), stagger, direction, font/size/color + [Change Font][Add Effect].
- [ ] Idle: quality score, ✓/⚠️ list, suggestions, [Auto-improve][Export][Duplicate].

### 4.4 Real-time feedback (`ProgressView.tsx`)
- [ ] Live quality bars (Motion/Performance/Accessibility %) with ✓/⚠️ lines.
- [ ] Multi-agent progress list (Design/Content/Tech with sub-checklist + ETA).
- [ ] Pre-export check modal: audio-overrun, low-res logo, missing fade-out → [Auto-trim]/[Use vector]/[Add fade], [Fix All][Export Anyway].

### 4.5 Export (`ExportDialog.tsx` + `exportPresets.ts`)
- [ ] Smart preset picker (IG Story/Feed, YouTube, TikTok, Twitter, LinkedIn, Website Hero, Presentation, Custom) + [Export Bundle].
- [ ] Post-export: file list [Download][Copy CDN URL][Share], permanent R2 URLs, embed `<video>`, share link + QR, [Create Variations][Edit][New Project].

---

## 5. Performance — breaking 5 req/min (§5)

- [ ] `execute_batch(operations[])` system tool — groups compatible ops, parallel where safe, one structured result (saves n-1 requests).
- [ ] `prediction_engine(intent)` — prefetch asset/music/font results on brief receipt; 60s TTL. Cache policy: skills 1h shared, asset search 5m query-keyed, decisions per-session, validation never.
- [ ] Local-first: asset fetch, validation, file CRUD, export render, analytics, CDN, version ops run in Worker/orchestrator WITHOUT model round-trip; only errors return to model.
- [ ] Multi-model routing (when keys allow): Orchestrator GPT-4o / Design Claude 3.5 / Codegen Qwen 3.7 Flash / Copy GPT-4o-mini / Reviewer Claude 3.5. Today: single `MODEL` const stays; routing is a `MODEL_FOR_TASK` map + fallback chain, defaulting to Qwen until quota upgraded.
- [ ] Streaming execution: `yield {scene, code, status:partial}` per scene → frontend compiles incrementally (Stage `reloadKey` per scene); full timeline 0s→2s intent→5s scene1→…→18s done.
- [ ] `MAX_STEPS` 12 → budget 8/turn via batching; `TOOL_LABEL` + prune rules updated for new tools.

---

## 6. Zero-iteration workflow (§6)

- [ ] `intent_questionnaire(brief)` — known/inferred/gap analysis → quickpick chips (platform, 3 style refs, logo upload/skip). 10s interaction, not free-text interrogation.
- [ ] `template_apply_intelligent(template, userContext)` — structure + asset swap + brand recolor + retime + copy personalize.
- [ ] 10 templates with S/M/L variants, smart placeholders, responsive timing, pre-optimized exports: Product Reveal, Social Ad, Logo Animation (10 styles), Explainer Intro, Event Promo, Tutorial Intro, App Demo, Brand Story, Quote Card, Podcast Intro/Outro (`lib/templates.ts`).
- [ ] Target: 60s brief→export, ~8 calls, "Perfect, export it" as modal response.

---

## 7. Advanced capabilities (§7)

- [ ] 3D (`motion3d.ts`): `three_scene_create`, `three_model_animate` (.glb/.gltf), `three_camera_path` (dolly/pan/orbit/fly, bezier+ease). Phase 4 = basic camera anims; full R3F later.
- [ ] AI animation: `style_transfer`, `animation_from_video`, `pose_to_animation` — Phase 4 stubs returning editable compositions; training-backed later.
- [ ] Interactive: `interactive_export` (React + hover/click/scroll/form), `scroll_animation_create` (parallax/fade/progress), `configurator_build` (param UI + live preview).
- [ ] i18n: `translate_composition` (translate + retype + retime + per-lang VO), `localize_design` (color/pacing/imagery per region).
- [ ] Realtime collab: `collab_session_create` (multi-cursor/live), `collab_comment_add` (frame-accurate), `collab_version_branch` (A/B variants).

---

## 8. Data layer (§8) — `analytics/schema.ts`, `patterns.ts`

- [ ] `composition_analytics` table EXACTLY as spec'd (id, user/session, brief, intent_category, created_at, total_time_ms, model_calls, tool_calls, errors_count, retries_count, motion/perf/a11y scores, user_rating, user_edited, exported, export_format, template_id, customization_level).
- [ ] `pattern_analyzer(history)` — cluster requests, surface defaults (e.g. "70% use these 3 transitions" → defaults; "logo always resized" → upfront prominence Q; "fitness→energetic" → auto-select).
- [ ] Feedback loop: ★≥4 → positive example + pattern extract; ★≤2 → failure log + reason → dataset; curate 1000+ annotated (scores, timing, patterns, pitfalls) for future fine-tune.

---

## 9. Pricing & rate limits (§9)

- [ ] Code assumes quota stays 5/min until key upgraded — pacing + batching + local-first are the implementation regardless.
- [ ] Option A (recommended): Business tier 100 rpm — 8-10 concurrent users, remove pacing, same model. ROI note: 4-10 paid users cover it.
- [ ] Option B: multi-provider fallback (Gateway → OpenRouter → direct → GPT-4o-mini) with priority router. Deferred: current single-key setup spends quota faster with fallbacks; revisit post-upgrade.
- [ ] Option C (implement now): hybrid local+cloud — validation/assets/export/CDN/version/analytics never cost model calls (60% reduction path).
- [ ] Tiers in plan only (no billing code yet): Free 5/mo 720p watermarked; Pro $29 unlimited 4K priority 3D/collab 3 seats; Business $99 10 seats branding API white-label support.

---

## 10. Roadmap — phased delivery

### Phase 1: Foundation (Week 1-2) — reliability 90%+ first-try [DONE]
- [x] Plan docs (this file) mapping every §1-14 item to files.
- [x] Backend: `pre_validate_plan`, `constraint_solve`, `dependency_resolve`, `auto_fix_code` in `tools.ts` + `validate.ts` helpers.
- [x] Backend: `asset_search` (offline catalogue), `asset_optimize`, `font_suggest` in `assets.ts`.
- [x] Frontend: `Timeline.tsx` (hover props, click→inspector, retime suggests), `Inspector.tsx` (beat/text/idle), `ProgressView.tsx` (quality bars + tool-activity checklist + pre-export check modal).
- [x] Instrument: `composition_analytics` writes per turn + `/rating` endpoint + ★ capture.
- [x] Deliverable: 90%+ first-try success path (pre-validate → plan → write → validate → review → preview, all typechecked).

### Phase 2: Intelligence (Week 3-4) — 80% export-without-edits [DONE]
- [x] `intelligence.ts`: `intent_deep_analyze`, `intent_questionnaire`, `decision_make`, `preference_apply`, `brand_learn`, `design_analyze`, `performance_profile`, `accessibility_audit` + 10 registered tools.
- [x] Smart questionnaire (gaps-only quick picks) via `intent_questionnaire`.
- [x] `remotion/templates.ts` (backend, 10 templates + `template_apply_intelligent` spec tool + `template_list`) + `lib/templates.ts` (frontend chips) + template picker in EmptyBrief.
- [x] Analytics: per-turn rows + ★ satisfaction capture (`/rating`).
- [x] Go/No-Go input: smart defaults (intent inference + autofill + decision engine) in place; user validation pending.

### Phase 3: Multi-agent (Week 5-6) — <30s turns [DONE]
- [x] Orchestrator dispatch: `prefetch_tools` turn-start (predict + warm + clear blackboard), `execute_batch` for all independent reads (max 10 ops, one request), batch-first workflow in SYSTEM prompt.
- [x] Blackboard: `blackboard` table in `store.ts` + `blackboard_write/read/list` tools; namespaced keys (`design:*`, `content:*`, `tech:*`).
- [x] Specialized workstreams via namespaced blackboard notes + read-before-synthesize ordering (single DO, sequential tool subsets — no new DO class needed).
- [x] Batching & caching: `batchExecute` single-implementation dispatcher (writes refused), `cache.ts` TTL policy (skills 1h, assets 5m, intent 60s, validation never), `predictTools` engine.
- [x] Request path: batched turns trend toward ~8 calls; `ProgressView` stages track prefetch/batch; `TOOL_LABEL` entries added.
- [x] Go/No-Go input: orchestration in place; wall-clock validation pending (quota-bound).

### Phase 4: Advanced (Week 7-8) — feature-complete MVP [DONE]
- [x] `content.ts` (7 tools): `copy_generate`, `voiceover_generate` (timing cues), `music_search` (BPM match + trim math), `sound_effects_library`, `subtitle_generate` (caption windows), `icon_generate` (lucide picker), `background_generate` (procedural snippets). All key-free specs; stubs name their boundaries.
- [x] Export ecosystem: `export.ts` (9 presets with cap/reframe math, bundle plan, honest R2-pending `cdn_publish`, thumbnail, watermark) + `ExportDialog.tsx` + `lib/exportPresets.ts` wired to Inspector/ProgressView via `motion:export` event.
- [x] Delivery: `analytics_track` (event rows), `version_tag` (semver table), `template_save` (blackboard).
- [x] Collaboration: `collab.ts` (`share_create`, `feedback_request`, `team_invite` specs) + real `comment_add`/`activity_log` on new `comment` table; `version_tag` table in store.
- [x] 3D foundation (`motion3d.ts`): `three_scene_create`, `three_camera_path`, `three_model_animate` — R3F scaffolds with install/hosting prerequisites stated, never silent.
- [x] Pure Phase 4 computes added to `execute_batch`; writes (`version_tag`, `template_save`, `comment_add`, `analytics_track`) stay sequential.
- [x] Go/No-Go input: WOW-capable surface in place; provider integrations (ElevenLabs, stock, R2, email) are the remaining live wiring.
- [ ] Go/No-Go: WOW moments?

### Phase 5: Polish & scale (Week 9-10) — public beta [DONE]
- [x] Performance: lazy `ExportDialog` (dialog code ships on open), Player +
  compile already lazy (~800kB off first paint); `vite build` green with
  content-hashed assets (edge-cache friendly). Remaining chunk warning is the
  pre-existing lottie-web eval + scope chunks, not new code.
- [x] Edge caching: `/api/health` 60s `s-maxage`; dynamic DO routes stay
  uncached (per-conversation reads); static dist is hash-named.
- [x] Error handling: `server.ts` try/catch → CORS-safe JSON 500s;
  `ErrorBoundary` per region (stage/inspector/progress/conversation) with
  retry; offline indicator + retry in TopBar; `/event` + `/rating` never 4xx.
- [x] Documentation: `docs/USER_GUIDE.md` (workflow, panels, NL edits, limits,
  troubleshooting) + `docs/API.md` (endpoints, 56-tool catalogue, storage,
  monitoring, rate limits).
- [x] Monitoring: `turn-finished` JSON per turn + `gateway-rate-limited` +
  `worker-unhandled` + `ui-boundary` via Workers observability; product
  signals via `composition_analytics` (turns, ★ ratings, `compile` ms,
  `export-pick`, shares). Vendor APM (Sentry) needs a DSN — deliberately not
  faked; the JSON-log feed is the dashboard until then.
- [x] Go/No-Go: public-beta surface complete. Remaining: gateway tier upgrade
  (quota), provider wiring (ElevenLabs/stock/R2/email), three/fiber install.

---

## 11. Success metrics (§11) — tracked in `composition_analytics`

| Metric | Current | Target |
|---|---|---|
| Time to first preview | ~30s | <10s |
| Success, no edits | ~40% | 80% |
| Iterations/composition | 3-4 | 1.2 |
| Time to export | 2-3 min | <45s |
| Satisfaction | — | 4.5+ |
| Model calls/turn | 10-12 | <8 |
| Success, no errors | ~70% | 95% |
| P95 latency | 120s | 40s |
| Concurrent users | 1 | 10+ |
| Free→Pro | — | 15% |
| Churn | — | <5%/mo |
| Comps/user | — | 20+/mo |
| DAU launch/M1/M3 | — | 100/500/2000 |

---

## 12. Risks (§12)

- Model limits persist → upgrade tier + fallback router + fewer calls + free-user queue.
- Browser compile edge cases → test suite + server-compile fallback + clear errors + auto-fix.
- DO eviction → `chatRecovery` + <30s ops + checkpoints + resume.
- Users want more control → advanced mode + timeline editor + save/resume + code export.
- Inconsistent quality → start narrow (SaaS/tech) + per-category templates + feedback learning + gradual expansion.
- AE competition → 10x speed, zero learning curve, AI design, $29 vs $240/yr.
- Cost/generation → $0.05 target via fewer calls + cache + cheap models for simple tasks + $1-2/export pricing.
- Free-tier abuse → 5/mo cap + watermark + email verify + upgrade prompts.

---

## 13. Competitive advantages (§13) — build messaging into Export/Share UI

Speed (60s vs hours), Expertise (describe-don't-design), Iteration (realtime preview), Cost ($0.50-2 vs $20-60/hr), Scale (100 variations in minutes). USPs: "Describe, Don't Design" / "60-Second Motion Graphics" / "Production-Ready, Every Time" / "Your Style, Automated".

---

## 14. Future vision (§14) — out of MVP scope, tracked as issues

6mo: voice/sketch/video-ref input, realtime collab cursors+threads, template marketplace (rev-share, ratings), full Three.js + Spline + shaders. 12mo: white-label + API + embed, enterprise (workspaces, asset libs, brand enforcement, SSO), mobile (preview + cloud render), ecosystem (Figma/Canva/Adobe/Webflow).

---

## Build order (next actions)

1. Phase 1 backend tools + validate helpers (this turn).
2. `pnpm -C backend check` + `pnpm -C frontend check` green.
3. Phase 1 frontend (Timeline/ProgressView/pre-export) next turn.
4. Phase 2 intelligence + templates.
