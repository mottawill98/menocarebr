import fs from "node:fs";
import path from "node:path";
import { getOverview, getCampaigns, getAdSets, getAds, getAccountInfo, getSyncMeta } from "../data";
import { pickPrimaryCategory } from "./recommendation";
import { mergeDailyRows } from "../meta/metrics";
import { getCategoryFromList } from "../conversion-helpers";
import { buildCampaignDiagnostic, buildExecutiveSummary, rankTopActions, type CampaignAnalysis } from "./narrative";
import { PERIOD_LABELS } from "../periods";
import type { AccountAlert } from "../alerts";

function money(v: number | null, currency: string): string {
  if (v === null || !Number.isFinite(v)) return "N/A";
  return v.toLocaleString("pt-BR", { style: "currency", currency });
}
function pct(v: number | null, decimals = 2): string {
  if (v === null || !Number.isFinite(v)) return "N/A";
  return `${v.toFixed(decimals)}%`;
}
function num(v: number | null, decimals = 0): string {
  if (v === null || !Number.isFinite(v)) return "N/A";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function roas(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "N/A";
  return `${v.toFixed(2)}x`;
}

/** As recomendações/alertas do relatório usam a janela de 7 dias como referência para "desempenho recente". */
const REPORT_PERIOD = "d7" as const;

export async function generateReportMarkdown(): Promise<string> {
  const account = await getAccountInfo();
  const currency = account.currency;
  const [overview, campaigns, adsets, ads, syncMeta] = await Promise.all([
    getOverview(),
    getCampaigns(),
    getAdSets(),
    getAds(),
    getSyncMeta(),
  ]);

  if (!overview) {
    return `# Relatório de Análise — Meta Ads\n\nNenhum dado sincronizado para a conta ${account.id}. Rode a sincronização antes de gerar o relatório.\n`;
  }

  const max = overview.windows.max;
  const d30 = overview.windows.d30;
  const d7 = overview.windows.d7;
  const periodLabel = PERIOD_LABELS[REPORT_PERIOD];

  const analysisItems: CampaignAnalysis[] = campaigns.map((c) => {
    const rec = c.recommendations[REPORT_PERIOD];
    return { id: c.id, name: c.name, rec, diagnostic: buildCampaignDiagnostic(c.id, c.name, rec, periodLabel, currency) };
  });
  const executiveSummary = buildExecutiveSummary(analysisItems, periodLabel, currency);
  const topActions = rankTopActions(analysisItems, 5);

  // Tendência: últimos 7 dias vs. 7 dias imediatamente anteriores, a partir da série diária da conta.
  const dailySorted = [...overview.timeseries].sort((a, b) => a.date.localeCompare(b.date));
  const last7 = dailySorted.slice(-7);
  const prev7 = dailySorted.slice(-14, -7);
  const last7Merged = mergeDailyRows(
    last7.map((p) => ({
      spend: String(p.spend),
      impressions: String(p.impressions),
      clicks: String(p.clicks),
      reach: String(p.reach),
      actions: p.conversions.map((c) => ({ action_type: c.actionType ?? c.key, value: String(c.count ?? 0) })),
      action_values: p.conversions.map((c) => ({ action_type: c.actionType ?? c.key, value: String(c.value ?? 0) })),
    }))
  );
  const prev7Merged = mergeDailyRows(
    prev7.map((p) => ({
      spend: String(p.spend),
      impressions: String(p.impressions),
      clicks: String(p.clicks),
      reach: String(p.reach),
      actions: p.conversions.map((c) => ({ action_type: c.actionType ?? c.key, value: String(c.count ?? 0) })),
      action_values: p.conversions.map((c) => ({ action_type: c.actionType ?? c.key, value: String(c.value ?? 0) })),
    }))
  );
  const spendTrendPct = prev7Merged.spend > 0 ? ((last7Merged.spend - prev7Merged.spend) / prev7Merged.spend) * 100 : null;
  const ctrTrendPct =
    prev7Merged.ctr !== null && prev7Merged.ctr > 0 && last7Merged.ctr !== null
      ? ((last7Merged.ctr - prev7Merged.ctr) / prev7Merged.ctr) * 100
      : null;

  const sortedByAction = (action: string) => campaigns.filter((c) => c.recommendations[REPORT_PERIOD].action === action);
  const escalar = sortedByAction("ESCALAR");
  const pausarReduzir = [...sortedByAction("PAUSAR"), ...sortedByAction("REDUZIR")];

  const adsetsRanked = adsets
    .map((a) => ({ a, primary: pickPrimaryCategory(a.windows.d30), metrics: a.windows.d30 }))
    .filter((x) => x.metrics.spend > 0 && x.primary && (x.primary.count ?? 0) > 0)
    .sort((x, y) => (x.primary!.costPer ?? Infinity) - (y.primary!.costPer ?? Infinity));

  const adsRanked = ads
    .map((a) => ({ a, primary: pickPrimaryCategory(a.windows.d30), metrics: a.windows.d30 }))
    .filter((x) => x.metrics.spend > 0 && x.primary && (x.primary.count ?? 0) > 0)
    .sort((x, y) => (x.primary!.costPer ?? Infinity) - (y.primary!.costPer ?? Infinity));

  const recCounts: Record<string, number> = {};
  const allAlerts: AccountAlert[] = [];
  for (const c of campaigns) {
    const rec = c.recommendations[REPORT_PERIOD];
    recCounts[rec.action] = (recCounts[rec.action] ?? 0) + 1;
    for (const alert of rec.alerts) {
      allAlerts.push({ ...alert, campaignId: c.id, campaignName: c.name });
    }
  }

  const droppedFieldsFlat = Object.entries(overview.droppedFields).flatMap(([level, fields]) =>
    fields.length ? [`${level}: ${fields.join(", ")}`] : []
  );

  const lines: string[] = [];
  lines.push(`# Relatório de Análise — Meta Ads`);
  lines.push("");
  lines.push(`Conta: **${account.name}** (ID ${account.numericId})`);
  lines.push(`Gerado em: ${new Date().toLocaleString("pt-BR")}`);
  lines.push(`Referência de "desempenho recente": últimos 7 dias, salvo indicação em contrário.`);
  lines.push("");

  lines.push(`## Resumo executivo`);
  lines.push("");
  lines.push(
    `Nos últimos 30 dias a conta investiu ${money(d30.spend, currency)}, gerando ${num(
      getCategoryFromList(d30.conversions, "purchase")?.count ?? 0
    )} compras (na Meta) com CPA de ${money(pickPrimaryCategory(d30)?.costPer ?? null, currency)} e ROAS de ${roas(d30.purchaseRoas)}.`
  );
  lines.push("");
  lines.push(`**O que está funcionando?** ${executiveSummary.whatsWorking}`);
  lines.push("");
  lines.push(`**O que piorou?** ${executiveSummary.whatWorsened}`);
  lines.push("");
  lines.push(`**O que melhorou?** ${executiveSummary.whatImproved}`);
  lines.push("");
  lines.push(`**Onde estou desperdiçando dinheiro?** ${executiveSummary.whereWastingMoney}`);
  lines.push("");
  lines.push(`**Onde existe oportunidade de escala?** ${executiveSummary.whereToScale}`);
  lines.push("");
  lines.push(`**Qual campanha merece atenção imediata?** ${executiveSummary.urgentCampaign}`);
  lines.push("");
  lines.push(`**Qual é o principal problema da conta hoje?** ${executiveSummary.mainProblem}`);
  lines.push("");

  lines.push(`## Top 5 ações recomendadas`);
  lines.push("");
  if (topActions.length) {
    lines.push(`Ordenadas por impacto financeiro estimado (${periodLabel}):`);
    lines.push("");
    topActions.forEach((a, i) => {
      const impactText = a.impact
        ? a.impact.kind === "volume_incremental"
          ? `~${num(a.impact.value, 0)} conversões adicionais estimadas`
          : `~${money(a.impact.value, currency)} de impacto estimado`
        : "impacto não estimável";
      lines.push(`${i + 1}. **${a.campaignName}** — ${a.action}. ${a.recommendationText} (${impactText})`);
    });
  } else {
    lines.push(`Nenhuma ação de alto impacto identificada neste período.`);
  }
  lines.push("");

  lines.push(`## Diagnóstico por campanha (${periodLabel})`);
  lines.push("");
  for (const { name, diagnostic } of analysisItems) {
    lines.push(`### ${name}`);
    lines.push("");
    lines.push(`- **Ação recomendada**: ${diagnostic.action} (confiança ${diagnostic.confidence})`);
    lines.push(`- **Diagnóstico**: ${diagnostic.diagnosis}`);
    lines.push(`- **Problema identificado**: ${diagnostic.problem ?? "Nenhum problema relevante identificado."}`);
    lines.push(`- **Oportunidade identificada**: ${diagnostic.opportunity ?? "Nenhuma oportunidade clara identificada."}`);
    lines.push(`- **Recomendação**: ${diagnostic.recommendationText}`);
    if (diagnostic.impact) {
      const impactText =
        diagnostic.impact.kind === "volume_incremental"
          ? `~${num(diagnostic.impact.value, 0)} conversões adicionais`
          : money(diagnostic.impact.value, currency);
      lines.push(`- **Impacto estimado**: ${impactText}`);
    }
    lines.push("");
  }

  lines.push(`## Período analisado`);
  lines.push("");
  lines.push(
    `Os KPIs consolidados (próxima seção) e todos os períodos selecionáveis na dashboard — hoje, ontem, 3/7/14/30 dias e máximo — cobrem todo o histórico disponível na conta, de **${overview.historicalRange.since}** a **${overview.historicalRange.until}** — limitado pela própria Meta (tipicamente 37 meses via \`date_preset=maximum\`).`
  );
  lines.push("");
  lines.push(
    `As séries **diárias** usadas nos gráficos de evolução cobrem os últimos ~60 dias, de **${overview.dateRange.since}** a **${overview.dateRange.until}**, para manter a sincronização rápida e confiável em contas com muito histórico e alta fragmentação de eventos de conversão — e ainda assim permitir comparar até 30 dias atuais vs. 30 anteriores.`
  );
  if (syncMeta) {
    lines.push("");
    lines.push(
      `Última sincronização: ${new Date(syncMeta.fetchedAt).toLocaleString("pt-BR")} — ${syncMeta.counts.campaigns} campanhas, ${syncMeta.counts.adsets} conjuntos, ${syncMeta.counts.ads} anúncios, ${syncMeta.counts.insightsCampaignRows} linhas diárias de campanha.`
    );
  }
  lines.push("");

  lines.push(`## Investimento total`);
  lines.push("");
  lines.push(`| Janela | Investimento | Impressões | Alcance | Cliques |`);
  lines.push(`|---|---|---|---|---|`);
  for (const [label, w] of [
    ["7 dias", d7],
    ["30 dias", d30],
    ["Máximo", max],
  ] as const) {
    lines.push(`| ${label} | ${money(w.spend, currency)} | ${num(w.impressions)} | ${num(w.reach)} | ${num(w.clicks)} |`);
  }
  lines.push("");

  lines.push(`## Principais KPIs (últimos 30 dias)`);
  lines.push("");
  lines.push(`| KPI | Valor |`);
  lines.push(`|---|---|`);
  lines.push(`| CTR | ${pct(d30.ctr)} |`);
  lines.push(`| CPC | ${money(d30.cpc, currency)} |`);
  lines.push(`| CPM | ${money(d30.cpm, currency)} |`);
  lines.push(`| Frequência | ${d30.frequency !== null ? num(d30.frequency, 2) : "N/A"} |`);
  lines.push(`| Leads | ${num(getCategoryFromList(d30.conversions, "lead")?.count ?? null)} |`);
  lines.push(`| CPL | ${money(getCategoryFromList(d30.conversions, "lead")?.costPer ?? null, currency)} |`);
  lines.push(`| Compras (na Meta) | ${num(getCategoryFromList(d30.conversions, "purchase")?.count ?? null)} |`);
  lines.push(`| CPA Compra (na Meta) | ${money(getCategoryFromList(d30.conversions, "purchase")?.costPer ?? null, currency)} |`);
  lines.push(`| Custo por conversa (Messaging) | ${money(getCategoryFromList(d30.conversions, "messaging_conversation")?.costPer ?? null, currency)} |`);
  lines.push(`| Custo por checkout iniciado | ${money(getCategoryFromList(d30.conversions, "initiate_checkout")?.costPer ?? null, currency)} |`);
  lines.push(`| Receita atribuída (compras na Meta) | ${money(getCategoryFromList(d30.conversions, "purchase")?.value ?? null, currency)} |`);
  lines.push(`| ROAS | ${roas(d30.purchaseRoas)} |`);
  lines.push("");

  lines.push(`## Melhores campanhas (recomendação ESCALAR, últimos 7 dias)`);
  lines.push("");
  if (escalar.length) {
    lines.push(`| Campanha | Investimento (7d) | CPA | ROAS | Motivo |`);
    lines.push(`|---|---|---|---|---|`);
    for (const c of escalar.slice(0, 10)) {
      const primary = pickPrimaryCategory(c.windows.d7);
      lines.push(
        `| ${c.name} | ${money(c.windows.d7.spend, currency)} | ${money(primary?.costPer ?? null, currency)} | ${roas(c.windows.d7.purchaseRoas)} | ${c.recommendations[REPORT_PERIOD].reasons[0] ?? ""} |`
      );
    }
  } else {
    lines.push(`Nenhuma campanha atingiu, com evidência suficiente, os critérios de ESCALAR no período avaliado.`);
  }
  lines.push("");

  lines.push(`## Piores campanhas (recomendação REDUZIR/PAUSAR, últimos 7 dias)`);
  lines.push("");
  if (pausarReduzir.length) {
    lines.push(`| Campanha | Recomendação | Investimento (7d) | CPA | Motivo |`);
    lines.push(`|---|---|---|---|---|`);
    for (const c of pausarReduzir.slice(0, 10)) {
      const primary = pickPrimaryCategory(c.windows.d7);
      lines.push(
        `| ${c.name} | ${c.recommendations[REPORT_PERIOD].action} | ${money(c.windows.d7.spend, currency)} | ${money(primary?.costPer ?? null, currency)} | ${c.recommendations[REPORT_PERIOD].reasons[0] ?? ""} |`
      );
    }
  } else {
    lines.push(`Nenhuma campanha foi classificada como REDUZIR/PAUSAR no período avaliado.`);
  }
  lines.push("");

  lines.push(`## Melhores conjuntos de anúncios (30 dias, menor CPA)`);
  lines.push("");
  if (adsetsRanked.length) {
    lines.push(`| Conjunto | Campanha | Investimento | CPA | Resultado |`);
    lines.push(`|---|---|---|---|---|`);
    for (const { a, primary, metrics } of adsetsRanked.slice(0, 10)) {
      const campaignName = campaigns.find((c) => c.id === a.campaignId)?.name ?? a.campaignId;
      lines.push(
        `| ${a.name} | ${campaignName} | ${money(metrics.spend, currency)} | ${money(primary?.costPer ?? null, currency)} | ${num(primary?.count ?? null)} ${primary?.label ?? ""} |`
      );
    }
  } else {
    lines.push(`Sem conjuntos com conversões suficientes nos últimos 30 dias.`);
  }
  lines.push("");

  lines.push(`## Melhores anúncios / criativos (30 dias, menor CPA)`);
  lines.push("");
  if (adsRanked.length) {
    lines.push(`| Anúncio | Campanha | Investimento | CPA | Resultado |`);
    lines.push(`|---|---|---|---|---|`);
    for (const { a, primary, metrics } of adsRanked.slice(0, 10)) {
      const campaignName = campaigns.find((c) => c.id === a.campaignId)?.name ?? a.campaignId;
      lines.push(
        `| ${a.name} | ${campaignName} | ${money(metrics.spend, currency)} | ${money(primary?.costPer ?? null, currency)} | ${num(primary?.count ?? null)} ${primary?.label ?? ""} |`
      );
    }
  } else {
    lines.push(`Sem anúncios com conversões suficientes nos últimos 30 dias.`);
  }
  lines.push("");

  lines.push(`## Tendências (últimos 7 dias vs. 7 dias anteriores)`);
  lines.push("");
  lines.push(
    `- Gasto: ${money(last7Merged.spend, currency)} vs. ${money(prev7Merged.spend, currency)} (${
      spendTrendPct !== null ? `${spendTrendPct > 0 ? "+" : ""}${spendTrendPct.toFixed(1)}%` : "N/A"
    }).`
  );
  lines.push(
    `- CTR: ${pct(last7Merged.ctr)} vs. ${pct(prev7Merged.ctr)} (${
      ctrTrendPct !== null ? `${ctrTrendPct > 0 ? "+" : ""}${ctrTrendPct.toFixed(1)}%` : "N/A"
    }).`
  );
  lines.push(`- CPM: ${money(last7Merged.cpm, currency)} vs. ${money(prev7Merged.cpm, currency)}.`);
  lines.push(`- ROAS (compras): ${roas(last7Merged.purchaseRoas)} vs. ${roas(prev7Merged.purchaseRoas)}.`);
  lines.push("");
  lines.push(`_Nota: comparação calculada somando os dados diários já coletados — ver limitações no final do relatório._`);
  lines.push("");

  lines.push(`## Anomalias e alertas (últimos 7 dias)`);
  lines.push("");
  if (allAlerts.length) {
    for (const a of allAlerts.slice(0, 30)) {
      lines.push(`- **[${a.severity.toUpperCase()}]** ${a.campaignName}: ${a.message}`);
    }
  } else {
    lines.push(`Nenhuma anomalia relevante detectada com os limiares atuais.`);
  }
  lines.push("");

  lines.push(`## Distribuição de recomendações`);
  lines.push("");
  lines.push(`Distribuição das recomendações (últimos 7 dias) entre as ${campaigns.length} campanhas analisadas:`);
  lines.push("");
  for (const action of ["ESCALAR", "MANTER", "OBSERVAR", "REDUZIR", "PAUSAR"]) {
    lines.push(`- ${action}: ${recCounts[action] ?? 0} campanha(s)`);
  }
  lines.push("");

  lines.push(`## Limitações dos dados`);
  lines.push("");
  lines.push(
    `- **Histórico limitado pela Meta**: a Graph API restringe o histórico de Insights (tipicamente a ~37 meses), independente do parâmetro \`date_preset=maximum\` solicitado.`
  );
  lines.push(
    `- **Granularidade diária restrita aos últimos ~60 dias**: os KPIs de todos os períodos (hoje/ontem/3/7/14/30 dias/máximo) usam os agregados nativos da própria Meta com o histórico completo da conta, mas os gráficos de evolução dia a dia foram limitados aos últimos ~60 dias por decisão operacional — contas com muito histórico e muitos tipos de evento de conversão fazem a Graph API retornar erro intermitente de forma recorrente ao pedir \`time_increment=1\` desde o início da conta nos níveis de conjunto/anúncio.`
  );
  lines.push(
    `- **Alcance/frequência em janelas comparativas**: essas comparações somam valores diários coletados; a soma de \`reach\` diário **não deduplica usuários entre dias**, então o alcance/frequência agregado ali é uma aproximação. Os KPIs oficiais de cada período usam os agregados nativos da própria Meta (\`date_preset\`), que deduplicam corretamente.`
  );
  lines.push(
    `- **CPA por categoria**: os CPAs são lidos diretamente de \`cost_per_action_type\` quando disponível; quando a Meta não reporta esse campo para o action_type escolhido (acontece com \`onsite_conversion.purchase\`/\`onsite_app_purchase\`), o CPA é calculado como gasto/contagem — a mesma fórmula que a própria Meta usa para os action_types que ela cobre. Nenhum valor foi estimado além dessa aritmética direta.`
  );
  lines.push(
    `- **Amostras pequenas**: campanhas com pouco gasto ou poucas conversões não recebem recomendação de ESCALAR/PAUSAR com alta confiança — ficam em OBSERVAR até acumular amostra suficiente (ver \`src/lib/analysis/thresholds.ts\`).`
  );
  if (droppedFieldsFlat.length) {
    lines.push(`- **Campos indisponíveis nesta conta** (removidos automaticamente da coleta após rejeição da API): ${droppedFieldsFlat.join("; ")}.`);
  } else {
    lines.push(`- **Campos solicitados**: todos os campos pedidos foram aceitos pela API para esta conta.`);
  }
  lines.push(
    `- **Limite de chamadas (rate limit)**: contas com muito histórico podem levar vários minutos para sincronizar devido a limites de requisição da própria Meta; a coleta é feita em blocos de dias com espera automática entre chamadas.`
  );
  lines.push(
    `- **Compras restritas a "na Meta"**: por decisão do cliente, compras/CPA/ROAS consideram apenas \`onsite_conversion.purchase\`/\`onsite_app_purchase\` (checkout nativo/in-app), excluindo propositalmente compras no site externo (pixel/CAPI) e o agregado \`omni_purchase\`.`
  );
  lines.push(
    `- **Correção de valor em centavos**: \`omni_purchase\` (confirmado pelo cliente) e \`onsite_conversion.purchase\`/\`onsite_app_purchase\` (por inferência de ticket médio — ainda não confirmado explicitamente) são reportados à Meta com o valor monetário em centavos, corrigido dividindo por 100. O pixel do navegador (\`offsite_conversion.fb_pixel_purchase\`) já envia o valor correto e não foi alterado.`
  );
  if (d30.purchaseRoas !== null && d30.purchaseRoas > 15) {
    lines.push(
      `- **ROAS ainda elevado após a correção**: mesmo após a correção de centavos, o ROAS de 30 dias está em ${roas(d30.purchaseRoas)}. Se isso ainda parecer alto para o negócio, vale investigar duplicidade de eventos de compra, ou outros valores de conversão incorretos.`
    );
  }
  lines.push(
    `- **Estimativas de impacto financeiro** (resumo executivo, top 5 ações e diagnóstico por campanha): projeções baseadas em premissas simples e explícitas — economia = gasto do período para PAUSAR, ~40% do gasto para REDUZIR; receita incremental para ESCALAR = ~30% de aumento de orçamento × ROAS atual. São estimativas de planejamento, não garantias — resultados reais dependem de saturação de público, sazonalidade e resposta do leilão ao aumento de orçamento.`
  );
  lines.push("");

  return lines.join("\n");
}

export async function writeReport(outPath: string) {
  const md = await generateReportMarkdown();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, md);
  return outPath;
}
