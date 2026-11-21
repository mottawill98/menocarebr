import type { NormalizedCrmMessage, NormalizedCrmOrder } from "../schemas/crm.js";
import { normalizeGenericCrmMessage, normalizeGenericCrmOrder, sanitizeMetadata } from "./generic.js";
import { extractClickRefFromMessage } from "../click-ref.js";

/**
 * Adapter especifico para o DataCrazy.
 *
 * NAO temos ainda o payload real do webhook de producao do DataCrazy — o
 * prompt do projeto pede explicitamente para comecar com um adapter
 * generico e "depois adaptar exatamente ao webhook da DataCrazy". Este
 * arquivo isola essa adaptacao: por enquanto ele delega para o adapter
 * generico (que ja cobre os nomes de campo mais comuns), mas e o UNICO
 * lugar que deve mudar quando o payload real for confirmado.
 *
 * Quando o payload real chegar, ajuste apenas as duas funcoes abaixo — o
 * resto do sistema (endpoints, fila, banco) nao precisa saber que o CRM e o
 * DataCrazy.
 */
export function normalizeDataCrazyMessage(raw: unknown): NormalizedCrmMessage {
  return normalizeGenericCrmMessage(raw);
}

export function normalizeDataCrazyOrder(raw: unknown): NormalizedCrmOrder {
  return normalizeGenericCrmOrder(raw);
}

export { extractClickRefFromMessage, sanitizeMetadata };
