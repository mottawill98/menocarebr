"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { resendMetaEvent as resendMetaEventOnWorker, sendMetaTestEvent as sendTestEventOnWorker } from "@/lib/worker-client";

export async function resendMetaEventAction(metaEventId: string): Promise<{ error?: string; ok?: boolean }> {
  const profile = await assertRole(["ADMIN", "MANAGER"]);
  try {
    await resendMetaEventOnWorker(metaEventId);
    await writeAuditLog({ actorUserId: profile.id, action: "meta_event.resent", resourceType: "meta_event", resourceId: metaEventId });
    revalidatePath("/meta-capi");
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao reenviar evento." };
  }
}

export async function sendMetaTestEventAction(): Promise<{ error?: string; ok?: boolean; detail?: string }> {
  const profile = await assertRole(["ADMIN", "MANAGER"]);
  try {
    const result = await sendTestEventOnWorker();
    await writeAuditLog({ actorUserId: profile.id, action: "meta_event.test_sent", resourceType: "meta_event", after: { ok: result.ok } });
    return { ok: result.ok, detail: JSON.stringify(result.response) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao enviar evento de teste." };
  }
}
