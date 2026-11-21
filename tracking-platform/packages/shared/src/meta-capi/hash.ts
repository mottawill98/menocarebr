import { sha256Hex } from "../phone.js";

/**
 * Hash de campos de `user_data` conforme
 * developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
 * (consultado em 2026-09-17): `ph` deve ser normalizado (apenas digitos, com
 * codigo do pais, sem zeros a esquerda — ja garantido por `normalizePhone`)
 * e entao SHA-256 em hex minusculo antes do envio.
 *
 * IMPORTANTE: nunca aplicar hash duas vezes. Esta funcao assume que
 * `normalizedValue` ainda NAO foi hasheado.
 */
export async function hashUserDataField(normalizedValue: string): Promise<string> {
  return sha256Hex(normalizedValue.trim().toLowerCase());
}

/** Campos que a Meta exige em texto puro — nunca hashear. */
export const NEVER_HASH_FIELDS = new Set([
  "client_ip_address",
  "client_user_agent",
  "fbc",
  "fbp",
  "subscription_id",
  "fb_login_id",
  "lead_id",
  "anon_id",
  "madid",
  "page_id",
  "page_scoped_user_id",
  "ctwa_clid",
]);
