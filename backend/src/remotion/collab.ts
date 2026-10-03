/**
 * Phase 4 collaboration (IMPLEMENTATION_PLAN.md §2.6).
 * Share links follow the existing session scheme (one DO = one conversation),
 * comments/threads persist in DO SQLite next to versions. Invites and review
 * mail are specs until an email provider is wired — the tool says so.
 */

export function shareCreate(
  sessionId: string,
  permission: "view" | "comment" | "edit" = "view",
  daysValid = 7
): { link: string; permission: string; expires: string; note: string } {
  const exp = new Date(Date.now() + Math.max(1, daysValid) * 86_400_000).toISOString().slice(0, 10)
  return {
    link: `https://motion.slyxup.com/v/${sessionId}?perm=${permission}`,
    permission,
    expires: exp,
    note: `Anyone with the link gets ${permission} access until ${exp}. Permissions are advisory until auth lands — do not share unlisted cuts externally.`,
  }
}

export function feedbackRequest(emails: string[]): {
  invited: string[]
  synthesis: string
  note: string
} {
  const invited = [...new Set(emails.map((e) => e.trim()).filter((e) => /.+@.+\..+/.test(e)))].slice(0, 20)
  return {
    invited,
    synthesis: "No replies yet — synthesis appears here once reviewers comment with frame references.",
    note: "Email sending is not wired (no provider). Share the link manually; ask reviewers for 'frame + timestamp + one-line fix' format so synthesis stays mechanical.",
  }
}

export function teamInvite(
  email: string,
  role: "viewer" | "editor" | "admin" = "viewer"
): { email: string; role: string; note: string } {
  return {
    email,
    role,
    note: `Role ${role} recorded for ${email}. Team quotas and SSO are Phase-5 enterprise scope — today every session is its own workspace.`,
  }
}
