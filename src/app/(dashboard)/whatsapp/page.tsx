import { listNumbers, getConfigMasked } from "@/lib/redirect/store";
import { WhatsappRedirectDashboard } from "@/components/WhatsappRedirectDashboard";

// A lista de números e a config do pixel são editadas por esta própria
// dashboard — nunca cachear/prerenderizar esta página.
export const dynamic = "force-dynamic";

export default async function WhatsappRedirectPage() {
  const [numbers, config] = await Promise.all([listNumbers(), getConfigMasked()]);

  return <WhatsappRedirectDashboard initialNumbers={numbers} initialConfig={config} />;
}
