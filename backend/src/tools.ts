import { tool } from "ai"
import { z } from "zod"

/**
 * Tools the model can call.
 *
 * Built with the AI SDK's `tool()` helper, which derives the JSON schema from
 * the zod validator — so the schema the model sees and the schema the input is
 * validated against cannot drift apart.
 *
 * These are intentionally pure and self-contained: no network calls, no
 * bindings, no I/O. That matters for the CPU budget — every millisecond spent
 * waiting on a third party is wall time the Durable Object stays awake for
 * nothing, and tool work is exactly where a from-scratch agent tends to
 * accumulate surprise cost.
 */
export const tools = {
  get_current_time: tool({
    description:
      "Get the current date and time in a specific IANA timezone, e.g. " +
      "'Europe/London' or 'Asia/Tokyo'. Use this whenever the answer depends " +
      "on what time it is now — never guess the current time.",
    inputSchema: z.object({
      timezone: z
        .string()
        .describe('IANA timezone name, e.g. "Asia/Tokyo" or "America/New_York".'),
    }),
    execute: async ({ timezone }) => {
      try {
        const now = new Date()
        return {
          timezone,
          iso: now.toISOString(),
          local: new Intl.DateTimeFormat("en-GB", {
            timeZone: timezone,
            dateStyle: "full",
            timeStyle: "medium",
          }).format(now),
        }
      } catch {
        // An unknown zone must come back as a tool result the model can read
        // and recover from, not as a thrown error that kills the turn.
        return {
          timezone,
          error: `Unknown IANA timezone "${timezone}". Use a name like "UTC", "Europe/London" or "Asia/Tokyo".`,
        }
      }
    },
  }),

  calculate: tool({
    description:
      "Evaluate an arithmetic expression and return the result. Supports + - * / " +
      "parentheses, and functions such as min, max, round, floor, ceil, abs, sqrt " +
      "and pow. Use this for any arithmetic rather than doing it yourself.",
    inputSchema: z.object({
      expression: z
        .string()
        .describe('Arithmetic expression, e.g. "(128 * 3) / 4" or "pow(2, 10)".'),
    }),
    execute: async ({ expression }) => {
      const value = evaluateArithmetic(expression)
      if (typeof value === "string") return { expression, error: value }
      return { expression, result: value }
    },
  }),
}

/**
 * A small arithmetic evaluator.
 *
 * Written as a recursive-descent parser rather than using `eval` or
 * `new Function`, because the expression arrives from a model and is therefore
 * untrusted input: `eval` would turn a bad generation into remote code
 * execution inside the Worker.
 */
function evaluateArithmetic(input: string): number | string {
  const src = input.trim()
  if (!src) return "Empty expression."
  if (src.length > 200) return "Expression is too long."

  const FUNCS: Record<string, (a: number, b?: number) => number> = {
    min: (a, b) => Math.min(a, b ?? a),
    max: (a, b) => Math.max(a, b ?? a),
    round: (a) => Math.round(a),
    floor: (a) => Math.floor(a),
    ceil: (a) => Math.ceil(a),
    abs: (a) => Math.abs(a),
    sqrt: (a) => Math.sqrt(a),
    pow: (a, b) => Math.pow(a, b ?? 1),
  }

  let pos = 0

  const skipSpace = () => {
    while (pos < src.length && /\s/.test(src[pos]!)) pos++
  }

  const parseExpression = (): number | string => {
    let left = parseTerm()
    if (typeof left === "string") return left
    for (;;) {
      skipSpace()
      const op = src[pos]
      if (op !== "+" && op !== "-") return left
      pos++
      const right = parseTerm()
      if (typeof right === "string") return right
      left = op === "+" ? left + right : left - right
    }
  }

  const parseTerm = (): number | string => {
    let left = parseUnary()
    if (typeof left === "string") return left
    for (;;) {
      skipSpace()
      const op = src[pos]
      if (op !== "*" && op !== "/") return left
      pos++
      const right = parseUnary()
      if (typeof right === "string") return right
      if (op === "/" && right === 0) return "Division by zero."
      left = op === "*" ? left * right : left / right
    }
  }

  const parseUnary = (): number | string => {
    skipSpace()
    if (src[pos] === "-") {
      pos++
      const v = parseUnary()
      return typeof v === "string" ? v : -v
    }
    if (src[pos] === "+") {
      pos++
      return parseUnary()
    }
    return parsePrimary()
  }

  const parsePrimary = (): number | string => {
    skipSpace()

    if (src[pos] === "(") {
      pos++
      const inner = parseExpression()
      if (typeof inner === "string") return inner
      skipSpace()
      if (src[pos] !== ")") return "Unbalanced parentheses."
      pos++
      return inner
    }

    // Function call: name ( ... )
    const fn = /^[a-z]+/i.exec(src.slice(pos))
    if (fn && Object.hasOwn(FUNCS, fn[0].toLowerCase())) {
      const name = fn[0].toLowerCase()
      pos += fn[0].length
      skipSpace()
      if (src[pos] !== "(") return `"${name}" must be called with parentheses.`
      pos++
      const args: number[] = []
      for (;;) {
        const arg = parseExpression()
        if (typeof arg === "string") return arg
        args.push(arg)
        skipSpace()
        if (src[pos] === ",") {
          pos++
          continue
        }
        if (src[pos] === ")") {
          pos++
          break
        }
        return `"${name}" has unbalanced parentheses.`
      }
      const value = FUNCS[name]!(args[0]!, args[1])
      return Number.isFinite(value) ? value : `"${name}" produced a non-finite result.`
    }

    const num = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(src.slice(pos))
    if (!num) return `Unexpected character "${src[pos] ?? "end of input"}".`
    pos += num[0].length
    return Number(num[0])
  }

  const result = parseExpression()
  if (typeof result === "string") return result
  skipSpace()
  if (pos !== src.length) return `Unexpected trailing input at "${src.slice(pos)}".`
  if (!Number.isFinite(result)) return "Result is not a finite number."
  return result
}