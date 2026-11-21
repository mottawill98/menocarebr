# Deploy

Nenhum destes passos foi executado de verdade nesta sessão (sem credenciais
reais disponíveis) — o que segue é o roteiro para você (ou quem tiver acesso
às contas) colocar tudo no ar.

## 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Em **Project Settings → API**, anote:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**nunca** exponha no
     frontend nem comite no Git)
3. Em **Project Settings → Database**, copie a connection string (modo
   "Session pooler" funciona bem para os scripts de migration) →
   `DATABASE_URL`.
4. Rode as migrations:
   ```bash
   export DATABASE_URL="postgresql://postgres:SENHA@...supabase.co:5432/postgres"
   cd tracking-platform
   pnpm migrate
   ```
   Alternativa: instale a [Supabase CLI](https://supabase.com/docs/guides/cli)
   e rode `supabase db push` apontando para `supabase/migrations` — os
   arquivos são compatíveis com as duas ferramentas.
5. (Opcional, dev) `pnpm seed` para popular dados fictícios.
6. Promova o primeiro usuário a ADMIN (depois de ele se cadastrar/logar pela
   primeira vez, o que cria a linha em `profiles` automaticamente via
   trigger, com role `VIEWER`):
   ```sql
   update public.profiles set role = 'ADMIN' where email = 'voce@empresa.com';
   ```
7. Configure o **SMTP** do projeto (Authentication → Emails) se quiser usar
   convite por e-mail e recuperação de senha — sem isso, `inviteUserByEmail`
   e `resetPasswordForEmail` falham silenciosamente ou não entregam o
   e-mail. Alternativa: crie usuários direto em Authentication → Users e
   promova o role pela página Usuários do dashboard.

## 2. Cloudflare (Worker + Queues + KV)

1. Crie uma conta Cloudflare (ou use uma existente) e instale a Wrangler CLI
   (já vem como devDependency do `apps/worker`).
2. Login: `npx wrangler login` (dentro de `apps/worker`).
3. Crie o KV namespace:
   ```bash
   npx wrangler kv namespace create ROUTES_KV
   npx wrangler kv namespace create ROUTES_KV --preview
   ```
   Copie os `id`/`preview_id` retornados para `apps/worker/wrangler.toml`.
4. Crie as filas (nomes já usados em `wrangler.toml`):
   ```bash
   npx wrangler queues create tracking-clicks
   npx wrangler queues create tracking-clicks-dlq
   npx wrangler queues create tracking-meta-events
   npx wrangler queues create tracking-meta-events-dlq
   ```
5. Configure os segredos (nunca em `wrangler.toml`):
   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put META_ACCESS_TOKEN
   npx wrangler secret put META_DATASET_ID
   npx wrangler secret put META_TEST_EVENT_CODE     # opcional
   npx wrangler secret put CRM_WEBHOOK_SECRET
   npx wrangler secret put INTERNAL_API_TOKEN
   ```
6. Deploy:
   ```bash
   pnpm build:worker
   cd apps/worker && npx wrangler deploy
   ```
7. Configure o domínio customizado (Workers → seu worker → Triggers →
   Custom Domains) apontando `go.usemenocare.com.br` para este Worker — ou
   descomente o bloco `routes` em `wrangler.toml` se preferir gerenciar via
   config (exige a zone já estar na Cloudflare).
8. (Opcional) Rode `pnpm --filter @tracking/worker kv:sync` (com
   `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_KV_NAMESPACE`
   e as variáveis do Supabase no ambiente) para pré-popular o cache do KV
   com as rotas já cadastradas.

### DNS

Domínios sugeridos pelo briefing:
- `go.usemenocare.com.br` → Cloudflare Worker (redirect + webhooks)
- `track.usemenocare.com.br` → Vercel (dashboard)

Nenhum dos dois foi configurado nesta sessão — depende de acesso ao
provedor de DNS do domínio `usemenocare.com.br`.

## 3. Meta Conversions API

1. No [Events Manager](https://business.facebook.com/events_manager2), crie
   (ou use) um **Dataset** para eventos server-side → `META_DATASET_ID`.
2. Gere um **Conversions API access token** (Events Manager → Dataset →
   Settings → Conversions API → Generate access token) → `META_ACCESS_TOKEN`.
3. (Opcional, recomendado para testar) Copie o **Test Event Code** (Events
   Manager → Test Events) → `META_TEST_EVENT_CODE`.
4. **Antes de ir para produção**, confirme na documentação oficial atual
   (`developers.facebook.com/docs/marketing-api/conversions-api`) se
   `META_GRAPH_VERSION` (default `v21.0` neste projeto) ainda é suportada —
   a Meta aposenta versões periodicamente. Ver `docs/META_CAPI.md`.

## 4. Vercel (Dashboard)

1. Importe o repositório na Vercel, com **Root Directory** =
   `tracking-platform/apps/dashboard`.
2. Configure as variáveis de ambiente (ver
   `apps/dashboard/.env.local.example`):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `WORKER_URL`, `WORKER_INTERNAL_API_TOKEN`,
   `META_ACCESS_TOKEN`, `META_DATASET_ID`, `META_TEST_EVENT_CODE`,
   `NEXT_PUBLIC_REDIRECT_BASE_URL`, `NEXT_PUBLIC_APP_URL`,
   `CRM_WEBHOOK_SECRET` (só para o Simulador), `ALLOW_SIMULATOR_IN_PRODUCTION=false`.
3. Deploy. Aponte `track.usemenocare.com.br` como domínio customizado do
   projeto na Vercel.

## 5. Webhook do CRM (DataCrazy ou equivalente)

Configure no painel do CRM os dois endpoints do Worker:
- `https://go.usemenocare.com.br/api/v1/webhooks/crm/message`
- `https://go.usemenocare.com.br/api/v1/webhooks/crm/order`

Com o mesmo segredo definido em `CRM_WEBHOOK_SECRET`. Ver
`docs/CRM_WEBHOOKS.md` para o formato exato de assinatura esperado.

## Checklist de validação pós-deploy (não executado nesta sessão)

- [ ] `GET https://go.usemenocare.com.br/health` retorna `status: "ok"`.
- [ ] Criar uma rota de teste no dashboard, clicar no link gerado, confirmar
      que abre o WhatsApp com `#click_ref` na mensagem.
- [ ] Enviar uma mensagem de teste ao número (com o `#click_ref` colado) e
      confirmar que o CRM real dispara o webhook e o lead aparece no
      dashboard em até alguns segundos.
- [ ] Simular um pedido pago apontando pro mesmo telefone e confirmar que o
      pedido aparece atribuído e o evento Meta aparece como `sent`.
- [ ] Na página Meta CAPI, usar "Enviar evento de teste" e confirmar no
      Events Manager (aba Test Events) que o evento chegou.
- [ ] Rodar `pnpm loadtest <slug> 10,25,50,100` contra a URL de produção e
      confirmar p95 dentro da meta (~150-200ms).
