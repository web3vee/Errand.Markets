# Errand.markets

The marketplace for getting things done. Launching in Nigeria (Abuja) and Saint Vincent & the Grenadines.

- Architecture: [`docs/architecture`](docs/architecture/README.md)
- Design system: [`docs/design`](docs/design/README.md)

## Develop

```bash
pnpm install
cp .env.example .env.local   # nothing required yet for Stage 2
pnpm dev                     # http://localhost:3000
pnpm test                    # unit tests (Vitest)
pnpm typecheck && pnpm build
```

Useful URLs: `/en` (detected market, or the picker), `/en/ng`, `/en/vc`, `/en/markets`, `/en/design`.

Layout QA: `ENABLE_PSEUDO_LOCALES=1 pnpm dev`, then open `/en-XA/ng` (long strings) or `/ar-XB/vc` (right-to-left).
