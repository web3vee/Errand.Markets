import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { MarketView } from '@/modules/markets/view';
import { IconArrow, IconCheck } from '@/ui/icons';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Container } from '@/ui/primitives/container';
import { SectionHeading } from '@/ui/patterns/section-heading';
import { localized } from '@/lib/localized-text';

type P = { locale: string; market: MarketView };
const sectionY = 'py-16 md:py-24';

export async function HowItWorks({}: P) {
  const t = await getTranslations();
  const format = await getFormatter();
  const steps = ['post', 'offers', 'pay', 'track', 'confirm'] as const;
  return (
    <section id="how" aria-labelledby="how-title" className={`scroll-mt-16 border-b border-line ${sectionY}`}>
      <Container>
        <SectionHeading id="how-title" eyebrow={t('how.eyebrow')} title={t('how.title')} />
        <ol className="mt-12 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((s, i) => (
            <li key={s} className="border-t border-line py-6">
              <span className="text-small tabular-nums text-ink-3">{format.number(i + 1, { minimumIntegerDigits: 2 })}</span>
              <h3 className="mt-3 text-h3">{t(`how.steps.${s}.title`)}</h3>
              <p className="mt-2 text-small text-ink-2 text-pretty">{t(`how.steps.${s}.body`)}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

export async function Categories({ locale, market }: P) {
  const t = await getTranslations();
  const cats = market.categories.filter((c) => c.active).sort((a, b) => a.sort - b.sort);
  const home = `/${locale}/${market.slug}`;
  return (
    <section aria-labelledby="cat-title" className={`border-b border-line ${sectionY}`}>
      <Container>
        <SectionHeading id="cat-title" eyebrow={t('categories.eyebrow')} title={t('categories.title')} />
        <ul className="mt-12 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          {cats.map((c) => (
            <li key={c.key} className="border-t border-line">
              <Link href={`${home}/get-started?intent=post&category=${c.key}`} className="group flex min-h-11 items-start justify-between gap-6 py-6">
                <span>
                  <span className="block text-h3">{t(c.nameKey)}</span>
                  <span className="mt-2 block text-small text-ink-2 text-pretty">{t(c.descriptionKey)}</span>
                </span>
                <IconArrow className="mt-1.5 shrink-0 text-ink-3 transition-transform duration-[var(--duration-base)] group-hover:translate-x-0.5 group-hover:text-ink rtl:group-hover:-translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export async function BecomeRunner({ locale, market }: P) {
  const t = await getTranslations();
  const region = localized(market.launchRegion, locale);
  const needs = [
    t('runner.needs.age'),
    t('runner.needs.phone'),
    t('runner.needs.id', { idRequirement: localized(market.runnerIdRequirement, locale) }),
    t('runner.needs.area', { region }),
  ];
  return (
    <section id="runners" aria-labelledby="runner-title" className={`scroll-mt-16 border-b border-line bg-surface ${sectionY}`}>
      <Container className="grid gap-12 md:grid-cols-2 md:gap-16">
        <div>
          <SectionHeading id="runner-title" eyebrow={t('runner.eyebrow')} title={t('runner.title')} lead={t('runner.lead')} />
          <Button asChild size="lg" variant="ink" className="mt-8">
            <Link href={`/${locale}/${market.slug}/get-started?intent=runner`}>{t('runner.cta')}</Link>
          </Button>
        </div>
        <div>
          <h3 className="text-small font-medium text-ink-3">{t('runner.needsTitle')}</h3>
          <ul className="mt-4">
            {needs.map((n) => (
              <li key={n} className="flex items-start gap-3 border-t border-line py-4 text-body">
                <IconCheck className="mt-1 shrink-0 text-accent" />
                <span className="text-pretty">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}

export async function TrustSafety({}: P) {
  const t = await getTranslations();
  const items = ['escrow', 'verified', 'proof', 'ratings', 'disputes', 'report'] as const;
  return (
    <section aria-labelledby="trust-title" className={`border-b border-line ${sectionY}`}>
      <Container>
        <SectionHeading id="trust-title" eyebrow={t('trust.eyebrow')} title={t('trust.title')} />
        <dl className="mt-12 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((k) => (
            <div key={k} className="border-t border-line py-6">
              <dt className="text-h3">{t(`trust.items.${k}.title`)}</dt>
              <dd className="mt-2 text-small text-ink-2 text-pretty">{t(`trust.items.${k}.body`)}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

export async function ForBusiness({ locale, market }: P) {
  const t = await getTranslations();
  return (
    <section id="business" aria-labelledby="biz-title" className={`scroll-mt-16 border-b border-line ${sectionY}`}>
      <Container className="grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-16">
        <div>
          <SectionHeading id="biz-title" eyebrow={t('business.eyebrow')} title={t('business.title')} lead={t('business.lead')} />
          <p className="mt-4 max-w-[40rem] text-small text-ink-3">{t('business.soon')}</p>
        </div>
        <Button asChild size="lg" variant="secondary">
          <Link href={`/${locale}/${market.slug}/get-started?intent=post&category=business`}>{t('business.cta')}<IconArrow /></Link>
        </Button>
      </Container>
    </section>
  );
}

export async function RidesTeaser({}: P) {
  const t = await getTranslations();
  return (
    <section aria-labelledby="rides-title" className="border-b border-line bg-sunken">
      <Container className="flex flex-col gap-3 py-10 sm:flex-row sm:items-center sm:gap-6">
        <Badge tone="outline" className="self-start sm:self-auto">{t('rides.badge')}</Badge>
        <h2 id="rides-title" className="text-h3">{t('rides.title')}</h2>
        <p className="text-small text-ink-2 sm:border-s sm:border-line sm:ps-6">{t('rides.body')}</p>
      </Container>
    </section>
  );
}
