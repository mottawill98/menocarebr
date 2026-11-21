# Arquitetura

## Visão geral

```
                         ┌──────────────────────────────────────────────┐
                         │              Cloudflare Worker                │
Meta Ad → clique ───────▶│  GET /r/:slug                                 │
                         │   1. le config da rota do KV (cache)          │
                         │   2. escolhe numero (distribuicao ponderada)  │
                         │   3. gera click_ref                            │
                         │   4. ctx.waitUntil(fila de persistencia)      │
                         │   5. responde 302 pro wa.me IMEDIATAMENTE     │──▶ WhatsApp
                         │                                                │
                         │  Queue consumer (tracking-clicks)             │
                         │   -> insere em `clicks`, resolve pendencias   │
                         │                                                │
CRM ────────────────────▶│  POST /api/v1/webhooks/crm/message            │
                         │   -> extrai #click_ref, cria lead_binding     │
                         │                                                │
CRM ────────────────────▶│  POST /api/v1/webhooks/crm/order              │
                         │   -> atribui (click_ref > phone_hash > unmatched)│
                         │   -> cria meta_events (idempotente)           │
                         │   -> enfileira (tracking-meta-events)         │
                         │                                                │
                         │  Queue consumer (tracking-meta-events)        │
                         │   -> Meta Conversions API, retry/backoff      │──▶ Meta
                         │                                                │
                         │  Cron (a cada 5min): reconciliacao, retry,    │
                         │  retencao de dados                            │
                         └───────────────┬────────────────────────────────┘
                                         │ (Postgres via service role, RLS
                                         │  bypassada so aqui e em Server
                                         │  Actions do dashboard)
                                         ▼
                              ┌────────────────────┐
                              │  Supabase Postgres  │◀── RLS por role
                              │  + Supabase Auth    │    (ADMIN/MANAGER/VIEWER)
                              └─────────┬──────────┘
                                        │ leitura com sessao do usuario (RLS)
                                        ▼
                              ┌────────────────────┐
                              │  Dashboard Next.js  │ (Vercel)
                              └────────────────────┘
```

## Por que esta stack

| Decisão | Motivo |
|---|---|
| Cloudflare Workers para o redirect | Latência de edge, `ctx.waitUntil` para trabalho assíncrono sem bloquear a resposta, Queues e KV nativos — exatamente o que o requisito de velocidade (item 4) pede. |
| Supabase (Postgres + Auth + RLS) | Um único Postgres real com RLS de verdade (não confiamos só em esconder botão no frontend — item 27), Auth pronto, e é o banco que o dashboard e o worker compartilham. |
| Next.js 16 (App Router) na Vercel | Server Components + Server Actions cobrem tudo que o dashboard precisa (leitura com RLS, mutação com service role + checagem de role) sem precisar de uma camada de API REST própria. |
| pnpm workspaces (sem Turborepo) | Monorepo pequeno (3 pacotes + scripts) — Turborepo adicionaria configuração sem ganho real neste tamanho. |
| Zod | Validação de payload de webhook e de formulário, com o mesmo schema podendo ser usado no client e no server. |
| Vitest + Playwright | Vitest para lógica pura (click_ref, hashing, atribuição, CRM adapter, distribuição ponderada); Playwright para os fluxos críticos do dashboard (login, RBAC). |

## Decisões de projeto (onde o briefing permitia escolha)

### `click_ref`
Alfabeto de 31 caracteres sem `0/O`, `1/I/L` (ambíguos), 8 caracteres,
gerado com `crypto.getRandomValues` + amostragem por rejeição (sem viés de
módulo). ~8,5 × 10¹¹ combinações — colisão é praticamente impossível, mas o
`clicks_consumer` regenera e tenta de novo em caso de violação da constraint
`UNIQUE`. Ver `packages/shared/src/click-ref.ts`.

### Distribuição entre números de WhatsApp
**Decisão deliberada:** em vez de round-robin com contador persistido (que
exigiria coordenação distribuída entre milhares de instâncias de Worker
rodando em edges diferentes — o próprio risco de concorrência que o
briefing menciona no item 8), usamos amostragem ponderada **stateless**: a
cada requisição sorteamos um número aleatório e percorremos os pesos
acumulados. Isso é trivialmente seguro sob concorrência (nenhum estado
compartilhado) e converge para a distribuição proporcional desejada em
volume. A opção "round_robin" no cadastro da rota usa a mesma função com
pesos iguais entre os números — aproxima round-robin sem o contador
compartilhado. Ver `packages/shared/src/distribution.ts`.

### Cache de rota no KV
Cada rota + seus números elegíveis ficam cacheados no Cloudflare KV
(`route:<slug>`), com TTL de 5 minutos como rede de segurança. Quando um
ADMIN/MANAGER edita rota, número ou vínculo pelo dashboard, uma Server
Action chama `POST /internal/kv/refresh` no Worker (autenticado com
`WORKER_INTERNAL_API_TOKEN`) para atualizar o cache imediatamente. Em caso
de cache miss, o Worker busca no Supabase uma única vez (com timeout de
1,5s) e repopula o KV — o redirect nunca fica bloqueado esperando um
processo externo "esquentar" o cache.

### Reconciliação de condição de corrida (item 13)
Se a mensagem do CRM chegar antes do clique ser persistido pela fila:
1. O webhook de mensagem cria uma linha em `pending_lead_bindings`.
2. Assim que o `clicks` consumer insere o clique, ele mesmo verifica se
   existe uma pendência para aquele `click_ref` e resolve na hora
   (caminho orientado a evento — sem esperar nenhum cron).
3. Um cron a cada 5 minutos varre pendências não resolvidas como
   fallback (cobre qualquer falha no caminho orientado a evento) e desiste
   após 48h sem nunca apagar o registro (fica disponível para auditoria).

### Atribuição de pedido (item 16)
Ordem de prioridade, implementada em `apps/worker/src/attribution.ts`:
1. `click_ref` explícito no payload do pedido.
2. `lead_binding` mais recente (pelo horário do **clique**, não da
   mensagem) para o `phone_hash`, dentro da janela de atribuição
   configurável (`app_settings.attribution_window_days`, default 30 dias).
3. `unmatched` — nunca inventamos atribuição.

Uma atribuição já resolvida como `attributed` não é rebaixada em uma
atualização posterior do mesmo pedido (ex.: pedido que já tinha
`click_ref` não perde a atribuição se o webhook de status "paid" chegar
depois sem esse campo).

### Idempotência da Meta CAPI (itens 21-24)
`event_id = purchase:<crm_order_id>` — estável e determinístico. A tabela
`meta_events.event_id` tem `UNIQUE`, então:
- reenvio do mesmo webhook do CRM → segunda tentativa de `insert` falha
  com `23505`, tratada como "já existe" (não duplica).
- dois status diferentes do mesmo pedido mapeando para "purchase" (ex.:
  `approved` e depois `paid`) → mesma constraint impede duplicidade.

Retry: backoff exponencial com jitter (`backoffSeconds`), até 8
tentativas, então `dead_letter`. HTTP 429/5xx/erro de rede → retentável;
4xx (exceto 429) → erro permanente, vai direto para `dead_letter`. Reenvio
manual pelo dashboard usa a mesma função (`sendOneMetaEvent`) que o
consumer da fila — uma única fonte de verdade.

### `action_source = "chat"`
Consultado na documentação atual da Conversions API (ver
`docs/META_CAPI.md`) — `business_messaging` é especificamente para anúncios
"click to Messenger/Instagram/WhatsApp" **dentro** do WhatsApp Business
Platform (exige `ctwa_clid`), o que este projeto explicitamente não usa.
`chat` é descrito pela própria Meta como "conversão feita através de apps
de mensagem, SMS, ou mensagens online" — nosso caso exato.

### RLS vs. checagem de `role` no código
Toda **leitura** no dashboard passa pelo client autenticado com a sessão do
usuário (`createSupabaseServerClient`), então a RLS decide o que cada role
pode ver. Toda **escrita** passa por uma Server Action que primeiro chama
`assertRole([...])` (falha se o usuário não tiver o role certo) e só então
usa o client com a service role key (que ignora RLS por definição) para
gravar. Isso significa que nenhuma sessão de usuário comum — nem ADMIN —
consegue escrever direto numa tabela operacional (`clicks`, `orders`,
`meta_events`) via um client Supabase no browser, porque essas tabelas não
têm nenhuma policy de `INSERT`/`UPDATE` para `authenticated`. Ver
`docs/SECURITY.md`.

### Sem embed do postgrest-js
As consultas em `packages/shared/src/queries.ts` deliberadamente evitam a
sintaxe de embed (`select("tabela_relacionada(*)")`) do postgrest-js, que
depende de metadados de `Relationships` (chaves estrangeiras) para
inferência de tipo — manter isso sincronizado manualmente com as migrations
é frágil. Em vez disso, cada consulta relacionada é feita em duas queries
simples (`select ... in (...)`), o que é rápido o suficiente para os
volumes deste projeto e muito mais fácil de manter tipado.

**Nota de manutenção:** o `Database` type em `packages/shared/src/supabase.ts`
envolve cada `Row`/`Insert`/`Update` num utilitário `Prettify<T>`. Isso não é
estético — sem ele, esta versão do `@supabase/postgrest-js` falha
silenciosamente ao resolver o tipo de qualquer `.select()`/`.insert()`
encadeado (colapsa para `never`) quando o tipo de origem é uma `interface`
nomeada em vez de um objeto literal resolvido. Confirmado por reprodução
mínima durante o desenvolvimento — se a lib for atualizada no futuro, vale
testar se o wrapper ainda é necessário antes de removê-lo.

## O que NÃO foi validado em ambiente real

Este projeto foi construído e testado (build, typecheck, lint, testes
unitários, testes E2E de autenticação/RBAC contra o dashboard buildado, bundle
do Worker via `wrangler deploy --dry-run`) **sem** um projeto Supabase real,
sem conta Cloudflare real e sem credenciais reais da Meta. Isso significa que
os seguintes pontos não puderam ser exercitados fim-a-fim:

- Migrations rodando contra um Postgres real (revisão manual cuidadosa do
  SQL, mas não executado).
- RLS policies validadas contra um banco real com usuários de cada role.
- Deploy real do Worker (Queues, KV, Cron Triggers) na infraestrutura da
  Cloudflare.
- Chamada real à Meta Conversions API (testado apenas contra o mock local).
- Envio de e-mail de convite/recuperação de senha via Supabase Auth (depende
  de SMTP configurado no projeto).

Ver `docs/DEPLOY.md` para o checklist de validação recomendado após conectar
credenciais reais.
