# Segurança

## RBAC (papéis)

Três papéis, guardados em `profiles.role`: `ADMIN`, `MANAGER`, `VIEWER`.

| Recurso | ADMIN | MANAGER | VIEWER |
|---|---|---|---|
| Dashboard, funil, campanhas, cliques, leads, pedidos, Meta CAPI (leitura) | ✅ | ✅ | ✅ |
| Rotas, números (criar/editar/ativar) | ✅ | ✅ | leitura |
| Meta CAPI (reenviar, evento de teste) | ✅ | ✅ | leitura |
| Usuários, Configurações, Webhook logs, Auditoria | ✅ | ❌ | ❌ |
| Simulador | ✅ (nunca em produção) | ❌ | ❌ |

## Duas camadas de enforcement — nunca só uma

1. **RLS (Postgres)** — toda leitura do dashboard usa o client autenticado
   com a sessão do usuário (`createSupabaseServerClient`), então as
   policies de `supabase/migrations` decidem o que cada `role` pode ver.
   Função auxiliar `public.current_profile_role()` (SECURITY DEFINER) é
   usada nas policies para evitar recursão de RLS.
2. **Checagem de role no código** — toda escrita passa por uma Server
   Action que chama `assertRole([...])` **antes** de tocar no banco. Só
   depois disso ela usa o client com a service role key.

O ponto central: tabelas operacionais (`clicks`, `lead_bindings`,
`pending_lead_bindings`, `orders`, `meta_events`) **não têm nenhuma policy
de INSERT/UPDATE/DELETE para `authenticated`** — só a service role (Worker,
Server Actions) pode escrever nelas. Isso significa que mesmo um ADMIN
logado no dashboard, usando as ferramentas de desenvolvedor do browser para
chamar o Supabase diretamente, não consegue fabricar ou editar um clique,
lead ou pedido — a única forma de mutação é pelas Server Actions, que
sempre re-checam o role no código antes de usar a service role key.

## Segredos

| Segredo | Onde vive | Nunca aparece em |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Server Actions/Route Handlers do dashboard (env var privada), Worker | Frontend, logs, `NEXT_PUBLIC_*` |
| `META_ACCESS_TOKEN` | Worker (secret do Wrangler) | Frontend (dashboard só mostra "configurado: SIM/NÃO"), `meta_events.payload_sanitized`, logs |
| `CRM_WEBHOOK_SECRET` | Worker (secret) + CRM | Logs, `webhook_logs.payload_sanitized` |
| `WORKER_INTERNAL_API_TOKEN` | Worker (secret) + Dashboard (env privada) | Frontend |

O dashboard nunca mostra um segredo completo — a página Configurações
mostra apenas booleanos ("Meta configurada: SIM/NÃO", "Dataset configurado",
"Modo teste").

## Webhooks

HMAC SHA-256 com timestamp (proteção contra replay, tolerância 5 min) como
padrão, com fallback `Authorization: Bearer`. Rate limit básico (120
req/min por endpoint) via contador no KV. Corpo limitado a 256KB. Todo
payload é sanitizado antes de ir para `webhook_logs` (remove `token`,
`access_token`, `password`, `authorization`, `secret`, `api_key`,
`signature`) — ver `docs/CRM_WEBHOOKS.md`.

**Nota:** o rate limit por KV é "razoável", não perfeitamente atômico sob
concorrência extrema (KV é eventualmente consistente). Para proteção mais
rigorosa, configure também uma regra de Rate Limiting nativa da Cloudflare
na zona do domínio.

## LGPD / minimização de dados (item 41)

- Telefone do cliente **nunca** é armazenado em texto puro: só
  `phone_hash` (SHA-256) e `phone_last4` (últimos 4 dígitos, só para
  identificação visual no dashboard).
- `fbp` só é gravado se um cookie `_fbp` legítimo existir — nunca
  inventado.
- Conteúdo de conversa: só a mensagem inicial (a que contém o `#click_ref`)
  é guardada, para auditoria da vinculação — não acumulamos histórico de
  conversa.
- IP do clique só é visível para ADMIN no dashboard (página Cliques);
  outros papéis não veem a coluna.
- Retenção configurável (`app_settings.log_retention_days`, default 90
  dias): um cron no Worker apaga `webhook_logs`/`redirect_misses` antigos e
  anonimiza (`client_ip_address`/`client_user_agent` → `null`) cliques mais
  antigos que o período configurado.
- Nenhum dado é enviado a terceiros além da Meta (Conversions API) e do
  próprio CRM (que já tinha o telefone).

## Outras práticas

- **CORS**: os endpoints de webhook e internos não são pensados para
  consumo por browser — nenhum header CORS permissivo é adicionado.
- **Headers de segurança**: `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options:
  DENY` em toda resposta do Worker (exceto o 302 do redirect, que não
  precisa).
- **Proteção contra open redirect**: o destino do redirect nunca vem de um
  parâmetro da URL (ex.: `?url=`) — só de rotas previamente cadastradas no
  banco/KV pelo próprio time (item 7).
- **SQL parametrizado**: todo acesso a banco passa pelo supabase-js
  (parametrizado por definição) ou por `pg` com placeholders (`$1`, `$2`,
  ...) nos scripts de migration/seed — nunca concatenação de string.
- **Validação com Zod** em todo Server Action e endpoint de webhook.
