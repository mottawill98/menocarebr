import { randomBytes } from "node:crypto";
import { getJson, setJson, nextRotationIndex as dbNextRotationIndex } from "@/lib/db";

const NUMBERS_KEY = "redirect:numbers";
const CONFIG_KEY = "redirect:config";
const ROTATION_ID = "main";

export interface WhatsappNumber {
  id: string;
  label: string;
  /** Somente dígitos, com código do país (formato exigido pelo wa.me). */
  phone: string;
  message: string;
  active: boolean;
  createdAt: string;
}

export interface RedirectConfig {
  pixelId: string;
  pixelToken: string;
  eventName: string;
  testEventCode: string;
  /** Usada no link de rodízio (`/r`) quando o número não tem mensagem própria. */
  defaultMessage: string;
}

const DEFAULT_CONFIG: RedirectConfig = {
  pixelId: "",
  pixelToken: "",
  eventName: "Contact",
  testEventCode: "",
  defaultMessage: "",
};

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export async function listNumbers(): Promise<WhatsappNumber[]> {
  return (await getJson<WhatsappNumber[]>(NUMBERS_KEY)) ?? [];
}

export async function getActiveNumbers(): Promise<WhatsappNumber[]> {
  return (await listNumbers()).filter((n) => n.active);
}

export async function getNumber(id: string): Promise<WhatsappNumber | null> {
  return (await listNumbers()).find((n) => n.id === id) ?? null;
}

export async function createNumber(input: {
  label?: string;
  phone: string;
  message?: string;
}): Promise<WhatsappNumber> {
  const numbers = await listNumbers();
  const number: WhatsappNumber = {
    id: randomBytes(6).toString("base64url"),
    label: input.label?.trim() ?? "",
    phone: normalizePhone(input.phone),
    message: input.message?.trim() ?? "",
    active: true,
    createdAt: new Date().toISOString(),
  };
  numbers.push(number);
  await setJson(NUMBERS_KEY, numbers);
  return number;
}

export async function updateNumber(
  id: string,
  patch: Partial<Pick<WhatsappNumber, "label" | "phone" | "message" | "active">>
): Promise<WhatsappNumber | null> {
  const numbers = await listNumbers();
  const idx = numbers.findIndex((n) => n.id === id);
  if (idx === -1) return null;

  const current = numbers[idx];
  const updated: WhatsappNumber = {
    ...current,
    ...patch,
    label: patch.label !== undefined ? patch.label.trim() : current.label,
    phone: patch.phone !== undefined ? normalizePhone(patch.phone) : current.phone,
  };
  numbers[idx] = updated;
  await setJson(NUMBERS_KEY, numbers);
  return updated;
}

export async function deleteNumber(id: string): Promise<boolean> {
  const numbers = await listNumbers();
  const next = numbers.filter((n) => n.id !== id);
  if (next.length === numbers.length) return false;
  await setJson(NUMBERS_KEY, next);
  return true;
}

export async function getConfig(): Promise<RedirectConfig> {
  return { ...DEFAULT_CONFIG, ...((await getJson<Partial<RedirectConfig>>(CONFIG_KEY)) ?? {}) };
}

/** Retorna a config com o token mascarado, para exibir na dashboard sem vazar o valor real. */
export async function getConfigMasked(): Promise<RedirectConfig & { hasToken: boolean }> {
  const config = await getConfig();
  return { ...config, pixelToken: config.pixelToken ? "•".repeat(12) : "", hasToken: !!config.pixelToken };
}

export async function saveConfig(patch: Partial<RedirectConfig>): Promise<RedirectConfig> {
  const next = { ...(await getConfig()), ...patch };
  await setJson(CONFIG_KEY, next);
  return next;
}

/**
 * Escolhe o próximo número ativo em rodízio (round-robin), pra distribuir os
 * cliques entre todos os atendentes em vez de sobrecarregar um único número.
 * Retorna `null` se não houver nenhum número ativo.
 */
export async function pickNextActiveNumber(): Promise<WhatsappNumber | null> {
  const active = await getActiveNumbers();
  if (!active.length) return null;
  const idx = await dbNextRotationIndex(ROTATION_ID, active.length);
  return active[idx];
}
