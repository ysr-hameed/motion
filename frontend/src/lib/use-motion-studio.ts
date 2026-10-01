import { useEffect, useRef, useState } from "react"
import {
  DEFAULT_DURATION,
  parseSpec,
  specSuffix,
  type ChatMsg,
  type ClipSpec,
} from "@/lib/motion"
import { filesToAttachments, type Attachment } from "@/lib/attachments"
import {
  api,
  apiCreateProject,
  apiRecordVersion,
  apiRepair,
} from "@/lib/api"
import { reportRenderError } from "@/lib/agent"
import { asArtifact, type Artifact } from "@/lib/artifact"

export type Phase = "idle" | "thinking" | "generating" | "ready"

export interface ExportSettings {
  quality: "720p" | "1080p" | "4K"
  fps: 24 | 30 | 60
  container: "MP4" | "WebM"
}

export interface RunProgress {
  stage: string
  /** Model output so far. The honest progress signal while it writes. */
  chars: number
}

export interface ProjectState {
  id: number
  name: string
  thread: ChatMsg[]
  versions: number
  activeVersion: number
  phase: Phase
  vibe: string | null
  spec: ClipSpec | null
  exportSettings: ExportSettings
  attachments: Attachment[]
  /** The composition behind each version number. */
  artifacts: Record<number, Artifact>
  /** Server id once mirrored to the backend (null = local only). */
  serverId: string | null
  /** Model that composed the latest version (null = local). */
  designedBy: string | null
  /** Last AI failure on a versionless project. Drives the honest empty card. */
  lastError: string | null
  updatedAt: number
}

const PENDING_KEY = "motion:pending-prompt"

/**
 * Agent handoff: dashboard prompts consumed for agent-driven creation.
 * Keyed by local project id, taken once by the playground.
 */
const agentHandoffs = new Map<number, string>()

export function takeAgentHandoff(id: number): string | null {
  const v = agentHandoffs.get(id) ?? null
  agentHandoffs.delete(id)
  return v
}

interface StashedPrompt {
  prompt: string
  format: string
  attachments: Attachment[]
  instantReply?: string
  secs?: number
}

export function stashPendingPrompt(
  prompt: string,
  format: string,
  attachments: Attachment[] = [],
  instantReply?: string,
  secs?: number
) {
  try {
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ prompt, format, attachments, instantReply, secs })
    )
  } catch {
    /* storage unavailable */
  }
}

function takePendingPrompt(): StashedPrompt | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    sessionStorage.removeItem(PENDING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StashedPrompt>
    if (typeof parsed?.prompt !== "string") return null
    return {
      prompt: parsed.prompt,
      format: parsed.format ?? "16:9",
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
      instantReply:
        typeof parsed.instantReply === "string" ? parsed.instantReply : undefined,
      secs: typeof parsed.secs === "number" ? parsed.secs : DEFAULT_DURATION,
    }
  } catch {
    return null
  }
}

const DEFAULT_EXPORT: ExportSettings = {
  quality: "1080p",
  fps: 30,
  container: "MP4",
}

/** Bounded render-repair rounds. Two is enough for a real fix; more is
 *  the model circling, and each round is a full-file call. */
const MAX_REPAIR_ROUNDS = 3

export function useMotionStudio() {
  const [seed] = useState(() => {
    const ps = api.listProjects()
    let p = 0
    let m = 0
    for (const pr of ps) {
      p = Math.max(p, typeof pr.id === "number" ? pr.id : 0)
      for (const msg of pr.thread ?? []) m = Math.max(m, msg.id)
      if (!pr.artifacts) {
        // Migrate the pre-artifact field name so saved projects survive.
        const legacy = (pr as unknown as { docs?: Record<number, unknown> }).docs
        pr.artifacts = {}
        for (const [v, raw] of Object.entries(legacy ?? {})) {
          const a = asArtifact(raw)
          if (a) pr.artifacts[Number(v)] = a
        }
      }
        if (!pr.attachments) pr.attachments = []
      if (!pr.exportSettings)
        pr.exportSettings = { ...DEFAULT_EXPORT }
      if (pr.designedBy === undefined) pr.designedBy = null
      if (pr.lastError === undefined) pr.lastError = null
    }
    return { projects: ps, nextProject: p + 1, nextMsg: m + 1 }
  })
  const [projects, setProjects] = useState<ProjectState[]>(seed.projects)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [staged, setStaged] = useState<Attachment[]>([])
  const [genProgress, setGenProgress] = useState<RunProgress | null>(null)

  // Three numbers, one line. No step list, no note feed — none of it
  // survived contact with a real run, where the only thing that mattered
  // was knowing the model was still writing.
  const pushStage = (id: number, tk: number, stage: string) => {
    if (!runAlive(id, tk)) return
    setGenProgress({ stage, chars: 0 })
  }

  const pushChars = (id: number, tk: number, chars: number) => {
    if (!runAlive(id, tk)) return
    setGenProgress((prev) => {
      if (!prev) return prev
      // Counters only ever go up, so a late stage event cannot rewind the
      // count to zero and make a working run look stalled.
      return { ...prev, chars: Math.max(prev.chars, chars) }
    })
  }

  /** Clear the live line once the run is over — nothing lingers. */
  const sealRun = (id: number, tk: number) => {
    if (!runAlive(id, tk)) return
    setGenProgress(null)
  }

  const projectId = useRef(seed.nextProject)
  const msgId = useRef(seed.nextMsg)
  const runToken = useRef(new Map<number, number>())
  /** Repair rounds already spent per project, so the loop is bounded. */
  const repairRounds = useRef(new Map<number, number>())

  const bumpRun = (id: number) => {
    const tk = (runToken.current.get(id) ?? 0) + 1
    runToken.current.set(id, tk)
    return tk
  }
  const runAlive = (id: number, tk: number) =>
    (runToken.current.get(id) ?? 0) === tk

  const projectsRef = useRef<ProjectState[]>(seed.projects)
  const commit = (fn: (ps: ProjectState[]) => ProjectState[]) => {
    projectsRef.current = fn(projectsRef.current)
    setProjects(projectsRef.current)
  }

  useEffect(() => {
    api.saveProjects(projects)
  }, [projects])

  const active = projects.find((p) => p.id === activeId) ?? null

  const patchProject = (id: number, patch: Partial<ProjectState>) =>
    commit((ps) =>
      ps.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p))
    )

  const aiSay = (pid: number, msg: Omit<ChatMsg, "id">) =>
    commit((ps) =>
      ps.map((p) =>
        p.id === pid
          ? {
              ...p,
              thread: [...p.thread, { ...msg, id: msgId.current++ }],
              updatedAt: Date.now(),
            }
          : p
      )
    )

  const projectRef = (id: number): ProjectState | undefined =>
    projectsRef.current.find((p) => p.id === id)

  /**
   * Best-effort server mirror. Local state is the source of truth, so a
   * failure here is silent — the cut still plays.
   */
  const mirrorVersion = (
    id: number,
    note: string | undefined,
    reply: string,
    artifact: Artifact
  ) => {
    void (async () => {
      try {
        let sid = projectRef(id)?.serverId ?? null
        if (!sid) {
          const p = projectRef(id)
          if (!p?.spec) return
          const created = await apiCreateProject({
            name: p.name,
            prompt: p.spec.prompt,
            format: p.spec.format,
            style: p.spec.style,
            durationSecs: parseSecs(p.spec.duration),
          })
          if (!created) return
          sid = created.id
          patchProject(id, { serverId: sid })
        }
        await apiRecordVersion(sid, { note, reply, artifact })
      } catch {
        /* offline or unauthorized — stays local */
      }
    })()
  }

  function parseSecs(duration: string): number {
    const m = duration.match(/(\d+):(\d+)/)
    if (!m) return 5
    return Math.min(30, Math.max(3, Number(m[1]) * 60 + Number(m[2])))
  }

  /**
   * Ensure the active project exists on the server (agent tools operate on
   * it). Pushes the current local cut first so the agent seeds from what
   * the user actually sees. Returns the server id, or null when offline.
   */
  const ensureServerProject = async (): Promise<string | null> => {
    const a = projectRef(activeId ?? -1) ?? projectsRef.current[0]
    if (!a) return null
    const existing = projectRef(a.id)?.serverId ?? null
    if (existing) return existing
    const created = await apiCreateProject({
      name: a.name,
      prompt: a.spec?.prompt ?? a.name,
      format: a.spec?.format ?? "16:9",
      style: a.spec?.style,
      durationSecs: a.spec ? parseSecs(a.spec.duration) : 5,
    })
    if (!created) return null
    patchProject(a.id, { serverId: created.id })
    const current = projectRef(a.id)?.artifacts[projectRef(a.id)?.activeVersion ?? 0]
    if (current) {
      await apiRecordVersion(created.id, { reply: "Initial cut", artifact: current })
    }
    return created.id
  }

  /**
   * Commit an agent-published preview into the local version rail + chat.
   * The server already snapshotted the version; this mirrors it locally so
   * the player, version rail and thread stay in sync.
   *
   * Dedupe guard: the agent previews repeatedly within one run (validate →
   * preview → fix → preview), and every one of those used to mint a new
   * local version — three edits read as ten versions. Identical code
   * refreshes the stage in place; only changed code opens a new version.
   */
  const clipReply = (raw: string, fallback: string, max = 280) => {
    const t = raw.trim()
    if (!t) return fallback
    return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t
  }

  function sameCut(a: Artifact, b: Artifact): boolean {
    if (a.kind !== b.kind) return false
    if (a.kind === "code" && b.kind === "code") return a.code === b.code
    try {
      return JSON.stringify(a) === JSON.stringify(b)
    } catch {
      return false
    }
  }

  const commitAgentResult = (id: number, artifact: Artifact, reply: string) => {
    const p = projectRef(id)
    if (!p) return
    const newest = p.artifacts[p.versions]
    if (newest && sameCut(newest, artifact)) {
      // Re-preview of unchanged code — show the newest cut, mint nothing.
      patchProject(id, { phase: "ready", activeVersion: p.versions })
      return
    }
    commitVersion(id, artifact, "agent")
    const text = clipReply(reply, "Done — saved as a new version.")
    aiSay(id, { role: "ai", text, kind: "reply" })
    if (!p.spec && artifact.kind === "code") {
      const secs = Math.min(30, Math.max(3, Math.round(artifact.durationInFrames / (artifact.fps || 30))))
      const ratio = artifact.width / artifact.height
      const format = ratio > 1.2 ? "16:9" : ratio < 0.85 ? "9:16" : "1:1"
      patchProject(id, {
        spec: {
          prompt: p.name,
          format,
          style: "Auto",
          duration: `00:${String(secs).padStart(2, "0")}`,
        },
        phase: "ready",
      })
    } else {
      patchProject(id, { phase: "ready" })
    }
  }

  /**
   * Commits a version. No fake output: without an artifact there is
   * nothing to show, and the chat says so instead of inventing a cut.
   */
  const commitVersion = (
    id: number,
    artifact: Artifact,
    model: string | null
  ) => {
    const current = projectRef(id)
    const v = (current?.versions ?? 0) + 1
    repairRounds.current.set(id, 0)
    patchProject(id, {
      versions: v,
      activeVersion: v,
      lastError: null,
      ...(model ? { designedBy: model } : {}),
      artifacts: { ...(current?.artifacts ?? {}), [v]: artifact },
    })
    return v
  }

  /**
   * Render-error repair. The player mounts the composition, so it is the
   * only place that can prove the file runs. When it throws we post the
   * real error and swap in a corrected version — bounded, and only ever
   * rewriting the version that is currently on screen.
   */
  const repairVersion = (id: number, versionNo: number, errors: string[]) => {
    const p = projectRef(id)
    const artifact = p?.artifacts[versionNo]
    if (!p || p.phase !== "ready" || !artifact || artifact.kind !== "code") return
    // Feed the real player error to the agent recovery loop (advisory).
    if (p.serverId) void reportRenderError(p.serverId, errors, versionNo)
    const rounds = repairRounds.current.get(id) ?? 0
    if (rounds >= MAX_REPAIR_ROUNDS) {
      patchProject(id, {
        lastError: "This version still won't render. Try describing the change again.",
      })
      return
    }
    repairRounds.current.set(id, rounds + 1)
    const tk = runToken.current.get(id) ?? 0
    setGenProgress({ stage: "Fixing the render", chars: 0 })
    void (async () => {
      let fixed: string | null = null
      try {
        const res = await apiRepair(
          {
            code: artifact.code,
            errors: errors.slice(0, 6),
            width: artifact.width,
            height: artifact.height,
            fps: artifact.fps,
            durationInFrames: artifact.durationInFrames,
            prompt: p.spec?.prompt,
            projectId: p.serverId ?? null,
          },
          (e) => {
            if (!runAlive(id, tk)) return
            if (e.type === "stage" && e.stage) pushStage(id, tk, e.stage)
            else if (e.type === "output" && typeof e.chars === "number")
              pushChars(id, tk, e.chars)
          }
        )
        fixed = res && res.fixed ? res.code : null
      } catch {
        fixed = null
      } finally {
        sealRun(id, tk)
      }
      if (!runAlive(id, tk) || !fixed) return
      const cur = projectRef(id)
      if (!cur) return
      const next: Artifact = { ...artifact, code: fixed }
      patchProject(id, {
        artifacts: { ...cur.artifacts, [versionNo]: next },
        lastError: null,
      })
      mirrorVersion(id, undefined, "Fixed the render.", next)
    })()
  }

  /**
   * Restore any version as a new cut: the old artifact is committed on top
   * so the rail keeps full history (nothing is ever overwritten) and the
   * restored cut plays immediately.
   */
  const restoreVersion = (id: number, versionNo: number) => {
    const p = projectRef(id)
    const art = p?.artifacts[versionNo]
    if (!p || !art) return
    commitVersion(id, { ...art }, null)
  }

  const stopGeneration = () => {
    if (!active) return
    // Invalidates any in-flight repair loop (runAlive token) and clears
    // the progress line. Nothing from an interrupted run is saved.
    bumpRun(active.id)
    setGenProgress(null)
  }

  const stageFiles = async (files: FileList | File[]) => {
    const next = await filesToAttachments(files, staged.length)
    if (next.length > 0) setStaged((s) => [...s, ...next].slice(0, 4))
  }

  const removeStaged = (id: string) =>
    setStaged((s) => s.filter((a) => a.id !== id))

  const attachToActive = async (files: FileList | File[]) => {
    if (!active) {
      await stageFiles(files)
      return
    }
    const next = await filesToAttachments(files, active.attachments.length)
    if (next.length > 0)
      patchProject(active.id, {
        attachments: [...active.attachments, ...next].slice(0, 6),
      })
  }

  const removeActiveAttachment = (id: string) => {
    if (!active) return
    patchProject(active.id, {
      attachments: active.attachments.filter((a) => a.id !== id),
    })
  }

  const updateExportSettings = (patch: Partial<ExportSettings>) => {
    if (!active) return
    patchProject(active.id, { exportSettings: { ...active.exportSettings, ...patch } })
  }

  const selectProject = (id: number) => setActiveId(id)

  const deleteProject = (id: number) => {
    commit((ps) => ps.filter((p) => p.id !== id))
    setActiveId((cur) => (cur === id ? null : cur))
  }

  const consumePending = (): number | null => {
    const pendingPrompt = takePendingPrompt()
    if (!pendingPrompt) return null
    if (pendingPrompt.instantReply) {
      const id = projectId.current++
      commit((ps) => [
        {
          id,
          name: pendingPrompt.prompt.slice(0, 42),
          thread: [
            { id: msgId.current++, role: "user", text: pendingPrompt.prompt },
            { id: msgId.current++, role: "ai", text: pendingPrompt.instantReply! },
          ],
          versions: 0,
          activeVersion: 0,
          phase: "idle",
          vibe: null,
          spec: null,
          exportSettings: { ...DEFAULT_EXPORT },
          attachments: pendingPrompt.attachments,
          artifacts: {},
          serverId: null,
          designedBy: null,
          lastError: null,
          warnings: [],
          updatedAt: Date.now(),
        },
        ...ps,
      ])
      setActiveId(id)
      return id
    }
    // Agent-driven creation: shell project now, the agent composes via
    // tools once the playground mounts (prompt handed off, not generated here).
    const s = parseSpec(pendingPrompt.prompt, pendingPrompt.format)
    const id = projectId.current++
    commit((ps) => [
      {
        id,
        name: pendingPrompt.prompt.length > 42 ? `${pendingPrompt.prompt.slice(0, 42)}…` : pendingPrompt.prompt,
        thread: [{ id: msgId.current++, role: "user", text: pendingPrompt.prompt }],
        versions: 0,
        activeVersion: 0,
        phase: "idle",
        vibe: null,
        spec: s,
        exportSettings: { ...DEFAULT_EXPORT },
        attachments: pendingPrompt.attachments,
        artifacts: {},
        serverId: null,
        designedBy: "agent",
        lastError: null,
        updatedAt: Date.now(),
      },
      ...ps,
    ])
    // The agent receives duration + format explicitly, so it builds
    // directly instead of asking. The thread keeps the clean prompt.
    agentHandoffs.set(
      id,
      `${pendingPrompt.prompt} ${specSuffix(pendingPrompt.secs ?? DEFAULT_DURATION, pendingPrompt.format)}`
    )
    setActiveId(id)
    return id
  }

  return {
    projects,
    active,
    activeId,
    staged,
    genProgress,
    stopGeneration,
    repairVersion,
    ensureServerProject,
    commitAgentResult,
    restoreVersion,
    selectProject,
    deleteProject,
    setActiveVersion: (v: number) => {
      if (active) patchProject(active.id, { activeVersion: v })
    },
    consumePending,
    stageFiles,
    removeStaged,
    attachToActive,
    removeActiveAttachment,
    updateExportSettings,
  }
}

export type MotionStudio = ReturnType<typeof useMotionStudio>
