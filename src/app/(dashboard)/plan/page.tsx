import { Suspense } from "react";
import { getAccountInfo, getOverview, getCampaigns, getAdSets, getAds } from "@/lib/data";
import { CampaignPlanView } from "@/components/CampaignPlanView";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const [overview, campaigns] = await Promise.all([getOverview(), getCampaigns()]);

  if (!overview || !campaigns.length) {
    return (
      <p className="text-sm text-ink-muted">
        Nenhum dado sincronizado ainda para esta conta. Use o botão &quot;Atualizar dados agora&quot; no topo da página.
      </p>
    );
  }

  const [adsets, ads, account] = await Promise.all([getAdSets(), getAds(), getAccountInfo()]);

  return (
    <Suspense>
      <CampaignPlanView
        campaigns={campaigns}
        adsets={adsets}
        ads={ads}
        currency={account.currency}
        accountHealth={overview.accountHealth}
      />
    </Suspense>
  );
}
