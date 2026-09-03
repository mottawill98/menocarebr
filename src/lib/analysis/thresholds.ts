/**
 * Limiares usados pelo motor de análise. Centralizados aqui para que toda
 * recomendação/alerta cite exatamente o número usado na regra — nada é
 * "mágico" nem embutido no meio da lógica.
 */
export const THRESHOLDS = {
  // Amostra mínima para confiar em uma classificação de ESCALAR/PAUSAR.
  MIN_SPEND_FOR_CONFIDENT_CALL: 100, // moeda da conta (ex.: BRL)
  MIN_CONVERSIONS_FOR_CONFIDENT_CALL: 3,

  // Comparação vs. mediana/média da conta (janela igual, mesma categoria de conversão).
  CPA_MUCH_BETTER_PCT: -20, // CPA >=20% abaixo da mediana da conta
  CPA_MUCH_WORSE_PCT: 30, // CPA >=30% acima da mediana da conta
  CPA_MILD_WORSE_PCT: 15,
  CTR_BETTER_PCT: 10, // CTR >=10% acima da média da conta
  CTR_WORSE_PCT: -20,

  // Comparação período recente (d7) vs período anterior (7 dias antes).
  CPA_TREND_WORSE_PCT: 25,
  CTR_TREND_WORSE_PCT: -20,
  CPM_TREND_WORSE_PCT: 25,
  ROAS_TREND_WORSE_PCT: -30,

  // Sinais absolutos.
  FREQUENCY_HIGH: 4, // fadiga de criativo comum acima disso
  ROAS_GOOD: 2,
  ROAS_GREAT: 3,
  SPEND_NO_CONVERSION_ALERT: 150, // gasto (d7) sem nenhuma conversão relevante

  // Nº de campanhas mínimo na conta para calcular média/mediana com sentido.
  MIN_CAMPAIGNS_FOR_BASELINE: 3,
} as const;

export const PRIMARY_RESULT_PRIORITY = [
  "purchase",
  "lead",
  "messaging_conversation",
  "initiate_checkout",
  "add_to_cart",
] as const;
