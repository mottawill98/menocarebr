"use client";

import { useMemo } from "react";
import { ShieldAlert, ShieldCheck, ShieldQuestion, CircleHelp } from "lucide-react";
import { PeriodSelector } from "./PeriodSelector";
import { usePeriod } from "@/lib/use-period";
import { PERIOD_LABELS } from "@/lib/periods";
import { formatMoney, formatPercent, formatRoas } from "@/lib/format";
import { buildCampaignPlan, type CampaignDraft, type AudienceProfile, type DeliverySetup } from "@/lib/analysis/campaign-plan";
import type { ProcessedCampaign, ProcessedAdSet, ProcessedAd, AccountHealth } from "@/lib/analysis/process";

const CONFIDENCE_LABEL: Record<string, string> = { alta: "Confiança alta", media: "Confiança média", baixa: "Confiança baixa" };
const CONFIDENCE_CLASS: Record<string, string> = {
  alta: "bg-status-good/10 text-status-good",
  media: "bg-status-warning/15 text-ink-secondary",
  baixa: "bg-status-serious/10 text-status-serious",
};

function VerificationBadge({ status }: { status: string | null }) {
  if (status === "verified") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-status-good/10 px-2.5 py-1 text-xs font-semibold text-status-good">
        <ShieldCheck size={13} /> Verificado
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-status-critical/10 px-2.5 py-1 text-xs font-semibold text-status-critical">
        <ShieldAlert size={13} /> Rejeitado
      </span>
    );
  }
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-status-warning/15 px-2.5 py-1 text-xs font-semibold text-ink-secondary">
        <CircleHelp size={13} /> Não disponível
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-status-warning/15 px-2.5 py-1 text-xs font-semibold text-ink-secondary">
      <ShieldQuestion size={13} /> {status}
    </span>
  );
}

export function CampaignPlanView({
  campaigns,
  adsets,
  ads,
  currency,
  accountHealth,
}: {
  campaigns: ProcessedCampaign[];
  adsets: ProcessedAdSet[];
  ads: ProcessedAd[];
  currency: string;
  accountHealth: AccountHealth;
}) {
  const [period] = usePeriod();
  const plan = useMemo(() => buildCampaignPlan(campaigns, adsets, ads, period, currency), [campaigns, adsets, ads, period, currency]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Plano de ação — {PERIOD_LABELS[period]}</h1>
          <p className="text-sm text-ink-muted">
            Configurações de campanha recomendadas, geradas a partir dos criativos e conjuntos com melhor desempenho real da conta.
          </p>
        </div>
        <PeriodSelector />
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">O que precisa ser resolvido nesta conta antes de criar/publicar</h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div>
              <div className="font-medium text-ink">Verificação do negócio {accountHealth.businessName ? `(${accountHealth.businessName})` : ""}</div>
              <p className="mt-0.5 text-xs text-ink-muted">
                {accountHealth.verificationStatus === "verified"
                  ? "Negócio verificado — não é um bloqueio para criar campanhas."
                  : "A Meta exige um negócio verificado para autorizar a criação de conjuntos de anúncios. Se não estiver \"verified\", resolva em Business Manager → Configurações de Segurança → Verificação da Empresa antes de qualquer criação via API ou Gerenciador de Anúncios."}
              </p>
            </div>
            <VerificationBadge status={accountHealth.verificationStatus} />
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="font-medium text-ink">Papel na conta de anúncios</div>
            <p className="mt-0.5 text-xs text-ink-muted">
              Confirme que quem vai criar as campanhas tem papel de <strong>Anunciante</strong> (ou superior) especificamente nesta conta — em
              Configurações do Negócio → Contas de Anúncio → Pessoas. Ter a permissão <code>ads_management</code> no token não é suficiente sem esse papel.
            </p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="font-medium text-ink">Permissão na Página vinculada</div>
            <p className="mt-0.5 text-xs text-ink-muted">
              Os conjuntos vencedores direcionam para conversa no WhatsApp através de uma Página do Facebook. Confirme que esse mesmo usuário
              tem permissão para criar anúncios nessa Página (Configurações da Página → Acesso da Página, ou Configurações do Negócio → Páginas).
            </p>
          </div>
        </div>
      </div>

      {!plan.hasEnoughData ? (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm text-ink-muted">
          Ainda não há criativos suficientes classificados como vencedores em &quot;{PERIOD_LABELS[period]}&quot; (
          {plan.winningAdsCount} encontrado(s)) para montar um plano com confiança. Tente um período mais longo (ex.: 30 dias ou máximo).
        </div>
      ) : (
        <div className="space-y-6">
          {plan.drafts.map((draft, i) => (
            <DraftCard key={draft.key} draft={draft} index={i + 1} currency={currency} periodLabel={PERIOD_LABELS[period]} />
          ))}
        </div>
      )}
    </div>
  );
}

function AudienceBlock({ audience, title }: { audience: AudienceProfile | null; title: string }) {
  if (!audience) return <p className="text-sm text-ink-muted">Sem dados de público suficientes.</p>;
  return (
    <div>
      <div className="text-xs font-semibold text-ink-muted">{title}</div>
      <p className="mt-0.5 text-sm text-ink-secondary">
        {audience.genderLabel}, {audience.ageMin ?? "?"}–{audience.ageMax ?? "?"} anos · {audience.countries.join(", ") || "N/A"}
        {audience.locationTypes.length ? ` (${audience.locationTypes.join(", ")})` : ""} ·{" "}
        {audience.advantageAudience ? "Advantage+ Audience ativado" : "sem Advantage+ Audience"}
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">
        Presente em {audience.sampleSize} de {audience.totalWinningAdsets} conjunto(s) vencedor(es) analisados.
      </p>
    </div>
  );
}

function DeliveryBlock({ delivery }: { delivery: DeliverySetup | null }) {
  if (!delivery) return null;
  return (
    <div>
      <div className="text-xs font-semibold text-ink-muted">Otimização e entrega</div>
      <p className="mt-0.5 text-sm text-ink-secondary">
        {delivery.optimizationGoal ?? "N/A"} · cobrança por {delivery.billingEvent ?? "N/A"} · lance {delivery.bidStrategy ?? "automático (padrão)"}
        {delivery.destinationType ? ` · destino: ${delivery.destinationType}` : ""}
      </p>
      {delivery.pixelId && (
        <p className="mt-0.5 text-xs text-ink-muted">
          Pixel {delivery.pixelId} · evento {delivery.customEventType ?? "N/A"}
          {delivery.pageId ? ` · Página ${delivery.pageId}` : ""}
        </p>
      )}
    </div>
  );
}

function DraftCard({
  draft,
  index,
  currency,
  periodLabel,
}: {
  draft: CampaignDraft;
  index: number;
  currency: string;
  periodLabel: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">
          Rascunho {index} — {draft.title}
        </h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${CONFIDENCE_CLASS[draft.confidence]}`}>
          {CONFIDENCE_LABEL[draft.confidence]}
        </span>
      </div>

      <p className="mt-2 text-sm text-ink-secondary">{draft.reason}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold text-ink-muted">Objetivo</div>
          <p className="mt-0.5 text-sm text-ink-secondary">{draft.objective}</p>
        </div>
        <div>
          <div className="text-xs font-semibold text-ink-muted">Orçamento diário sugerido (CBO)</div>
          <p className="mt-0.5 text-sm text-ink-secondary">
            {draft.suggestedDailyBudget !== null ? formatMoney(draft.suggestedDailyBudget, currency) : "N/A"}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">{draft.budgetRationale}</p>
        </div>
        <AudienceBlock audience={draft.audience} title={draft.audienceVariant ? "Público — conjunto controle" : "Público"} />
        {draft.audienceVariant && <AudienceBlock audience={draft.audienceVariant} title="Público — conjunto de teste" />}
        <DeliveryBlock delivery={draft.delivery} />
      </div>

      {draft.creatives.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold text-ink-muted">Criativos recomendados ({periodLabel})</div>
          <div className="space-y-2">
            {draft.creatives.map((c) => (
              <div key={c.adId} className="flex items-start gap-3 rounded-lg border border-border p-3">
                {c.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.thumbnailUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded bg-page" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink">{c.name}</div>
                  {(c.title || c.body) && (
                    <div className="mt-0.5 text-xs text-ink-secondary">
                      {c.title && <div className="font-medium">{c.title}</div>}
                      {c.body && <div className="whitespace-pre-line">{c.body}</div>}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-ink-muted tabular">
                    CPA {formatMoney(c.cpa, currency)} · CTR {formatPercent(c.ctr)} · ROAS {formatRoas(c.roas)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-4 rounded-lg bg-page px-3 py-2 text-xs text-ink-muted">
        <strong>Estrutura: </strong>
        {draft.implementationNote}
      </p>
    </div>
  );
}
