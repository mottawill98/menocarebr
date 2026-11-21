import "server-only";
import { getSupabaseAdmin } from "./supabase/admin";

export interface AuditLogInput {
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/** Registra uma acao administrativa (item 28 do briefing). Nunca lança — falha de auditoria não pode quebrar a ação em si. */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("audit_logs").insert({
      actor_user_id: input.actorUserId,
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
    });
  } catch (err) {
    console.error("[audit] falha ao gravar audit_log", err);
  }
}
