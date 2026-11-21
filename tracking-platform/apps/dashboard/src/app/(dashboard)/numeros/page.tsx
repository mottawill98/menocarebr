import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveDateRange } from "@/lib/date-range";
import { fetchClickFunnelRows } from "@/lib/queries/overview";
import { formatPercent, safeDivide } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { ToggleNumberButton } from "./toggle-number-button";

export default async function NumerosPage() {
  const profile = await getCurrentProfile();
  const canManage = profile?.role === "ADMIN" || profile?.role === "MANAGER";

  const supabase = await createSupabaseServerClient();
  const { data: numbers } = await supabase.from("whatsapp_numbers").select("*").order("label");

  const today = resolveDateRange("today");
  const todayRows = await fetchClickFunnelRows(supabase, today);

  const statsByNumber = new Map<string, { clicks: number; leads: number; purchases: number }>();
  for (const row of todayRows) {
    const stat = statsByNumber.get(row.whatsapp_number_id) ?? { clicks: 0, leads: 0, purchases: 0 };
    stat.clicks++;
    if (row.lead_bound) stat.leads++;
    if (row.order_status === "paid" || row.order_status === "approved") stat.purchases++;
    statsByNumber.set(row.whatsapp_number_id, stat);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Números de WhatsApp</h1>
        {canManage && <ButtonLink href="/numeros/novo">Novo número</ButtonLink>}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background text-left text-xs font-medium uppercase text-muted">
              <tr>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">Telefone</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Peso</th>
                <th className="px-4 py-2 text-right">Redirects hoje</th>
                <th className="px-4 py-2 text-right">Leads hoje</th>
                <th className="px-4 py-2 text-right">Compras hoje</th>
                <th className="px-4 py-2 text-right">Conversão</th>
                {canManage && <th className="px-4 py-2 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {(numbers ?? []).map((number) => {
                const stat = statsByNumber.get(number.id) ?? { clicks: 0, leads: 0, purchases: 0 };
                return (
                  <tr key={number.id} className="border-b border-border last:border-0 hover:bg-background">
                    <td className="px-4 py-2 font-medium text-foreground">{number.label}</td>
                    <td className="px-4 py-2 tabular-nums text-muted">+{number.phone}</td>
                    <td className="px-4 py-2">
                      <Badge tone={number.active ? "success" : "neutral"}>{number.active ? "Ativo" : "Inativo"}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{number.weight}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{stat.clicks}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{stat.leads}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{stat.purchases}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatPercent(safeDivide(stat.purchases, stat.clicks))}</td>
                    {canManage && (
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/numeros/${number.id}`} className="text-brand hover:underline">
                            Editar
                          </Link>
                          <ToggleNumberButton id={number.id} active={number.active} />
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
