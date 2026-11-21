import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { RoleSelect } from "./role-select";
import { InviteUserForm } from "./invite-user-form";

export default async function UsuariosPage() {
  const currentProfile = await requireRole(["ADMIN"]);
  const supabase = await createSupabaseServerClient();
  const { data: profiles } = await supabase.from("profiles").select("*").order("created_at");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Usuários</h1>
        <p className="text-sm text-muted">
          Convidar por e-mail exige SMTP configurado no projeto Supabase (ver docs/DEPLOY.md). Alternativa: crie o usuário direto no
          painel do Supabase Auth e promova o role aqui.
        </p>
      </div>

      <Card>
        <CardContent>
          <InviteUserForm />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background text-left text-xs font-medium uppercase text-muted">
              <tr>
                <th className="px-4 py-2">E-mail</th>
                <th className="px-4 py-2">Criado em</th>
                <th className="px-4 py-2">Role</th>
              </tr>
            </thead>
            <tbody>
              {(profiles ?? []).map((profile) => (
                <tr key={profile.id} className="border-b border-border last:border-0 hover:bg-background">
                  <td className="px-4 py-2 font-medium text-foreground">{profile.email}</td>
                  <td className="px-4 py-2 tabular-nums text-muted">{formatDateTime(profile.created_at)}</td>
                  <td className="px-4 py-2">
                    <RoleSelect userId={profile.id} role={profile.role} disabled={profile.id === currentProfile.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
