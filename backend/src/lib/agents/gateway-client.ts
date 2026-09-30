import { GATEWAY_URL, type StepBudget } from "../models"

export interface GatewayImage {
  name: string
  dataUrl: string
}

export const MAX_IMAGE_DATAURL = 700000
export const MAX_IMAGES = 3

/** OpenAI-style content parts: text first, then any reference images. */
export function userParts(text: string, images: GatewayImage[]): unknown[] {
  const parts: unknown[] = [{ type: "text", text }]
  for (const img of images.slice(0, MAX_IMAGES)) {
    if (
      typeof img.dataUrl === "string" &&
      img.dataUrl.startsWith("data:image/") &&
      img.dataUrl.length < MAX_IMAGE_DATAURL
    ) {
      parts.push({ type: "image_url", image_url: { url: img.dataUrl } })
    }
  }
  return parts
}

interface GatewayResponse {
  choices?: Array<{
    message?: { content?: unknown }
    delta?: { content?: unknown }
  }>
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((p) =>
        typeof p === "string"
          ? p
          : typeof (p as { text?: unknown }).text === "string"
            ? (p as { text: string }).text
            : ""
      )
      .join("")
  }
  return ""
}

function extractDelta(evt: GatewayResponse): string {
  return extractText(evt.choices?.[0]?.delta?.content)
}

/** Gateway failure. HTTP status rides in the message for retry logic. */
export class GatewayError extends Error {
  status: number
  /** True when the gateway explicitly says the model is queued. */
  queued: boolean
  constructor(model: string, status: number, detail: string) {
    super(`Gateway ${model} failed (${status}): ${detail}`)
    this.name = "GatewayError"
    this.status = status
    this.queued = status === 429 || status === 503 || /queue|overloaded|capacity|rate limit/i.test(detail)
  }
}

/** JSON was unparseable even after salvage — distinct from gateway errors. */
export class JsonParseError extends Error {
  raw: string
  constructor(raw: string) {
    super(`Model returned invalid JSON (${raw.length} chars)`)
    this.name = "JsonParseError"
    this.raw = raw
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Robust JSON extraction — handles everything qwen3.7-flash actually emits:
 * - markdown fences (```json ... ```), possibly multiple
 * - prose before/after the JSON ("Here is your cut: {...} Enjoy!")
 * - trailing commas, // and block comments
 * - single quotes (model slip) → double quotes when safe
 * - truncated streams (unbalanced braces) → best-effort close
 */
export function extractJsonCandidate(text: string): string {
  let t = text.trim()
  // 1. Prefer fenced block if present.
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) t = fenced[1].trim()
  // 2. Find outermost { ... } balancing braces outside strings.
  const start = t.indexOf("{")
  if (start === -1) return t
  let depth = 0
  let inStr = false
  let esc = false
  let end = -1
  for (let i = start; i < t.length; i++) {
    const ch = t[i]!
    if (inStr) {
      if (esc) esc = false
      else if (ch === "\\") esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  let candidate = end !== -1 ? t.slice(start, end) : t.slice(start)
  // 3. If truncated, close open braces/strings best-effort.
  if (end === -1) candidate = closeTruncatedJson(candidate)
  // 4. Strip comments + trailing commas.
  candidate = candidate
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1")
    .replace(/,\s*([}\]])/g, "$1")
  return candidate.trim()
}

/** Close unbalanced braces/quotes from a cut-off stream. */
function closeTruncatedJson(s: string): string {
  let out = s
  // Close an unterminated string.
  let inStr = false
  let esc = false
  for (const ch of out) {
    if (inStr) {
      if (esc) esc = false
      else if (ch === "\\") esc = true
      else if (ch === '"') inStr = false
    } else if (ch === '"') inStr = true
  }
  if (inStr) out += '"'
  // Balance braces/brackets outside strings.
  let depthBrace = 0
  let depthBracket = 0
  inStr = false
  esc = false
  for (const ch of out) {
    if (inStr) {
      if (esc) esc = false
      else if (ch === "\\") esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === "{") depthBrace++
    else if (ch === "}") depthBrace--
    else if (ch === "[") depthBracket++
    else if (ch === "]") depthBracket--
  }
  // Trim trailing partial token (a cut mid-word like `"concep`).
  out = out.replace(/[,{\[:]\s*"[^"]*$/, (m) => m.replace(/"[^"]*$/, '""'))
  out = out.replace(/[,{\[:]\s*[^",}\]\s]*$/, (m) => m.replace(/[^",}\]\s]*$/, ""))
  out += "]".repeat(Math.max(0, depthBracket)) + "}".repeat(Math.max(0, depthBrace))
  return out
}

/** Legacy name kept — now robust. */
export function cleanJson(text: string): string {
  return extractJsonCandidate(text)
}

/** Parse with salvage: fences → outermost object → comment/comma strip → truncation close. */
export function parseRobust<T>(raw: string): T {
  const candidate = extractJsonCandidate(raw)
  if (!candidate) throw new JsonParseError(raw)
  try {
    return JSON.parse(candidate) as T
  } catch {
    // Last resort: single-quote → double-quote when the payload looks single-quoted.
    const singleFixed = candidate.replace(/'([^']*)'/g, '"$1"')
    try {
      return JSON.parse(singleFixed) as T
    } catch {
      throw new JsonParseError(raw)
    }
  }
}

export interface CallOpts {
  images?: GatewayImage[]
  stream?: boolean
  onToken?: (tokens: number) => void
  /** Raw text deltas (throttled) — forwarded to the UI live stream view. */
  onDelta?: (delta: string) => void
  /** Extra models to try after the primary is exhausted (dev→prod switching). */
  fallbackModels?: string[]
  /**
   * Return the model's text verbatim instead of parsing it as JSON.
   *
   * Every call used to force `response_format: json_object`, which made
   * code generation impossible — a model asked for TSX inside a JSON mode
   * wraps it in a string and mangles it. Raw calls drop the response
   * format, skip JSON parsing, and skip the JSON self-repair round.
   */
  raw?: boolean
}

/**
 * Model-chain call with queue-aware retries + JSON repair.
 * - Tries models in order: [model, ...fallbackModels]. A queued/dead
 *   primary falls through to the next model instead of 502ing.
 * - Per model: 429/503/queue/timeout → backoff 2s, 4s… then next model.
 * - Invalid JSON → one self-repair call on the same model, then next model.
 * Never throws a raw SyntaxError — always GatewayError or JsonParseError.
 * Returns the model that served the result.
 */
export async function callGateway<T>(args: {
  model: string
  apiKey: string
  system: string
  user: string
  budget: StepBudget
  opts?: CallOpts
}): Promise<{ result: T; raw: string; model: string }> {
  const { model, apiKey, system, user, budget, opts } = args
  const chain = [...new Set([model, ...(opts?.fallbackModels ?? [])])]
  let lastErr: unknown = new Error("No attempt made")
  for (const current of chain) {
    for (let attempt = 1; attempt <= Math.max(1, budget.retries); attempt++) {
      try {
        const raw = opts?.stream
          ? await callStream(current, apiKey, system, user, budget, opts)
          : await callOnce(current, apiKey, system, user, budget, opts?.images ?? [], !!opts?.raw)
        if (opts?.raw) {
          // Verbatim text (code generation) — no parsing, no repair round.
          return { result: raw as T, raw, model: current }
        }
        try {
          return { result: parseRobust<T>(raw), raw, model: current }
        } catch (parseErr) {
          console.log(
            JSON.stringify({ msg: "gateway-json-repair", model: current, attempt, err: String(parseErr) })
          )
          const repaired = await repairJson(current, apiKey, raw, budget)
          return { result: parseRobust<T>(repaired), raw: repaired, model: current }
        }
      } catch (err) {
        lastErr = err
        // JsonParseError means repair already failed on this model — try next.
        if (err instanceof JsonParseError) break
        const retryable = err instanceof GatewayError && err.queued
        const timedOut =
          err instanceof Error && (err.name === "AbortError" || /aborted/i.test(err.message))
        if ((retryable || timedOut) && attempt < budget.retries) {
          console.log(
            JSON.stringify({ msg: "gateway-queue-retry", model: current, attempt, err: String(err) })
          )
          await sleep(2000 * attempt)
          continue
        }
        break // next model in chain
      }
    }
    if (current !== chain[chain.length - 1]) {
      console.log(JSON.stringify({ msg: "gateway-model-fallback", from: current, to: chain[chain.indexOf(current) + 1] }))
    }
  }
  throw lastErr
}

/** Ask the model to re-emit its own broken output as strict JSON. */
async function repairJson(
  model: string,
  apiKey: string,
  broken: string,
  budget: StepBudget
): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), Math.min(budget.timeoutMs, 45000))
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "Re-emit the payload as STRICT JSON only. No fences, no commentary, no trailing commas, double quotes only. Keep all values identical.",
          },
          { role: "user", content: broken.slice(0, 12000) },
        ],
        temperature: 0,
        max_tokens: Math.min(budget.maxTokens, 12000),
        response_format: { type: "json_object" },
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new GatewayError(model, res.status, body.slice(0, 300))
    }
    const data = (await res.json()) as GatewayResponse
    return extractText(data.choices?.[0]?.message?.content)
  } finally {
    clearTimeout(timer)
  }
}

async function callOnce(
  model: string,
  apiKey: string,
  system: string,
  user: string,
  budget: StepBudget,
  images: GatewayImage[],
  raw = false
): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), budget.timeoutMs)
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userParts(user, images) },
        ],
        temperature: budget.temperature,
        max_tokens: budget.maxTokens,
        // Raw calls (code generation) must not be forced into JSON mode —
        // the model would wrap the TSX in a string and mangle it.
        ...(raw ? {} : { response_format: { type: "json_object" } }),
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new GatewayError(model, res.status, body.slice(0, 300))
    }
    const data = (await res.json()) as GatewayResponse
    return extractText(data.choices?.[0]?.message?.content)
  } finally {
    clearTimeout(timer)
  }
}

async function callStream(
  model: string,
  apiKey: string,
  system: string,
  user: string,
  budget: StepBudget,
  opts?: CallOpts
): Promise<string> {
  const ctrl = new AbortController()
  let timer: ReturnType<typeof setTimeout> | null = null
  const arm = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => ctrl.abort(), budget.idleMs)
  }
  const hardCap = setTimeout(() => ctrl.abort(), budget.totalMs)
  arm()
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userParts(user, opts?.images ?? []) },
        ],
        temperature: budget.temperature,
        max_tokens: budget.maxTokens,
        ...(opts?.raw ? {} : { response_format: { type: "json_object" } }),
      }),
    })
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "")
      throw new GatewayError(model, res.status, body.slice(0, 300))
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ""
    let text = ""
    let pendingDelta = ""
    let lastEmit = 0
    const flushDelta = () => {
      if (pendingDelta) {
        // Cap per flush so one event stays small; the UI appends.
        opts?.onDelta?.(pendingDelta.slice(0, 2000))
        pendingDelta = ""
      }
    }
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      arm()
      buf += decoder.decode(value, { stream: true })
      const frames = buf.split("\n\n")
      buf = frames.pop() ?? ""
      for (const frame of frames) {
        for (const line of frame.split("\n")) {
          const t = line.trim()
          if (!t.startsWith("data:")) continue
          const payload = t.slice(5).trim()
          if (payload === "[DONE]") continue
          try {
            const evt = JSON.parse(payload) as GatewayResponse
            const delta =
              extractText(evt.choices?.[0]?.message?.content) || extractDelta(evt)
            if (delta) {
              text += delta
              pendingDelta += delta
              const now = Date.now()
              if (now - lastEmit > 400) {
                lastEmit = now
                opts?.onToken?.(Math.round(text.length / 4))
                flushDelta()
              }
            }
          } catch {
            /* keep-alive frames */
          }
        }
      }
    }
    opts?.onToken?.(Math.round(text.length / 4))
    flushDelta()
    return text
  } finally {
    if (timer) clearTimeout(timer)
    clearTimeout(hardCap)
  }
}
