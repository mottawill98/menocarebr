import { createSupabaseAdmin } from "@tracking/shared";
import type { Env } from "../env.js";

export interface WebhookLogInput {
  endpoint: string;
  requestId: string;
  status: number;
  durationMs: number;
  result: string;
  payloadSanitized?: Record<string, unknown>;
  errorMessage?: string;
}

const SENSITIVE_KEYS = new Set(["token", "access_token", "password", "authorization", "secret", "api_key", "signature"]);

export function sanitizeForLog(payload: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) continue;
    clean[key] = value;
  }
  return clean;
}

/** Grava o log tecnico do webhook de forma best-effort — nunca deve quebrar a resposta ao CRM. */
export async function recordWebhookLog(env: Env, input: WebhookLogInput): Promise<void> {
  try {
    const supabase = createSupabaseAdmin(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    await supabase.from("webhook_logs").insert({
      endpoint: input.endpoint,
      request_id: input.requestId,
      status: input.status,
      duration_ms: input.durationMs,
      result: input.result,
      payload_sanitized: input.payloadSanitized ?? null,
      error_message: input.errorMessage ?? null,
    });
  } catch {
    // best-effort
  }
}
