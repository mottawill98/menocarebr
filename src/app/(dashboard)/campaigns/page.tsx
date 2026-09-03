import { Suspense } from "react";
import { getAccountInfo, getCampaigns } from "@/lib/data";
import { CampaignsTable } from "@/components/CampaignsTable";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const campaigns = await getCampaigns();

  if (!campaigns.length) {
    return (
      <p className="text-sm text-ink-muted">
        Nenhum dado sincronizado ainda para esta conta. Use o botão &quot;Atualizar dados agora&quot; no topo da página.
      </p>
    );
  }

  const account = await getAccountInfo();

  return (
    <Suspense>
      <CampaignsTable campaigns={campaigns} currency={account.currency} />
    </Suspense>
  );
}
