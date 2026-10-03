# SlyxUp Motion — User Guide

One composition per conversation. You describe the clip; the agent plans the
beats, writes real Remotion TSX, validates it, and previews it on the stage.

## The 60-second workflow

1. **Describe the clip** — e.g. "A 5s product reveal with the logo punching in
   on an overshoot". Or pick a template chip (Product Launch, Logo Reveal…).
2. **Answer at most 3 quick picks** — platform, style, brand assets. Everything
   else (colors, fonts, music, timing) the agent decides itself.
3. **Watch it build** — the progress panel shows real stages (prefetch →
   intent → plan → assets → code → validate → review → preview), not a spinner.
4. **Export** — the Export button opens 9 platform presets
   (IG Story/Feed/Reel, TikTok, YouTube, Twitter/X, LinkedIn, Website Hero,
   PNG sequence) or the full bundle.

## The panels

| Panel | What it does |
|---|---|
| Stage | The real render (Remotion Player). Scrub with the timeline; timecode is frame-accurate. |
| Timeline | One block per beat. Hover for props, click to inspect, nudge timing with −15f/+15f/faster/split. |
| Inspector | Beat actions, text-animation styles, or the idle quality summary with Auto-improve. |
| Progress | Live motion/performance/accessibility bars, agent checklist, pre-export check, ★ rating. |

Clicks never edit code directly — they draft a message for the agent, which
remains the only writer. The cut cannot be corrupted by exploring the UI.

## Natural-language edits

- "Make the logo entrance faster" (retimes, doesn't restyle)
- "Change background to deep blue" (keeps timing)
- "Add a spring landing to the headline"
- "Prepare the TikTok preset"

## Limits you should know

- **Model quota (5 req/min on the current key):** a full turn takes ~2 minutes
  of paced work. The UI shows the tool log so it reads as progress. This is an
  account limit, not a bug — it lifts with a gateway tier upgrade.
- **Canvas is fixed:** 1920×1080, 30fps, max 30s (900 frames). Vertical
  presets reframe the master — they never re-animate.
- **Placeholders:** stock images/music from the offline catalogue are marked
  as such — confirm licensing before publishing, and use `cdn_publish` output
  only after the R2 binding is wired (the tool tells you the exact config).
- **3D:** camera-rig scaffolds only; `three`/`@react-three/fiber` are not
  installed yet. The agent will say so instead of importing them.

## Troubleshooting

| Symptom | What to do |
|---|---|
| "The model stopped responding" | Send again to retry — versions are kept, nothing is lost. |
| "will not render" on stage | Read the message + line number; tell the agent, it auto-fixes. |
| Offline banner | Edits queue in the draft box; press retry in the top bar on reconnect. |
| A panel crashes | It shows a retry button; other panels keep working. |
| Wrong cut on stage | `list_versions` in chat, or restore from the version list. |
