# Troubleshooting

## Redirect

**"Este link não está disponível" ao acessar `/r/<slug>`**
- Rota não existe, está inativa, ou não tem nenhum número ativo vinculado.
- Confira em Admin → Rotas. A ocorrência fica registrada em
  `redirect_misses` (visível via Supabase; futuramente uma página própria).

**Clique demorou para aparecer no dashboard**
- Esperado: a persistência é assíncrona (`ctx.waitUntil` + Cloudflare
  Queue) — pode levar alguns segundos. Se demorar minutos, veja
  `wrangler tail` do Worker por erros no consumer `tracking-clicks`.

**`pnpm dev:worker` não sobe / erro de binding**
- Confirme que `apps/worker/.dev.vars` existe (copiado de `.dev.vars.example`)
  e que o KV namespace / filas existem (`wrangler kv namespace list`,
  `wrangler queues list`) e os IDs em `wrangler.toml` estão corretos.

## Webhooks do CRM

**401 "assinatura invalida"**
- Confira que `CRM_WEBHOOK_SECRET` no Worker é **exatamente** igual ao
  configurado no CRM.
- Se estiver usando HMAC, confira que a assinatura cobre
  `${timestamp}.${corpo_raw_exato}` — qualquer alteração no corpo (mesmo
  espaçamento de JSON) depois de assinado invalida a assinatura.
- Relógio do servidor do CRM muito adiantado/atrasado (>5min) também causa
  isso — a tolerância de replay rejeita timestamps fora da janela.

**Lead não aparece mesmo com `#click_ref` na mensagem**
- Confira se o `click_ref` foi digitado exatamente como veio na mensagem
  (o sistema busca com case-insensitive, mas precisa das 8 letras/dígitos
  certas).
- Veja `pending_lead_bindings` — se o clique ainda não tinha sido
  persistido quando a mensagem chegou, a linha fica lá até ser resolvida
  (evento) ou até o cron rodar (a cada 5 min).

**Pedido aparece como `unmatched`**
- Verifique se o payload trouxe `click_ref` válido OU um telefone que bate
  com algum `lead_binding` dentro da janela de atribuição (Configurações).
- Confira `app_settings.attribution_window_days` — se o clique foi há mais
  tempo que a janela configurada, a atribuição por telefone não vai achar.

## Meta CAPI

**Evento fica `pending` para sempre**
- Confira `wrangler tail` do Worker — o consumer `tracking-meta-events` pode
  estar falhando silenciosamente antes de conseguir marcar `processing`.
- Confirme que a fila `tracking-meta-events` existe e está configurada em
  `wrangler.toml`.

**Evento vai para `dead_letter` imediatamente**
- HTTP 4xx (exceto 429) é tratado como erro permanente. Veja
  `meta_events.error_message` — geralmente token inválido, dataset errado,
  ou payload rejeitado (ex.: moeda inválida).

**"Enviar evento de teste" retorna erro "META_TEST_EVENT_CODE nao
configurado"**
- Configure a variável no Worker (`wrangler secret put META_TEST_EVENT_CODE`)
  — sem ela, o botão fica desabilitado por design (não faz sentido mandar
  teste sem código de teste).

## Dashboard

**Login funciona mas todas as páginas redirecionam para `/login` de novo**
- Confirme `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
  corretos no `.env.local` do dashboard — um valor errado faz
  `supabase.auth.getUser()` sempre retornar `null` no `proxy.ts`.

**"Você não tem permissão para acessar essa página"**
- Esperado para VIEWER tentando abrir páginas ADMIN-only (Usuários,
  Configurações, Webhooks, Simulador) ou VIEWER/MANAGER tentando editar
  algo restrito a ADMIN. Promova o usuário em Admin → Usuários (ou via SQL
  se ainda não houver nenhum ADMIN).

**Botão "Reenviar"/"Enviar evento de teste" retorna erro de conexão**
- Confirme `WORKER_URL` e `WORKER_INTERNAL_API_TOKEN` no dashboard batem
  com o Worker (mesmo token configurado via `wrangler secret put
  INTERNAL_API_TOKEN`).

**Convite de usuário por e-mail não chega**
- Requer SMTP configurado no projeto Supabase (Authentication → Emails).
  Sem isso, `inviteUserByEmail` pode ter sucesso na API mas o e-mail nunca
  sai. Alternativa: crie o usuário direto em Authentication → Users no
  painel do Supabase e promova o role pela página Usuários.

## Migrations

**`pnpm migrate` falha com "relation already exists"**
- Algum objeto foi criado manualmente fora do fluxo de migration. O runner
  (`packages/shared/src/scripts/migrate.ts`) rastreia o que já rodou em
  `public.schema_migrations` — se você aplicou uma migration manualmente,
  insira a linha correspondente nessa tabela para não tentar de novo, ou
  ajuste o SQL para ser idempotente (`create table if not exists`).

## Geral

Todo endpoint importante (redirect, webhooks, rotas internas) inclui um
`request_id` nos logs estruturados (JSON, uma linha por evento) — use
`wrangler tail` e procure pelo `request_id` correspondente ao erro relatado
pelo usuário para reconstruir o que aconteceu.
