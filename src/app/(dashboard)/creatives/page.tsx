import { Suspense } from "react";
import { getAccountInfo, getAds, getCampaigns, getAdSets } from "@/lib/data";
import { CreativesAnalysis } from "@/components/CreativesAnalysis";

export const dynamic = "force-dynamic";

export default async function CreativesPage() {
  const ads = await getAds();

  if (!ads.length) {
    return (
      <p className="text-sm text-ink-muted">
        Nenhum dado sincronizado ainda para esta conta. Use o botão &quot;Atualizar dados agora&quot; no topo da página.
      </p>
    );
  }

  const [campaigns, adsets, account] = await Promise.all([getCampaigns(), getAdSets(), getAccountInfo()]);

  return (
    <Suspense>
      <CreativesAnalysis ads={ads} campaigns={campaigns} adsets={adsets} currency={account.currency} />
    </Suspense>
  );
}
