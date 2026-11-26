import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { listMarketViews } from '@/modules/markets/view';
import { LogoMark } from '@/ui/brand/logo';
import { contrastRatio } from '@/ui/contrast';
import { HeroLedger } from '@/ui/home/hero-ledger';
import { IconArrow, IconCheck } from '@/ui/icons';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Container } from '@/ui/primitives/container';
import { theme, type ColorTokens } from '@/ui/tokens';

/**
 * Internal design-system reference (not user-facing, not indexed): tokens, type scale,
 * components and the hero.
 */
export const metadata: Metadata = { title: 'Design system — Errand.markets', robots: { index: false, follow: false } };

const SWATCHES: [keyof ColorTokens, string][] = [
  ['bg', 'bg'], ['surface', 'surface'], ['sunken', 'sunken'], ['ink', 'ink'], ['ink2', 'ink-2'], ['ink3', 'ink-3'],
  ['line', 'line'], ['lineStrong', 'line-strong'], ['accent', 'accent'], ['accentSoft', 'accent-soft'],
];

const TYPE: [string, string, string][] = [
  ['text-display', 'Display', 'Let someone do it.'],
  ['text-h1', 'H1', 'Errands, big and small.'],
  ['text-h2', 'H2', 'Built so both sides can trust the deal.'],
  ['text-h3', 'H3', 'Payment held until done'],
  ['text-lead', 'Lead', 'Post an errand at your price. A verified Runner nearby accepts it.'],
  ['text-body', 'Body', 'Message your Runner, follow progress, and get photo proof when it’s finished.'],
  ['text-small', 'Small', 'Prices in ₦ (NGN) · Now in Abuja'],
  ['text-micro', 'Micro', 'EXAMPLE ERRAND · EC$ · XCD'],
];

function ThemeSpec() {
  const d = theme;
  return (
    <div className="rounded-lg border border-line p-5 sm:p-8">
      <div className="flex items-center gap-3">
        <LogoMark className="h-7" />
        <div>
          <p className="text-micro font-medium uppercase text-ink-3">Direction A</p>
          <h2 className="text-h2">{d.name}</h2>
        </div>
      </div>
      <p className="mt-4 max-w-[36rem] text-body text-ink-2">{d.summary}</p>
      <p className="mt-2 text-small text-ink-3">
        Typeface: Geist · Radius {d.radius} · Accent {d.light.accent} / dark {d.dark.accent}
      </p>

      <h3 className="mt-10 text-small font-medium text-ink-3">Colour tokens (light / dark)</h3>
      <ul className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-5">
        {SWATCHES.map(([k, label]) => (
          <li key={k} className="bg-surface p-3">
            <div className="flex h-10 overflow-hidden rounded-sm border border-line">
              <span className="flex-1" style={{ background: d.light[k] }} />
              <span className="flex-1" style={{ background: d.dark[k] }} />
            </div>
            <p className="mt-2 text-micro font-medium">{label}</p>
            <p className="text-micro tabular-nums text-ink-3">{d.light[k]} · {d.dark[k]}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-micro text-ink-3">
        Contrast (light): ink/bg {contrastRatio(d.light.ink, d.light.bg).toFixed(1)}:1 · ink-3/bg {contrastRatio(d.light.ink3, d.light.bg).toFixed(1)}:1 · button {contrastRatio(d.light.accentInk, d.light.accent).toFixed(1)}:1 — all pairs unit-tested to WCAG AA.
      </p>

      <h3 className="mt-10 text-small font-medium text-ink-3">Type scale</h3>
      <ul className="mt-3">
        {TYPE.map(([cls, label, sample]) => (
          <li key={cls} className="grid gap-1 border-t border-line py-4 sm:grid-cols-[5rem_1fr] sm:gap-6">
            <span className="text-micro text-ink-3">{label}</span>
            <span className={`${cls} text-balance`}>{sample}</span>
          </li>
        ))}
      </ul>

      <h3 className="mt-10 text-small font-medium text-ink-3">Actions</h3>
      <div className="mt-3 flex flex-wrap gap-3">
        <Button>Post an errand</Button>
        <Button variant="ink">Become a Runner</Button>
        <Button variant="secondary">Secondary<IconArrow /></Button>
        <Button variant="ghost">Ghost</Button>
        <Button disabled>Disabled</Button>
      </div>

      <h3 className="mt-10 text-small font-medium text-ink-3">Status</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone="accent">Payment held</Badge>
        <Badge>In progress</Badge>
        <Badge tone="outline">Coming soon</Badge>
      </div>

      <h3 className="mt-10 text-small font-medium text-ink-3">Hairline list (no card soup)</h3>
      <ul className="mt-3">
        {['Verified Runners', 'Proof of completion', 'Ratings both ways'].map((x) => (
          <li key={x} className="flex min-h-11 items-center gap-3 border-t border-line text-body">
            <IconCheck className="text-accent" />{x}
          </li>
        ))}
      </ul>

    </div>
  );
}

export default async function DesignPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [ng] = await listMarketViews(locale);

  return (
    <main id="main" className="pb-24">
      <Container className="py-12">
        <p className="text-small font-medium text-ink-3">Internal · Stage 2</p>
        <h1 className="mt-2 text-h1">Design system</h1>
        <p className="mt-3 max-w-[40rem] text-body text-ink-2">
          Direction A (Ledger), chosen in Stage 2. Motion is 150–250&nbsp;ms and switches off under
          prefers-reduced-motion. Every tap target is at least 44&nbsp;px, and layouts use logical properties so they mirror for right-to-left scripts.
        </p>
        <div className="mt-10">
          <ThemeSpec />
        </div>
      </Container>
      {ng ? (
        <>
          <Container><h2 className="mt-8 text-h2">Hero</h2></Container>
          <div className="mt-4 border-y border-line"><HeroLedger locale={locale} market={ng} /></div>
        </>
      ) : null}
    </main>
  );
}
