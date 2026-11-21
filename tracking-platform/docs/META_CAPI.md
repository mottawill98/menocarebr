# Meta Conversions API

## Por que `action_source: "chat"` (e não `business_messaging`)

Os números de WhatsApp deste projeto **não** estão no WhatsApp Business
Platform: não há `ctwa_clid`, não há webhook oficial da Meta associado às
conversas, e o CRM não é o WhatsApp Cloud API.

Consultando a documentação atual da Conversions API
(`developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event`,
consultado em 2026-09-17), `action_source` aceita:

| valor | descrição (Meta) |
|---|---|
| `email` | conversão via e-mail |
| `website` | conversão feita no seu site |
| `app` | conversão feita em app mobile |
| `phone_call` | conversão por telefone |
| **`chat`** | **conversão feita através de apps de mensagem, SMS, ou mensagens online** |
| `physical_store` | conversão presencial |
| `system_generated` | conversão automática (ex.: renovação de assinatura) |
| `business_messaging` | conversão de anúncios "click to Messenger/Instagram/WhatsApp" |
| `other` | conversão de forma não listada |

`business_messaging` é explicitamente para o fluxo oficial de anúncios
"click to message" **dentro** do ecossistema WhatsApp Business Platform, e
exige `ctwa_clid` — o que este projeto não tem e foi proibido de simular.
`chat` é o valor correto para o nosso caso: uma venda fechada numa conversa
de WhatsApp comum, atribuída via `click_ref` próprio. Ver
`packages/shared/src/constants.ts` (`META_ACTION_SOURCE`).

**Se você reler este documento no futuro e a Meta tiver mudado essa
definição**, ajuste `META_ACTION_SOURCE` num único lugar
(`packages/shared/src/constants.ts`) — é usado por todo o resto do sistema
a partir dali.

## Endpoint e versão

```
POST https://graph.facebook.com/{GRAPH_VERSION}/{DATASET_ID}/events
```

`GRAPH_VERSION` vem de `META_GRAPH_VERSION` (default `v21.0` neste projeto —
**confirme a versão suportada atual antes de ir para produção**; a Meta
aposenta versões antigas periodicamente). `DATASET_ID` é o dataset de
Conversions API criado no Events Manager (`META_DATASET_ID`). Nunca
hardcode a versão em nenhum outro arquivo — toda chamada passa por
`packages/shared/src/meta-capi/client.ts`.

## Estrutura do evento (Purchase)

```json
{
  "data": [
    {
      "event_name": "Purchase",
      "event_time": 1758000000,
      "event_id": "purchase:58472",
      "action_source": "chat",
      "user_data": {
        "ph": "sha256(...)",
        "external_id": "sha256(...)",
        "fbc": "fb.1.171...",
        "fbp": "fb.1.171...",
        "client_ip_address": "203.0.113.1",
        "client_user_agent": "Mozilla/5.0 ..."
      },
      "custom_data": { "currency": "BRL", "value": 390.0 }
    }
  ],
  "test_event_code": "TEST12345"
}
```

`access_token` é adicionado ao corpo apenas no momento do envio
(`sendMetaEvent`) — nunca é persistido em `meta_events.payload_sanitized`
nem aparece em nenhum log.

## Hash de `user_data`

Conforme
`developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters`
(consultado em 2026-09-17):

- **Hasheados com SHA-256** (hex minúsculo): `ph`, `em`, `fn`, `ln`, `db`,
  `ge`, `ct`, `st`, `zp`, `country`, `external_id` (recomendado).
- **Nunca hasheados**: `client_ip_address`, `client_user_agent`, `fbc`,
  `fbp`, `subscription_id`, `fb_login_id`, `lead_id`, `anon_id`, `madid`,
  `page_id`, `page_scoped_user_id`, `ctwa_clid`.
- `ph` precisa ser normalizado antes do hash: apenas dígitos, com código do
  país, sem zeros à esquerda — exatamente a normalização usada em todo o
  resto do sistema para gerar o `phone_hash` interno (mesma função,
  `normalizePhone`, usada nos dois lugares — garante que o telefone
  hasheado enviado à Meta é *o mesmo* valor usado para atribuição interna).

Nunca aplicamos hash duas vezes: as funções em
`packages/shared/src/meta-capi/hash.ts` recebem sempre o valor **ainda não
hasheado**.

## `fbc`/`fbp`

Como o redirect não carrega o Pixel do Facebook no browser (item 60 do
briefing — reduzir fricção, o Purchase principal é 100% server-side), não
há `_fbp` real na maioria dos casos (só existe se o usuário visitou alguma
outra página com o Pixel antes). `fbc` é reconstruído a partir do `fbclid`
da URL do clique, no formato documentado pela Meta há vários anos para
reconstrução server-side: `fb.<subdomainIndex>.<creationTime>.<fbclid>`
(ver `packages/shared/src/fbclid.ts`). Se um `_fbc`/`_fbp` legítimo do
browser existir (cookie), ele tem prioridade — nunca inventamos um valor
por cima de um real.

## `event_id` e deduplicação

`event_id = "purchase:" + crm_order_id` — estável, determinístico,
idempotente. Ver `docs/ARCHITECTURE.md#idempotência-da-meta-capi-itens-21-24`
para os detalhes de como isso é garantido no banco (constraint `UNIQUE`).

## `test_event_code`

Configurável (`META_TEST_EVENT_CODE`). Quando definido, todo evento —
inclusive os reais — inclui `test_event_code` no payload, então a Meta trata
como evento de teste (visível em Events Manager → Test Events, não conta
como conversão real). O botão "Enviar evento de teste" no dashboard
(Meta CAPI) manda um evento avulso (`value: 1`, sem `user_data`) só para
confirmar que a conexão está funcionando.

**Importante:** deixe `META_TEST_EVENT_CODE` **vazio em produção** — do
contrário, todo Purchase real também vai ser marcado como teste e não vai
contar para otimização de campanha.

## Retry e dead-letter

Ver `docs/ARCHITECTURE.md#idempotência-da-meta-capi-itens-21-24`. Resumo:
429/5xx/erro de rede → retentável (backoff exponencial, até 8 tentativas);
4xx (exceto 429) → erro permanente, vai direto para `dead_letter`. Reenvio
manual disponível na página Meta CAPI do dashboard (ADMIN/MANAGER).

## O que não foi validado

Nenhuma chamada real à Meta foi feita nesta sessão (sem
`META_ACCESS_TOKEN`/`META_DATASET_ID` reais). Todo o fluxo foi validado
contra `scripts/mocks/meta-capi-mock.ts`, que simula respostas 200/429/500/400
para exercitar o código de retry. Antes de ir para produção, use o botão
"Enviar evento de teste" do dashboard com credenciais reais e confirme no
Events Manager.
