import { z } from "zod";
import { ApiError } from "./api-error";

/** Shared input validation for product routes (BACKEND_API_PLAN §13 Sprint 6). */

export function parse<T>(schema: z.ZodType<T>, body: unknown, what = "request"): T {
  const res = schema.safeParse(body);
  if (!res.success) {
    throw new ApiError(
      400,
      "invalid_request",
      `Invalid ${what}: ${res.error.issues.map((i) => `${i.path.join(".") || "body"} ${i.message}`).join("; ")}`,
    );
  }
  return res.data;
}

export const projectCreate = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional(),
});

export const projectUpdate = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export const compositionUpdate = z.object({
  title: z.string().max(200).nullable().optional(),
  project_id: z.string().max(80).nullable().optional(),
  status: z.enum(["draft", "exported", "archived"]).nullable().optional(),
  duration_s: z.number().positive().max(3600).nullable().optional(),
  fps: z.number().int().min(1).max(120).nullable().optional(),
  width: z.number().int().min(16).max(7680).nullable().optional(),
  height: z.number().int().min(16).max(7680).nullable().optional(),
  thumbnail_url: z.string().url().max(2000).nullable().optional(),
});

export const ratingBody = z.object({ rating: z.number().int().min(1).max(5) });

export const templateCreate = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.enum(["product", "social", "logo", "explainer", "event", "branding"]).default("product"),
  duration_s: z.number().positive().max(3600).optional(),
  composition_snapshot: z.string().max(500_000).optional(),
});

export const brandKitUpsert = z.object({
  logo_primary_url: z.string().url().max(2000).nullable().optional(),
  logo_dark_url: z.string().url().max(2000).nullable().optional(),
  colors: z.string().max(500).nullable().optional(),
  font_heading: z.string().max(120).nullable().optional(),
  font_body: z.string().max(120).nullable().optional(),
  guidelines_url: z.string().url().max(2000).nullable().optional(),
});

export const exportCreate = z.object({
  composition_id: z.string().min(1).max(80),
  preset: z.string().min(1).max(80),
  width: z.number().int().min(16).max(7680).optional(),
  height: z.number().int().min(16).max(7680).optional(),
  fps: z.number().int().min(1).max(120).optional(),
  format: z.enum(["mp4", "webm", "gif", "png_seq"]).optional(),
  r2_key: z.string().max(500).optional(),
  cdn_url: z.string().url().max(2000).optional(),
  file_size_bytes: z.number().int().nonnegative().optional(),
});

export const teamCreate = z.object({ name: z.string().trim().min(1).max(120).default("My team") });

export const teamInvite = z.object({
  email: z.string().email().max(320),
  role: z.enum(["editor", "viewer"]).default("editor"),
});

export const profileUpdate = z.object({
  firstName: z.string().max(120).optional(),
  lastName: z.string().max(120).optional(),
  avatarUrl: z.string().url().max(2000).optional(),
  username: z.string().max(60).nullable().optional(),
  bio: z.string().max(500).nullable().optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
});

export const passwordChange = z.object({
  currentPassword: z.string().min(1).max(500),
  newPassword: z.string().min(8).max(500),
});

export const contactBody = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email().max(320),
  topic: z.enum(["bug", "feature", "billing", "other"]).default("other"),
  message: z.string().trim().min(10).max(5000),
});
