export interface Env {
  Bindings: {
    DB: D1Database
    REFS: R2Bucket
    AI_PROVIDER: string
    AI_MODEL: string
    AI_GATEWAY_API_KEY?: string
    AUTH_API_URL: string
    ALLOW_ANON?: string
  }
  Variables: {
    user: { id: string; email: string }
  }
}
