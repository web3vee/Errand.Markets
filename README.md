# Errand.markets

The marketplace for getting things done. Launching in Nigeria (Abuja) and Saint Vincent & the Grenadines.

- Architecture: [`docs/architecture`](docs/architecture/README.md)
- Design system: [`docs/design`](docs/design/README.md)

## Develop

Requirements: Node 22+, pnpm 10, PostgreSQL 16 (local), or a Supabase project.

```bash
pnpm install
cp .env.example .env.local        # set DATABASE_URL_EU_WEST_2, AUTH_MODE=local, LOCAL_AUTH_SECRET, SANDBOX_WEBHOOK_SECRET, ID_HASH_PEPPER
pnpm db:local:reset               # LOCAL ONLY: Supabase shim + migrations + seed
pnpm dev                          # http://localhost:3000
```

In local/sandbox mode no SMS is sent. The code screen shows the code, and identity checks use a sandbox page. Everything is labelled "Sandbox".

Make yourself an admin (after signing in once):

```bash
pnpm admin:grant --phone +2348031234567 --market NG --perms ops   # or --market ALL
```

### Tests

```bash
pnpm test               # unit (money, tax-ready pricing helpers, OTP, RBAC, KYC rules, provider signatures)
pnpm test:integration   # against local Postgres: RLS, privileges, triggers, KYC flow in NG + VC
pnpm build && pnpm start -p 3100 &
E2E_BASE_URL=http://localhost:3100 pnpm test:e2e   # browser: sign-in → Runner → KYC → admin approval, both markets
pnpm lint               # includes architecture boundary rules
```

### Useful URLs

`/en` (detected market or picker), `/en/ng`, `/en/vc`, `/en/ng/sign-in`, `/en/ng/account`, `/en/ng/runner/verify`, `/en/admin/runners`, `/en/design`.

Layout QA: `ENABLE_PSEUDO_LOCALES=1 pnpm dev`, then `/en-XA/ng` (long strings) or `/ar-XB/vc` (right-to-left).
