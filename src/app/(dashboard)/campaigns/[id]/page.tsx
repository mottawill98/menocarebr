import { Suspense } from "react";
import { getAccountInfo, getCampaignDetail } from "@/lib/data";
import { CampaignDetail } from "@/components/CampaignDetail";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage(props: PageProps<"/campaigns/[id]">) {
  const { id } = await props.params;
  const { campaign, adsets, ads } = await getCampaignDetail(id);

  if (!campaign) notFound();

  const account = await getAccountInfo();

  return (
    <Suspense>
      <CampaignDetail campaign={campaign} adsets={adsets} ads={ads} currency={account.currency} />
    </Suspense>
  );
}
