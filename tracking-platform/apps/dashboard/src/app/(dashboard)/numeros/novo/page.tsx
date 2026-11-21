import { requireRole } from "@/lib/auth";
import { NumberForm } from "../number-form";

export default async function NovoNumeroPage() {
  await requireRole(["ADMIN", "MANAGER"]);
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">Novo número de WhatsApp</h1>
      <NumberForm />
    </div>
  );
}
