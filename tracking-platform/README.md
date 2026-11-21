# Tracking Platform — Meta Ads → WhatsApp → CRM → Meta CAPI

Sistema completo de atribuição de campanhas Meta Ads que redirecionam para
WhatsApp **sem WhatsApp Business Platform** (sem `ctwa_clid`, sem webhook
oficial da Meta). A ligação clique ↔ telefone ↔ venda é feita por um
identificador próprio, o **`click_ref`**, e o resultado é enviado de volta
para a Meta via Conversions API.

Este diretório (`tracking-platform/`) é um monorepo **isolado** do app
Next.js/Neon que já existia na raiz do repositório (relatórios de
campanhas/criativos) — os dois convivem no mesmo repositório Git, mas não
compartilham banco, dependências nem deploy. Ver a raiz do repositório para o
app legado.

## Arquitetura (resumo)

```
Meta Ad → clique → Cloudflare Worker (/r/<slug>)
  → gera click_ref, escolhe número (peso), responde 302 pro wa.me IMEDIATAMENTE
  → persiste o clique de forma assíncrona (Cloudflare Queue)

CRM → POST /api/v1/webhooks/crm/message  → liga telefone ao click_ref (lead_binding)
CRM → POST /api/v1/webhooks/crm/order    → atribui pedido ao clique → enfileira Purchase
Worker (Queue consumer) → Meta Conversions API → grava resultado em meta_events

Dashboard (Next.js/Vercel) → lê tudo do Supabase (RLS) → mostra funil, campanhas,
  rotas, números, cliques, leads, pedidos, Meta CAPI, saúde, etc.
```

Detalhes completos e decisões técnicas: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Estrutura de pastas

```
tracking-platform/
├── apps/
│   ├── dashboard/     # Next.js 16 (App Router) — deploy na Vercel
│   └── worker/        # Cloudflare Worker (redirect, filas, webhooks) — deploy via Wrangler
├── packages/
│   └── shared/        # Zod schemas, click_ref, hashing, CRM adapter, Meta CAPI client, tipos do Supabase
├── supabase/
│   ├── migrations/    # Schema versionado (SQL puro, compatível com `supabase db push`)
│   └── seed.sql        # (gerado pelo script de seed, ver abaixo)
├── scripts/
│   ├── loadtest/       # Load test do redirect
│   └── mocks/          # Mock da Meta CAPI + CLI que finge ser o CRM
└── docs/               # Documentação detalhada (ver abaixo)
```

## Documentação

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — arquitetura final e decisões técnicas
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — como colocar tudo no ar do zero
- [`docs/CRM_WEBHOOKS.md`](docs/CRM_WEBHOOKS.md) — contrato dos webhooks do CRM (exemplos de payload, HMAC, erros)
- [`docs/META_CAPI.md`](docs/META_CAPI.md) — integração com a Meta Conversions API
- [`docs/SECURITY.md`](docs/SECURITY.md) — RLS, RBAC, segredos, LGPD
- [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) — problemas comuns

## Instalação local

Pré-requisitos: Node.js 20.9+, [pnpm](https://pnpm.io) (via `corepack enable`
ou `npm i -g pnpm`), uma conta Cloudflare e um projeto Supabase (gratuitos
para desenvolvimento).

```bash
cd tracking-platform
corepack enable        # ou: npm i -g pnpm
pnpm install
```

Copie os arquivos de ambiente:

```bash
cp .env.example .env                                  # referência — não é lido diretamente
cp apps/dashboard/.env.local.example apps/dashboard/.env.local
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
```

Preencha `apps/dashboard/.env.local` e `apps/worker/.dev.vars` com as
credenciais do seu projeto Supabase e Cloudflare (ver `docs/DEPLOY.md` para
onde encontrar cada uma).

### Migrations e seed

```bash
export DATABASE_URL="postgresql://postgres:SENHA@db.xxxx.supabase.co:5432/postgres"
pnpm migrate     # aplica supabase/migrations/*.sql, idempotente
pnpm seed        # popula dados de desenvolvimento (rota 'menocare', 2 números fake, 10 clicks, leads, pedidos)
```

### Rodar localmente

```bash
pnpm dev:worker      # wrangler dev — Worker em http://localhost:8787
pnpm dev:dashboard   # next dev — Dashboard em http://localhost:3000
```

Primeiro acesso ao dashboard: crie um usuário pelo Supabase Auth (ou pela tela
de login, se você configurar signup) e promova-o a `ADMIN` rodando no SQL
editor do Supabase:

```sql
update public.profiles set role = 'ADMIN' where email = 'voce@empresa.com';
```

### Testes

```bash
pnpm test            # Vitest (packages/shared + apps/worker + apps/dashboard)
pnpm --filter @tracking/dashboard test:e2e   # Playwright (precisa do dashboard buildado/rodando)
pnpm loadtest menocare 10,25,50,100          # load test do redirect (não toca WhatsApp real)
```

### Build

```bash
pnpm build           # shared -> dashboard -> worker, nessa ordem
```

### Deploy

Ver [`docs/DEPLOY.md`](docs/DEPLOY.md) para o passo a passo completo
(Supabase, Cloudflare Worker + Queues + KV, Vercel, DNS).

## Mocks (desenvolvimento sem credenciais reais)

```bash
pnpm mock:meta-capi                          # sobe um mock da Meta CAPI em :8790
pnpm mock:crm message A7K3M9Q2                # simula mensagem do CRM
pnpm mock:crm order A7K3M9Q2 297              # simula pedido pago
```

Ou use a ferramenta **Simulador** dentro do dashboard (Admin, item 55) —
exercita o fluxo completo usando os endpoints reais do Worker.
