import { useEffect, useReducer } from "react"
import { SlyxupClient, SlyxupError } from "@slyxup/core"
import type { SessionResponse } from "@slyxup/core"

export interface AuthUser {
  name: string
  email: string
  plan: string
  avatarUrl?: string
  provider: "email" | "google" | "github"
}

const EVENT = "motion:auth-change"

export const authConfig = {
  publishableKey: import.meta.env.VITE_SLYXUP_PUBLISHABLE_KEY || "",
  apiUrl:
    import.meta.env.VITE_SLYXUP_API_URL ||
    "https://auth-slyxup-com.auth-0f4.workers.dev",
  projectId: import.meta.env.VITE_SLYXUP_PROJECT_ID || "",
}

/** True once a real publishable key is provided (see .env.example). */
export function isAuthConfigured(): boolean {
  const k = authConfig.publishableKey.trim()
  return k.length > 0 && !k.includes("REPLACE")
}

let client: SlyxupClient | null = null

const TOKEN_KEY = "motion:auth-token:v1"

function storedToken(): string | undefined {
  try {
    return localStorage.getItem(TOKEN_KEY) || undefined
  } catch {
    return undefined
  }
}

function rememberToken() {
  try {
    const t = client?.getToken()
    if (t) localStorage.setItem(TOKEN_KEY, t)
  } catch {
    /* storage unavailable */
  }
}

export function getAuthClient(): SlyxupClient {
  if (!client) {
    client = new SlyxupClient({
      publishableKey: authConfig.publishableKey,
      apiUrl: authConfig.apiUrl,
      sessionToken: storedToken(),
      tokenStorage: "sessionStorage",
    })
  }
  return client
}

type SessionUser = SessionResponse["user"] & {
  firstName?: string | null
  lastName?: string | null
}

function mapUser(u: SessionUser): AuthUser {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim()
  return {
    name: full || u.username || u.name || u.email.split("@")[0],
    email: u.email,
    plan: "Free plan",
    avatarUrl: u.avatarUrl ?? undefined,
    provider: "email",
  }
}

/** Friendly one-line message for auth failures. */
export function authErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof SlyxupError) {
    if (e.code === "EMAIL_NOT_VERIFIED")
      return "Email not verified yet — check your inbox for the link."
    return e.message || fallback
  }
  if (e instanceof Error && e.message) return e.message
  return fallback
}

export type SignInResult =
  | { ok: true; user: AuthUser }
  | { challenge: true; challengeToken: string }
  | { unverified: true; email: string }

function emit() {
  window.dispatchEvent(new Event(EVENT))
}

/**
 * Shared session cache — one network request per page load no matter how
 * many components call useUser(), instead of one request per mount.
 * `undefined` = not loaded yet, after which the value (user or null) is
 * reused until an auth event invalidates it.
 */
let userSnapshot: AuthUser | null | undefined
let userPending: Promise<AuthUser | null> | null = null
const userSubs = new Set<() => void>()

function publishUser() {
  userSubs.forEach((fn) => fn())
}

async function loadUser(): Promise<AuthUser | null> {
  if (userPending) return userPending
  userPending = auth.restore()
  try {
    userSnapshot = await userPending
  } finally {
    userPending = null
  }
  publishUser()
  return userSnapshot
}

function handleAuthEvent() {
  // Login / logout / signup: invalidate once and refetch once —
  // concurrent events share the same in-flight request.
  userSnapshot = undefined
  void loadUser()
}

/**
 * Real Stack auth. Every method throws a friendly Error on failure —
 * pages catch it and render the message. No backend of our own needed.
 */
export const auth = {
  isConfigured: isAuthConfigured,

  async restore(): Promise<AuthUser | null> {
    if (!isAuthConfigured()) return null
    try {
      const res = await getAuthClient().sessions.get()
      if (!res?.user) return null
      return mapUser(res.user)
    } catch {
      return null
    }
  },

  async loginEmail(email: string, password: string): Promise<SignInResult> {
    const res = await getAuthClient().auth.signIn({ email, password })
    if (res && "challengeToken" in res && res.challengeToken) {
      return { challenge: true, challengeToken: res.challengeToken as string }
    }
    const user = (res as { user?: SessionUser }).user
    if (!user) throw new Error("Sign-in failed — please try again.")
    rememberToken()
    emit()
    return { ok: true, user: mapUser(user) }
  },

  async completeChallenge(
    challengeToken: string,
    code: string
  ): Promise<AuthUser> {
    const res = await getAuthClient().auth.completeSignIn({
      challengeToken,
      code,
    })
    const user = (res as { user?: SessionUser }).user
    if (!user) throw new Error("Invalid code — try again.")
    rememberToken()
    emit()
    return mapUser(user)
  },

  async signupEmail(
    name: string,
    email: string,
    password: string
  ): Promise<AuthUser> {
    const [firstName, ...rest] = name.trim().split(/\s+/)
    const res = await getAuthClient().auth.signUp({
      email,
      password,
      firstName,
      lastName: rest.join(" ") || undefined,
    })
    const user = (res as { user?: SessionUser }).user
    if (!user) throw new Error("Sign-up failed — please try again.")
    rememberToken()
    emit()
    return mapUser(user)
  },

  async startOAuth(provider: "google" | "github"): Promise<void> {
    await getAuthClient().auth.startOAuth(
      provider,
      `${window.location.origin}/auth/callback`
    )
  },

  /** Called on /auth/callback — exchanges slyxup_code, returns user or null. */
  async completeOAuth(): Promise<AuthUser | null> {
    const res = await getAuthClient().auth.completeOAuth()
    const user = (res as { user?: SessionUser } | null)?.user
    if (!user) return null
    emit()
    return mapUser(user)
  },

  async forgotPassword(email: string): Promise<void> {
    await getAuthClient().auth.forgotPassword(email, authConfig.projectId || undefined)
  },

  async resetPassword(token: string, password: string): Promise<void> {
    await getAuthClient().auth.resetPassword(token, password)
  },

  async resendVerification(email: string): Promise<void> {
    await getAuthClient().auth.resendVerification(email)
  },

  async logout(): Promise<void> {
    if (isAuthConfigured()) {
      try {
        await getAuthClient().auth.signOut()
      } catch {
        /* already signed out server-side */
      }
    }
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* noop */
    }
    client = null
    emit()
  },
}

/** Bearer token for backend calls (null when signed out). */
export function getAuthToken(): string | null {
  if (!isAuthConfigured()) return null
  try {
    return getAuthClient().getToken() ?? null
  } catch {
    return null
  }
}

export function useUser(): AuthUser | null {
  const [, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    userSubs.add(bump)
    // First subscriber triggers the single shared fetch; every later
    // subscriber (and every remount) reuses the cached session.
    if (userSnapshot === undefined) void loadUser()
    window.addEventListener(EVENT, handleAuthEvent)
    return () => {
      userSubs.delete(bump)
      window.removeEventListener(EVENT, handleAuthEvent)
    }
  }, [bump])
  return userSnapshot ?? null
}

export function userInitials(user: Pick<AuthUser, "name">): string {
  const parts = user.name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return user.name.slice(0, 2).toUpperCase()
}
