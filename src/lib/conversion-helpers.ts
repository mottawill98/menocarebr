import type { NormalizedMetrics } from "./meta/metrics";
import type { ConversionCategoryKey, CategoryResult } from "./meta/actions";

export function getCategory(metrics: NormalizedMetrics, key: ConversionCategoryKey): CategoryResult | undefined {
  return metrics.conversions.find((c) => c.key === key);
}

export function getCategoryFromList(
  conversions: CategoryResult[],
  key: ConversionCategoryKey
): CategoryResult | undefined {
  return conversions.find((c) => c.key === key);
}
