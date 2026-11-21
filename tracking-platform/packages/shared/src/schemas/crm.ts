import { z } from "zod";

/**
 * Payload interno normalizado que qualquer adapter de CRM (DataCrazy ou
 * outro) precisa produzir a partir do webhook de mensagem recebida.
 */
export const normalizedCrmMessageSchema = z.object({
  phone_raw: z.string().min(4).max(32),
  message: z.string().max(4096).nullable().optional(),
  crm_conversation_id: z.string().max(255).nullable().optional(),
  received_at: z.string().datetime().optional(),
});

export type NormalizedCrmMessage = z.infer<typeof normalizedCrmMessageSchema>;

/** Payload generico aceito no endpoint (schema propositalmente permissivo; a
 * normalizacao especifica de cada CRM acontece no adapter). */
export const genericCrmMessagePayloadSchema = z
  .object({
    phone: z.string().optional(),
    telephone: z.string().optional(),
    from: z.string().optional(),
    contact: z.string().optional(),
    message: z.string().optional(),
    text: z.string().optional(),
    body: z.string().optional(),
    conversation_id: z.string().optional(),
    chat_id: z.string().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export type GenericCrmMessagePayload = z.infer<typeof genericCrmMessagePayloadSchema>;

/**
 * Payload interno normalizado que qualquer adapter de CRM precisa produzir a
 * partir do webhook de pedido/venda.
 */
export const normalizedCrmOrderSchema = z.object({
  crm_order_id: z.string().min(1).max(255),
  phone_raw: z.string().min(4).max(32).nullable().optional(),
  customer_id: z.string().max(255).nullable().optional(),
  status: z.string().min(1).max(64),
  value: z.number().nonnegative(),
  currency: z.string().length(3).default("BRL"),
  ordered_at: z.string().datetime().nullable().optional(),
  paid_at: z.string().datetime().nullable().optional(),
  seller: z.string().max(255).nullable().optional(),
  click_ref: z.string().length(8).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type NormalizedCrmOrder = z.infer<typeof normalizedCrmOrderSchema>;

export const genericCrmOrderPayloadSchema = z
  .object({
    order_id: z.string().optional(),
    id: z.union([z.string(), z.number()]).optional(),
    phone: z.string().optional(),
    telephone: z.string().optional(),
    customer_id: z.union([z.string(), z.number()]).optional(),
    customer_phone: z.string().optional(),
    status: z.string().optional(),
    value: z.union([z.string(), z.number()]).optional(),
    total: z.union([z.string(), z.number()]).optional(),
    amount: z.union([z.string(), z.number()]).optional(),
    currency: z.string().optional(),
    created_at: z.string().optional(),
    ordered_at: z.string().optional(),
    paid_at: z.string().optional(),
    seller: z.string().optional(),
    click_ref: z.string().optional(),
    tracking_ref: z.string().optional(),
  })
  .passthrough();

export type GenericCrmOrderPayload = z.infer<typeof genericCrmOrderPayloadSchema>;
