export interface ActionEntry {
  action_type: string;
  value: string;
}

/**
 * Categorias de conversão que sabemos mapear para os action_types reais
 * retornados pela Graph API. A ordem de cada lista é uma prioridade:
 * usamos o primeiro action_type presente para evitar contar o mesmo
 * evento duas vezes quando a Meta reporta o mesmo resultado por mais
 * de uma via de atribuição (ex.: "purchase" e "omni_purchase").
 */
export const CONVERSION_CATEGORIES: Record<string, { label: string; actionTypes: string[] }> = {
  // Restrito, por decisão do cliente, a "compras na Meta" (checkout nativo/in-app,
  // dentro do ecossistema Meta) — exclui de propósito compras no site externo do
  // anunciante (offsite_conversion.fb_pixel_purchase) e o agregado omni_purchase.
  purchase: {
    label: "Compra (na Meta)",
    actionTypes: ["onsite_conversion.purchase", "onsite_app_purchase"],
  },
  lead: {
    label: "Lead",
    actionTypes: [
      "omni_lead",
      "lead",
      "offsite_conversion.fb_pixel_lead",
      "onsite_conversion.lead_grouped",
      "onsite_conversion.lead",
    ],
  },
  messaging_conversation: {
    label: "Conversa iniciada (Messaging)",
    actionTypes: [
      "onsite_conversion.total_messaging_connection",
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.messaging_first_reply",
    ],
  },
  landing_page_view: {
    label: "Visualização da página de destino",
    actionTypes: ["omni_landing_page_view", "landing_page_view"],
  },
  initiate_checkout: {
    label: "Checkout iniciado",
    actionTypes: [
      "omni_initiated_checkout",
      "initiate_checkout",
      "offsite_conversion.fb_pixel_initiate_checkout",
      "onsite_conversion.initiate_checkout",
      "onsite_web_initiate_checkout",
    ],
  },
  add_to_cart: {
    label: "Adição ao carrinho",
    actionTypes: [
      "omni_add_to_cart",
      "add_to_cart",
      "offsite_conversion.fb_pixel_add_to_cart",
      "onsite_web_add_to_cart",
    ],
  },
  link_click: {
    label: "Clique no link",
    actionTypes: ["link_click"],
  },
};

export type ConversionCategoryKey = keyof typeof CONVERSION_CATEGORIES;

/**
 * Nesta conta, o evento `omni_purchase` (confirmado pelo cliente) é reportado
 * via Conversions API/servidor com o valor monetário em centavos em vez da
 * unidade da moeda (ex.: R$100,00 enviado como "10000"), inflando o valor de
 * conversão e o ROAS em ~100x. O pixel do navegador
 * (`offsite_conversion.fb_pixel_purchase`) já envia o valor correto.
 *
 * `onsite_conversion.purchase`/`onsite_app_purchase` (agora os únicos usados
 * para "compra na Meta", por decisão do cliente) também foram incluídos aqui
 * por INFERÊNCIA — não confirmado explicitamente pelo cliente — porque o
 * valor bruto implicava um ticket médio de ~R$45.700 (114.420.300 / 2.501
 * compras), incompatível com qualquer varejo real; dividido por 100 o ticket
 * médio cai para ~R$457,50, plausível para e-commerce. Se isso estiver
 * errado, avise para remover esses dois action_types deste conjunto.
 */
const VALUE_IN_CENTS_ACTION_TYPES = new Set<string>([
  "omni_purchase",
  "onsite_conversion.purchase",
  "onsite_app_purchase",
]);
const CENTS_TO_CURRENCY_DIVISOR = 100;

export function correctMonetaryValueForActionType(actionType: string, value: number): number {
  return VALUE_IN_CENTS_ACTION_TYPES.has(actionType) ? value / CENTS_TO_CURRENCY_DIVISOR : value;
}

function toNumber(value: string | number | undefined): number {
  if (value === undefined) return 0;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Encontra, em ordem de prioridade, o primeiro action_type presente no array. */
function findFirst(entries: ActionEntry[] | undefined, actionTypes: string[]): ActionEntry | null {
  if (!entries?.length) return null;
  for (const type of actionTypes) {
    const found = entries.find((e) => e.action_type === type);
    if (found) return found;
  }
  return null;
}

export interface CategoryResult {
  key: ConversionCategoryKey;
  label: string;
  actionType: string | null;
  count: number | null;
  value: number | null;
  costPer: number | null;
}

/**
 * Extrai, para cada categoria de conversão conhecida, a contagem (actions),
 * o valor monetário (action_values) e o custo por ação — sempre lendo
 * diretamente os arrays retornados pela API. Quando a Meta não reporta
 * `cost_per_action_type` para o action_type escolhido (ex.: acontece com
 * `onsite_conversion.purchase`/`onsite_app_purchase`, que não fazem parte do
 * conjunto "padrão" que a API calcula automaticamente), calculamos
 * gasto/contagem — a mesma fórmula que a própria Meta usa para os action_types
 * que ela cobre; não é uma estimativa, é aritmética direta sobre números reais.
 * Retorna null quando o evento não existe para a entidade.
 */
export function extractConversionCategories(
  actions: ActionEntry[] | undefined,
  actionValues: ActionEntry[] | undefined,
  costPerActionType: ActionEntry[] | undefined,
  spend?: number
): CategoryResult[] {
  return Object.entries(CONVERSION_CATEGORIES).map(([key, def]) => {
    const match = findFirst(actions, def.actionTypes);
    if (!match) {
      return { key: key as ConversionCategoryKey, label: def.label, actionType: null, count: null, value: null, costPer: null };
    }
    const valueMatch = findFirst(actionValues, [match.action_type]);
    const costMatch = findFirst(costPerActionType, [match.action_type]);
    const count = toNumber(match.value);
    const costPer = costMatch ? toNumber(costMatch.value) : spend !== undefined && count > 0 ? spend / count : null;
    return {
      key: key as ConversionCategoryKey,
      label: def.label,
      actionType: match.action_type,
      count,
      value: valueMatch ? correctMonetaryValueForActionType(match.action_type, toNumber(valueMatch.value)) : null,
      costPer,
    };
  });
}

export { toNumber };
