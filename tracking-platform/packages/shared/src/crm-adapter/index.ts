import type { NormalizedCrmMessage, NormalizedCrmOrder } from "../schemas/crm.js";
import { normalizeGenericCrmMessage, normalizeGenericCrmOrder } from "./generic.js";
import { normalizeDataCrazyMessage, normalizeDataCrazyOrder } from "./datacrazy.js";

export type CrmAdapterName = "generic" | "datacrazy";

export function normalizeCRMMessage(raw: unknown, adapter: CrmAdapterName = "datacrazy"): NormalizedCrmMessage {
  switch (adapter) {
    case "datacrazy":
      return normalizeDataCrazyMessage(raw);
    default:
      return normalizeGenericCrmMessage(raw);
  }
}

export function normalizeCRMOrder(raw: unknown, adapter: CrmAdapterName = "datacrazy"): NormalizedCrmOrder {
  switch (adapter) {
    case "datacrazy":
      return normalizeDataCrazyOrder(raw);
    default:
      return normalizeGenericCrmOrder(raw);
  }
}

export * from "./generic.js";
export * from "./datacrazy.js";
