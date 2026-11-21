# Webhooks do CRM

Dois endpoints, expostos pelo Cloudflare Worker (não pelo dashboard):

```
POST https://go.usemenocare.com.br/api/v1/webhooks/crm/message
POST https://go.usemenocare.com.br/api/v1/webhooks/crm/order
```

## Autenticação

Suporta dois esquemas (item 25 do briefing) — o Worker detecta qual usar
pelos headers presentes na própria requisição:

### HMAC SHA-256 (recomendado)

```
X-Webhook-Timestamp: 1758000000
X-Webhook-Signature: <hex hmac-sha256(timestamp + "." + corpo_raw, CRM_WEBHOOK_SECRET)>
```

A assinatura cobre `${timestamp}.${corpo}` — um payload capturado não pode
ser reenviado depois de expirado (tolerância: 5 minutos) nem ter o timestamp
trocado sem invalidar a assinatura.

Exemplo em Node.js:

```js
import crypto from "node:crypto";

const secret = process.env.CRM_WEBHOOK_SECRET;
const body = JSON.stringify({ phone: "5545999999999", message: "oi #A7K3M9Q2" });
const timestamp = Math.floor(Date.now() / 1000).toString();
const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

await fetch("https://go.usemenocare.com.br/api/v1/webhooks/crm/message", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-webhook-timestamp": timestamp,
    "x-webhook-signature": signature,
  },
  body,
});
```

### Bearer token (fallback)

Para CRMs que não suportam HMAC:

```
Authorization: Bearer <CRM_WEBHOOK_SECRET>
```

Menos seguro (não protege contra replay nem contra vazamento de log de
proxy) — use apenas se o CRM realmente não suportar assinatura.

## `POST /api/v1/webhooks/crm/message`

Recebe a primeira mensagem de uma conversa. O adapter genérico (ver
`packages/shared/src/crm-adapter/generic.ts`) aceita os nomes de campo mais
comuns:

```json
{
  "phone": "5545999999999",
  "message": "Olá, gostaria de saber mais sobre o Menocare 💜\n#A7K3M9Q2"
}
```

Campos aceitos como sinônimo de `phone`: `telephone`, `from`, `contact`.
Campos aceitos como sinônimo de `message`: `text`, `body`.

**Resposta (200):**
```json
{ "ok": true, "result": "bound", "request_id": "..." }
```
`result` pode ser `"bound"` (clique encontrado e lead vinculado),
`"pending"` (clique ainda não persistido — reconciliado depois
automaticamente) ou `"no_click_ref"` (mensagem sem `#click_ref`
reconhecível — cliente apagou o código, nenhuma atribuição é inventada).

## `POST /api/v1/webhooks/crm/order`

```json
{
  "order_id": "58472",
  "phone": "5545999999999",
  "status": "paid",
  "value": 390.00,
  "currency": "BRL",
  "click_ref": "A7K3M9Q2",
  "seller": "loja-oficial",
  "paid_at": "2026-09-17T14:00:00Z"
}
```

Campos aceitos como sinônimo: `id` (número) por `order_id`; `telephone`/
`customer_phone` por `phone`; `total`/`amount` por `value`; `tracking_ref`
por `click_ref`. `click_ref` é opcional — se ausente, a atribuição cai para
`phone_hash` dentro da janela configurada (Configurações → janela de
atribuição), e se nada for encontrado o pedido fica `unmatched` (nunca
inventamos campanha).

**Resposta (200):**
```json
{ "ok": true, "attribution_method": "click_ref", "meta_event_queued": true, "request_id": "..." }
```

### Mapeamento de status → evento Meta

Configurável em Configurações → "Mapeamento de status do CRM → evento
Meta". Default:

| status do CRM | evento Meta |
|---|---|
| `created`, `pending` | nenhum |
| `approved`, `paid` | `Purchase` |
| `cancelled`, `refunded`, `chargeback` | nenhum |

### Idempotência

Reenviar o **mesmo** `order_id` (ex.: o CRM manda o webhook de novo por
retry de rede, ou o status muda de `approved` para `paid` — ambos mapeados
para `Purchase`) nunca gera um segundo evento na Meta: `meta_events.event_id
= purchase:<order_id>` tem `UNIQUE` no banco. A segunda tentativa de
inserção é silenciosamente ignorada.

## Erros

| HTTP | Quando |
|---|---|
| 400 | corpo não é JSON válido |
| 401 | assinatura ausente/inválida, timestamp expirado, ou Bearer incorreto |
| 413 | corpo maior que 256KB |
| 422 | payload não normalizável (ex.: pedido sem `order_id`/`id`) |
| 429 | rate limit excedido (120 requisições/minuto por endpoint) |

Todo request (sucesso ou erro) é registrado em `webhook_logs` (visível em
Admin → Webhooks), com o payload sempre sanitizado — nunca grava
`token`/`authorization`/`secret`.

## Adaptação para o payload real da DataCrazy

Ainda não temos o payload real de produção do webhook da DataCrazy. O
adapter genérico acima cobre os nomes de campo mais comuns e deve funcionar
como está para a maioria dos CRMs de WhatsApp. Quando o payload real for
confirmado, ajuste **apenas** `packages/shared/src/crm-adapter/datacrazy.ts`
— é o único arquivo que precisa saber que o CRM é a DataCrazy; o resto do
sistema (endpoints, fila, banco) não muda.
