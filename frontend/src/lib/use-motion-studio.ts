import { useEffect, useRef, useState } from "react"
import {
  DEFAULT_DURATION,
  parseSpec,
  smalltalkReply,
  specSuffix,
  type ChatMsg,
  type ClipSpec,
} from "@/lib/motion"
import { filesToAttachments, preparedImages, type Attachment } from "@/lib/attachments"
import { planMessage } from "@/lib/cut-voice"
import {
  api,
  apiCreateProject,
  apiDirect,
  apiHealth,
  apiRecordVersion,
  apiRefine,
  apiRepair,
  type RemoteDirectResult,
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
  const [refineValue, setRefineValue] = useState("")
  const [copied, setCopied] = useState(false)
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
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const runToken = useRef(new Map<number, number>())
  const runTimers = useRef(new Map<number, ReturnType<typeof setTimeout>[]>())
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
  const pending = active?.phase === "thinking" || active?.phase === "generating"

  const patchProject = (id: number, patch: Partial<ProjectState>) =>
    commit((ps) =>
      ps.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p))
    )

  const later = (id: number, fn: () => void, delay: number) => {
    const tk = runToken.current.get(id) ?? 0
    const tmr = setTimeout(() => {
      if ((runToken.current.get(id) ?? 0) === tk) fn()
    }, delay)
    timers.current.push(tmr)
    const list = runTimers.current.get(id) ?? []
    list.push(tmr)
    runTimers.current.set(id, list)
  }

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
   */
  const clipReply = (raw: string, fallback: string, max = 280) => {
    const t = raw.trim()
    if (!t) return fallback
    return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t
  }

  const commitAgentResult = (id: number, artifact: Artifact, reply: string) => {
    const p = projectRef(id)
    if (!p) return
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

  const failRun = (id: number, tk: number, message: string | null) => {
    patchProject(id, { phase: "ready" })
    void (async () => {
      const backendUp = await apiHealth()
      if (!runAlive(id, tk)) return
      const text = backendUp
        ? (message ?? "That one didn't render — hit Retry and I'll cut it again.")
        : "You're offline — start the backend (pnpm dev) to compose with AI."
      patchProject(id, { lastError: text })
      aiSay(id, { role: "ai", text, kind: "reply", tone: "error" })
    })()
  }

  const resolveDirect = async (id: number, prompt: string, format: string) => {
    const p = projectRef(id)
    if (!p || p.phase !== "thinking") return
    const tk = runToken.current.get(id) ?? 0
    setGenProgress({ stage: "Reading the brief", chars: 0 })

    let remote: RemoteDirectResult | null = null
    let directorMsg: string | null = null
    /**
     * The composition arrives on its own event, before the reply is
     * written. When it does, the cut is committed and the stage clears —
     * the user is watching their video while the assistant finishes its
     * sentence, instead of staring at a progress bar at something that
     * already exists.
     */
    let liveVersion: number | null = null
    let liveArtifact: Artifact | null = null
    /** Reviewer's follow-ups, which arrive before the reply is written. */
    let offers: string[] = []

    try {
      const images = await preparedImages(p.attachments ?? [])
      if (!runAlive(id, tk)) return
      remote = await apiDirect(
        prompt,
        format,
        (e) => {
          if (!runAlive(id, tk)) return
          if (e.type === "stage" && e.stage) pushStage(id, tk, e.stage)
          else if (e.type === "output" && typeof e.chars === "number")
            pushChars(id, tk, e.chars)
          else if (e.type === "artifact" && e.artifact && liveVersion === null) {
            const a = asArtifact(e.artifact)
            if (a) {
              liveArtifact = a
              liveVersion = commitVersion(id, a, null)
              patchProject(id, { phase: "ready" })
              setGenProgress(null)
            }
          } else if (e.type === "plan") {
            const text = planMessage({
              concept: e.concept,
              beats: e.beats,
              signature: e.signature,
            })
            if (text) aiSay(id, { role: "ai", text, kind: "plan" })
          } else if (e.type === "offers" && Array.isArray(e.offers)) {
            offers = e.offers.filter((o) => typeof o === "string" && o.trim()).slice(0, 2)
          }
        },
        images,
        projectRef(id)?.serverId ?? null
      )
    } catch (e) {
      // DirectorError carries the backend's real message — show that.
      directorMsg = e instanceof Error && e.message ? e.message : null
      remote = null
    } finally {
      sealRun(id, tk)
    }
    if (!runAlive(id, tk)) return
    if (!projectRef(id)) return

    const artifact = liveArtifact ?? asArtifact(remote?.artifact)
    if (!artifact) {
      failRun(id, tk, directorMsg)
      return
    }
    // The stream already committed it; this is the no-stream fallback.
    if (liveVersion === null) {
      commitVersion(id, artifact, remote?.model ?? null)
    }

    const secs =
      artifact.kind === "code"
        ? Math.round(artifact.durationInFrames / (artifact.fps || 30))
        : Number(
            (artifact.doc as { canvas?: { durationSecs?: number } })?.canvas?.durationSecs ?? 5
          )
    const fallen = parseSpec(prompt, format)
    const spec: ClipSpec = {
      prompt,
      format: fallen.format,
      style: fallen.style,
      duration: `00:${String(Math.min(30, Math.max(3, secs))).padStart(2, "0")}`,
    }
    patchProject(id, { spec, designedBy: remote?.model ?? null, phase: "ready" })

    // One closing message, carrying whatever the assistant wants to put
    // to the user. The plan already went up the moment it existed.
    const reply = clipReply(
      remote?.reply ?? "",
      "Here it is — tell me what to change."
    )
    const questions = (remote?.questions ?? [])
      .filter(
        (q) =>
          q && typeof q.text === "string" && Array.isArray(q.options) && q.options.length >= 2
      )
      .slice(0, 2)
      .map((q) => ({
        text:
          q.text.trim().length > 140
            ? `${q.text.trim().slice(0, 140).trimEnd()}…`
            : q.text.trim(),
        options: q.options
          .map((o) => (typeof o === "string" ? o.trim() : ""))
          .filter(Boolean)
          .slice(0, 4)
          .map((o) => (o.length > 80 ? `${o.slice(0, 80).trimEnd()}…` : o)),
      }))
    aiSay(id, {
      role: "ai",
      text: reply,
      kind: "reply",
      ...(offers.length > 0 ? { offers } : {}),
      ...(questions.length > 0 ? { question: questions[0]! } : {}),
    })
    // A second question, if the director asked two, becomes its own
    // message so each keeps its own options and send button.
    for (const extra of questions.slice(1)) {
      aiSay(id, { role: "ai", text: "", question: extra, kind: "reply" })
    }
    mirrorVersion(id, undefined, reply, artifact)
  }

  const runGenerate = (
    prompt: string,
    format: string,
    attachments: Attachment[],
    targetId?: number
  ): number => {
    const s = parseSpec(prompt, format)
    const id = targetId ?? projectId.current++
    bumpRun(id)
    repairRounds.current.set(id, 0)
    const base = {
      name: prompt.length > 42 ? `${prompt.slice(0, 42)}…` : prompt,
      spec: s,
      attachments,
      vibe: null,
      lastError: null,
      designedBy: null,
      thread: [{ id: msgId.current++, role: "user" as const, text: prompt }],
    }
    if (targetId == null) {
      commit((ps) => [
        {
          id,
          ...base,
          thread: base.thread,
          versions: 0,
          activeVersion: 0,
          phase: "thinking",
          exportSettings: { ...DEFAULT_EXPORT },
          artifacts: {},
          serverId: null,
          updatedAt: Date.now(),
        },
        ...ps,
      ])
    } else {
      patchProject(id, { ...base, phase: "thinking" })
    }
    setActiveId(id)
    later(id, () => void resolveDirect(id, prompt, format), 100)
    return id
  }

  const generate = (prompt: string, format: string) => {
    if (pending) return
    const draft = active && !active.spec && active.versions === 0 ? active : null
    runGenerate(prompt, format, staged, draft?.id)
    setStaged([])
  }

  /**
   * `explicit` exists because the AI's own question cards submit straight
   * from a button. They used to call setRefineValue(text) and then
   * refine(), which reads state that React has not committed yet — so
   * picking an option sent the previous draft, or nothing at all.
   */
  const refine = (explicit?: string) => {
    const note = (explicit ?? refineValue).trim()
    if (!note || !active) return
    // A submit mid-run stops the current run first, then the note becomes
    // the new directive — never swallowed.
    if (pending) stopGeneration(true)
    const a = projectRef(active.id)
    if (!a) return

    // Chit-chat never touches the director — no version, no pipeline.
    const instant = smalltalkReply(note)
    if (instant) {
      setRefineValue("")
      patchProject(a.id, {
        thread: [
          ...a.thread,
          { id: msgId.current++, role: "user", text: note },
          { id: msgId.current++, role: "ai", text: instant, kind: "reply" },
        ],
      })
      return
    }

    if (a.versions === 0) {
      // No cut yet (failed/empty project): the note retries generation.
      setRefineValue("")
      runGenerate(note, a.spec?.format ?? "16:9", a.attachments ?? [], a.id)
      return
    }

    setRefineValue("")
    const id = a.id
    const tk = runToken.current.get(id) ?? 0
    const baseVersions = a.versions
    const prev = a.artifacts[baseVersions] ?? null
    if (!prev) {
      patchProject(id, { phase: "ready" })
      aiSay(id, { role: "ai", text: "There's no composition on this version to edit.", kind: "reply" })
      return
    }
    if (prev.kind === "doc") {
      // Legacy JSON versions are read-only by design; say so rather than
      // silently starting a different cut.
      patchProject(id, { phase: "ready" })
      aiSay(id, {
        role: "ai",
        text: "This version was built with the old editor and can't be edited in place — describe the change as a new clip and I'll build it fresh.",
        kind: "reply",
      })
      return
    }

    const history = [
      ...a.thread,
      { id: -1, role: "user" as const, text: note },
    ].map(({ role, text }) => ({ role, text }))
    const specSnap = { ...(a.spec as Exclude<typeof a.spec, null>) }
    patchProject(id, {
      thread: [...a.thread, { id: msgId.current++, role: "user", text: note }],
      phase: "generating",
    })

    void (async () => {
      let reply: string | null = null
      let next: Artifact | null = null
      let model: string | null = null
      let offers: string[] = []
      let directorMsg: string | null = null
      let committed = false
      setGenProgress({ stage: "Applying your change", chars: 0 })
      try {
        const images = await preparedImages(a.attachments ?? [])
        if (!runAlive(id, tk)) return
        const res = await apiRefine(
          {
            artifact: prev,
            prompt: specSnap.prompt,
            history,
            note,
            images,
            projectId: projectRef(id)?.serverId ?? null,
          },
          (e) => {
            if (!runAlive(id, tk)) return
            if (e.type === "stage" && e.stage) pushStage(id, tk, e.stage)
            else if (e.type === "output" && typeof e.chars === "number")
              pushChars(id, tk, e.chars)
            else if (e.type === "artifact" && e.artifact && !committed) {
              // Same as a first cut: the new version goes on screen the
              // moment it runs, and the assistant finishes talking over it.
              const a2 = asArtifact(e.artifact)
              if (a2) {
                committed = true
                next = a2
                commitVersion(id, a2, null)
                patchProject(id, { phase: "ready" })
                setGenProgress(null)
              }
            } else if (e.type === "offers" && Array.isArray(e.offers)) {
              offers = e.offers.filter((o) => typeof o === "string" && o.trim()).slice(0, 2)
            }
          }
        )
        reply = res?.reply ?? null
        next = next ?? asArtifact(res?.artifact)
        model = res?.model ?? null
        if (offers.length === 0 && Array.isArray(res?.offers)) {
          offers = res!.offers!.filter((o) => typeof o === "string" && o.trim()).slice(0, 2)
        }
      } catch (e) {
        directorMsg = e instanceof Error && e.message ? e.message : null
      } finally {
        sealRun(id, tk)
      }
      if (!runAlive(id, tk)) return
      if (!next) {
        failRun(id, tk, directorMsg)
        return
      }
      if (!committed) {
        commitVersion(id, next, model)
        patchProject(id, { phase: "ready" })
      }
      const finalReply = clipReply(reply ?? "", "Done — saved as a new version.")
      aiSay(id, {
        role: "ai",
        text: finalReply,
        kind: "reply",
        ...(offers.length > 0 ? { offers } : {}),
      })
      mirrorVersion(id, note, finalReply, next)
    })()
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

  const stopGeneration = (quiet = false) => {
    if (!active || !pending) return
    const id = active.id
    bumpRun(id)
    runTimers.current.get(id)?.forEach((t) => clearTimeout(t))
    runTimers.current.delete(id)
    setGenProgress(null)
    if (quiet) return
    patchProject(id, {
      phase: active.versions > 0 ? "ready" : "idle",
    })
    aiSay(id, {
      role: "ai",
      text: "Stopped — nothing from this run was saved. Take your time, then say the word.",
      kind: "reply",
    })
  }

  const retryGeneration = () => {
    if (!active || pending || !active.spec) return
    const id = active.id
    const { prompt, format } = active.spec
    bumpRun(id)
    repairRounds.current.set(id, 0)
    patchProject(id, { phase: "thinking", lastError: null })
    later(id, () => void resolveDirect(id, prompt, format), 100)
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

  /** The editable source bundle: spec, every version, the thread. */
  const exportProject = () => {
    if (!active?.spec) return
    const payload = {
      app: "SlyxUp Motion",
      kind: "remotion-composition",
      exportedAt: new Date().toISOString(),
      version: `v${active.activeVersion}`,
      spec: active.spec,
      vibe: active.vibe,
      composition: active.artifacts[active.activeVersion] ?? null,
      versions: Object.entries(active.artifacts).map(([v, a]) => ({
        version: Number(v),
        artifact: a,
      })),
      exportSettings: active.exportSettings,
      attachments: active.attachments,
      thread: active.thread.map(({ role, text }) => ({ role, text })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `motion-clip-v${active.activeVersion}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyPrompt = async () => {
    if (!active?.spec) return
    try {
      await navigator.clipboard.writeText(active.spec.prompt)
      setCopied(true)
      timers.current.push(setTimeout(() => setCopied(false), 1600))
    } catch {
      /* clipboard unavailable */
    }
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
    pending,
    refineValue,
    copied,
    staged,
    genProgress,
    setRefineValue,
    generate,
    refine,
    stopGeneration,
    retryGeneration,
    repairVersion,
    ensureServerProject,
    commitAgentResult,
    selectProject,
    deleteProject,
    setActiveVersion: (v: number) => {
      if (active) patchProject(active.id, { activeVersion: v })
    },
    exportProject,
    copyPrompt,
    consumePending,
    stageFiles,
    removeStaged,
    attachToActive,
    removeActiveAttachment,
    updateExportSettings,
  }
}

export type MotionStudio = ReturnType<typeof useMotionStudio>
