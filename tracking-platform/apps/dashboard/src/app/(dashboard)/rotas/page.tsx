import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveDateRange } from "@/lib/date-range";
import { fetchClickFunnelRows } from "@/lib/queries/overview";
import { formatPercent, safeDivide } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { ToggleRouteButton } from "./toggle-route-button";
import { CopyUrlButton } from "./copy-url-button";

const REDIRECT_BASE_URL = process.env.NEXT_PUBLIC_REDIRECT_BASE_URL || "https://go.usemenocare.com.br";

export default async function RotasPage() {
  const profile = await getCurrentProfile();
  const canManage = profile?.role === "ADMIN" || profile?.role === "MANAGER";

  const supabase = await createSupabaseServerClient();
  const { data: routes } = await supabase.from("routes").select("*").order("name");

  const range = resolveDateRange("30d");
  const rows = await fetchClickFunnelRows(supabase, range);

  const statsByRoute = new Map<string, { clicks: number; leads: number; purchases: number }>();
  for (const row of rows) {
    const stat = statsByRoute.get(row.route_id) ?? { clicks: 0, leads: 0, purchases: 0 };
    stat.clicks++;
    if (row.lead_bound) stat.leads++;
    if (row.order_status === "paid" || row.order_status === "approved") stat.purchases++;
    statsByRoute.set(row.route_id, stat);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Rotas</h1>
          <p className="text-sm text-muted">Estatísticas dos últimos 30 dias</p>
        </div>
        {canManage && <ButtonLink href="/rotas/nova">Nova rota</ButtonLink>}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background text-left text-xs font-medium uppercase text-muted">
              <tr>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">URL</th>
                <th className="px-4 py-2 text-right">Redirects</th>
                <th className="px-4 py-2 text-right">Leads</th>
                <th className="px-4 py-2 text-right">Compras</th>
                <th className="px-4 py-2 text-right">Conversão</th>
                {canManage && <th className="px-4 py-2 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {(routes ?? []).map((route) => {
                const stat = statsByRoute.get(route.id) ?? { clicks: 0, leads: 0, purchases: 0 };
                const url = `${REDIRECT_BASE_URL}/r/${route.slug}`;
                return (
                  <tr key={route.id} className="border-b border-border last:border-0 hover:bg-background">
                    <td className="px-4 py-2 font-medium text-foreground">{route.name}</td>
                    <td className="px-4 py-2">
                      <Badge tone={route.active ? "success" : "neutral"}>{route.active ? "Ativa" : "Inativa"}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <code className="text-xs text-muted">{url}</code>
                        <CopyUrlButton url={url} />
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{stat.clicks}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{stat.leads}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{stat.purchases}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatPercent(safeDivide(stat.purchases, stat.clicks))}</td>
                    {canManage && (
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/rotas/${route.id}`} className="text-brand hover:underline">
                            Editar
                          </Link>
                          <ToggleRouteButton id={route.id} active={route.active} />
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
