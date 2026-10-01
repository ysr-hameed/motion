export interface Env {
  Bindings: {
    DB: D1Database
    REFS: R2Bucket
    /** Optional: absent in local dev without KV. Code falls back to direct verify. */
    SESSIONS?: KVNamespace
    AI_PROVIDER: string
    AI_MODEL: string
    AI_GATEWAY_API_KEY?: string
    AUTH_API_URL: string
    ALLOW_ANON?: string
    CORS_ORIGINS?: string
    /** Platform billing (public values, same as the frontend build). */
    BILLING_PROJECT_ID?: string
    BILLING_PUBLISHABLE_KEY?: string
    /** Optional JSON override: {"<platform-plan-id>": "pro" | "studio"}. */
    BILLING_PLAN_MAP?: string
  }
  Variables: {
    user: { id: string; email: string }
  }
}
