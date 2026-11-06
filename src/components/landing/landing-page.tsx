import {
  ArrowRightIcon,
  BellRingIcon,
  BriefcaseIcon,
  CalculatorIcon,
  CheckIcon,
  ClipboardCheckIcon,
  CrownIcon,
  DatabaseIcon,
  FileTextIcon,
  GlobeIcon,
  HistoryIcon,
  LanguagesIcon,
  Link2Icon,
  ShieldCheckIcon,
  SmartphoneIcon,
  SparklesIcon,
  TruckIcon,
  UserCogIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { getLocale, getMessages } from "next-intl/server";

import { DemoForm } from "@/components/landing/demo-form";
import { FaqList } from "@/components/landing/faq-list";
import { FeatureTabs } from "@/components/landing/feature-tabs";
import { Hero } from "@/components/landing/hero";
import { LandingNav } from "@/components/landing/landing-nav";
import {
  Eyebrow,
  LandingMotionConfig,
  Reveal,
  ScrollWords,
  SectionHead,
  Stagger,
  StaggerItem,
  type LandingCopy,
} from "@/components/landing/motion";
import { ProfitChart } from "@/components/landing/profit-chart";
import { StepsTimeline } from "@/components/landing/steps-timeline";
import { ThemedImage } from "@/components/landing/themed-image";
import { TrustVisual } from "@/components/landing/trust-visual";
import { WhyVisual } from "@/components/landing/why-visual";
import { BrandMark } from "@/components/shared/brand-mark";
import { buttonVariants } from "@/components/ui/button";
import { appConfig } from "@/config/app";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

import "./landing.css";

const moreIcons: LucideIcon[] = [
  GlobeIcon,
  Link2Icon,
  FileTextIcon,
  UserCogIcon,
  BellRingIcon,
  HistoryIcon,
  LanguagesIcon,
  SmartphoneIcon,
];
const teamIcons: LucideIcon[] = [
  CrownIcon,
  ClipboardCheckIcon,
  TruckIcon,
  BriefcaseIcon,
  CalculatorIcon,
  UsersIcon,
];
const trustIcons: LucideIcon[] = [DatabaseIcon, ShieldCheckIcon, HistoryIcon];

const container = "mx-auto w-full max-w-6xl px-4 sm:px-6";
const section = "scroll-mt-20 py-20 sm:py-28";
const hoverLift = { y: -6, transition: { type: "spring", stiffness: 300, damping: 20 } } as const;

export async function LandingPage() {
  const locale = await getLocale();
  const copy = (await getMessages()).landing as unknown as LandingCopy;
  const otherLocale =
    appConfig.supportedLocales.find((item) => item !== locale) ?? appConfig.defaultLocale;

  return (
    <LandingMotionConfig>
      <div className="landing bg-background text-foreground min-h-svh">
        <LandingNav copy={copy.nav} />

        <main>
          <Hero copy={copy.opening} />

          {/* ---- What it does ---- */}
          <section id="features" className={section}>
            <div className={container}>
              <SectionHead
                eyebrow={copy.features.caption}
                title={copy.features.title}
                intro={copy.features.intro}
              />
              <FeatureTabs copy={copy.features} />
            </div>
          </section>

          {/* ---- How it works ---- */}
          <section id="how" className={cn(section, "bg-muted/40 border-border border-y")}>
            <div className={container}>
              <SectionHead
                eyebrow={copy.how.caption}
                title={copy.how.title}
                intro={copy.how.intro}
                center
              />
              <StepsTimeline copy={copy.how} />
            </div>
          </section>

          {/* ---- Profit ---- */}
          <section id="profit" className={section}>
            <div className={cn(container, "grid items-center gap-12 lg:grid-cols-2 lg:gap-16")}>
              <div>
                <SectionHead
                  eyebrow={copy.profit.caption}
                  title={copy.profit.title}
                  intro={copy.profit.body}
                />
                <Reveal delay={0.15} className="mt-8">
                  <a
                    href="#demo"
                    className={cn(buttonVariants({ variant: "default", size: "lg" }), "h-11 px-5")}
                  >
                    {copy.nav.demo}
                    <ArrowRightIcon className="rtl:rotate-180" />
                  </a>
                </Reveal>
              </div>
              <ProfitChart copy={copy.profit} />
            </div>
          </section>

          {/* ---- Everything around the sale ---- */}
          <section id="more" className={cn(section, "pt-0 sm:pt-0")}>
            <div className={container}>
              <div className="flex flex-wrap items-end justify-between gap-6">
                <SectionHead eyebrow={copy.more.caption} title={copy.more.title} />
                <Reveal>
                  <a href="#demo" className={buttonVariants({ variant: "outline", size: "lg" })}>
                    {copy.more.cta}
                    <ArrowRightIcon className="rtl:rotate-180" />
                  </a>
                </Reveal>
              </div>
              <Stagger className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-6" step={0.1}>
                {copy.more.items.map((item, index) => {
                  const Icon = moreIcons[index % moreIcons.length];
                  // Rows of three, two, then three: the middle pair gets more room.
                  const wide = index === 3 || index === 4;
                  return (
                    <StaggerItem
                      as="article"
                      key={item.name}
                      whileHover={hoverLift}
                      className={cn(
                        "group border-border bg-card hover:border-brand/40 flex flex-col overflow-hidden rounded-lg border shadow-sm transition-[border-color,box-shadow] duration-300 hover:shadow-lg",
                        wide ? "lg:col-span-3" : "lg:col-span-2",
                      )}
                    >
                      <div className="bg-sidebar overflow-hidden p-2">
                        <ThemedImage
                          name={item.image}
                          alt={item.alt}
                          width={1600}
                          height={1200}
                          loading="lazy"
                          className="aspect-[16/10] w-full rounded-[3px] object-cover object-top transition-transform duration-700 ease-(--ease-out-expo) group-hover:scale-[1.04]"
                        />
                      </div>
                      <div className="flex flex-1 gap-4 p-5">
                        <span className="bg-brand-soft text-brand-strong dark:text-brand flex size-10 shrink-0 items-center justify-center rounded-lg">
                          <Icon className="size-5" />
                        </span>
                        <div>
                          <h3 className="text-lg font-semibold">{item.name}</h3>
                          <p className="text-muted-foreground mt-1 text-sm text-pretty">
                            {item.desc}
                          </p>
                          <ul className="mt-3 flex flex-wrap gap-1.5">
                            {item.tags.map((tag) => (
                              <li
                                key={tag}
                                className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium"
                              >
                                {tag}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </StaggerItem>
                  );
                })}
              </Stagger>
            </div>
          </section>

          {/* ---- Your team ---- */}
          <section id="team" className={cn(section, "bg-muted/40 border-border border-y")}>
            <div className={container}>
              <div className="flex flex-wrap items-end justify-between gap-6">
                <SectionHead eyebrow={copy.team.caption} title={copy.team.title} />
                <Reveal>
                  <a href="#demo" className={buttonVariants({ variant: "outline", size: "lg" })}>
                    {copy.team.cta}
                    <ArrowRightIcon className="rtl:rotate-180" />
                  </a>
                </Reveal>
              </div>
              <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" step={0.07}>
                {copy.team.cards.map((card, index) => {
                  const Icon = teamIcons[index % teamIcons.length];
                  return (
                    <StaggerItem
                      key={card.role}
                      whileHover={hoverLift}
                      className="group border-border bg-card hover:border-brand/40 relative overflow-hidden rounded-lg border p-6 shadow-xs transition-[border-color,box-shadow] duration-300 hover:shadow-md"
                    >
                      <div
                        className="bg-brand-soft absolute -end-10 -top-10 size-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                        aria-hidden
                      />
                      <div className="flex items-center justify-between gap-3">
                        <span className="bg-primary text-primary-foreground group-hover:bg-gold group-hover:text-brand-foreground flex size-11 items-center justify-center rounded-lg transition-colors duration-300">
                          <Icon className="size-5" />
                        </span>
                        <span className="text-muted-foreground text-xs font-medium tracking-[0.12em] uppercase">
                          {card.label}
                        </span>
                      </div>
                      <h3 className="mt-5 text-lg font-semibold">{card.role}</h3>
                      <p className="text-muted-foreground mt-1.5 text-pretty">{card.sees}</p>
                    </StaggerItem>
                  );
                })}
              </Stagger>
            </div>
          </section>

          {/* ---- Your data ---- */}
          <section
            id="trust"
            className="bg-carbon text-sidebar-foreground relative isolate overflow-hidden py-20 sm:py-28"
          >
            <div
              className="landing-glow text-sidebar-primary/25 animate-drift absolute -start-56 top-1/6 -z-10 size-[38rem]"
              aria-hidden
            />
            <div className={cn(container, "grid items-center gap-12 lg:grid-cols-2 lg:gap-16")}>
              <Reveal className="order-last lg:order-first">
                <figure className="border-sidebar-border bg-sidebar text-sidebar-foreground overflow-hidden rounded-lg border shadow-[0_30px_80px_-30px_color-mix(in_oklch,var(--sidebar-primary)_35%,transparent)]">
                  <TrustVisual copy={copy.trust.visual} alt={copy.trust.alt} />
                </figure>
              </Reveal>
              <div>
                <Reveal>
                  <Eyebrow className="text-sidebar-primary! dark:text-sidebar-primary!">
                    {copy.trust.caption}
                  </Eyebrow>
                  <h2 className="mt-4 text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
                    {copy.trust.title}
                  </h2>
                  <p className="text-sidebar-foreground/70 mt-4 text-base text-pretty sm:text-lg">
                    {copy.trust.body}
                  </p>
                </Reveal>
                <Stagger as="ul" className="mt-8 grid gap-3" step={0.1}>
                  {copy.trust.facts.map((fact, index) => {
                    const Icon = trustIcons[index % trustIcons.length];
                    return (
                      <StaggerItem
                        as="li"
                        key={fact}
                        className="border-sidebar-border bg-sidebar-accent/60 flex items-center gap-4 rounded-lg border p-4"
                      >
                        <span className="bg-sidebar-primary/15 text-sidebar-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                          <Icon className="size-5" />
                        </span>
                        <span className="font-medium">{fact}</span>
                      </StaggerItem>
                    );
                  })}
                </Stagger>
              </div>
            </div>
          </section>

          {/* ---- Why it matters ---- */}
          <section id="why" className={section}>
            <div
              className={cn(
                container,
                "grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16",
              )}
            >
              <div>
                <Reveal>
                  <Eyebrow>{copy.why.caption}</Eyebrow>
                </Reveal>
                <ScrollWords
                  text={copy.why.statement}
                  className="font-heading mt-6 text-2xl leading-snug font-semibold tracking-tight text-balance sm:text-3xl lg:text-4xl"
                />
              </div>
              <div className="grid min-w-0 content-end gap-6">
                <Stagger as="ul" className="grid gap-3" step={0.1}>
                  {copy.why.rules.map((rule) => (
                    <StaggerItem as="li" key={rule} className="flex items-start gap-3">
                      <span className="bg-gold text-brand-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full">
                        <CheckIcon className="size-3.5" strokeWidth={3} />
                      </span>
                      <span className="text-base font-medium">{rule}</span>
                    </StaggerItem>
                  ))}
                </Stagger>
                <Reveal delay={0.2} className="min-w-0">
                  <figure className="border-border bg-card/60 overflow-hidden rounded-lg border shadow-md">
                    <WhyVisual copy={copy.why.visual} alt={copy.why.alt} />
                  </figure>
                </Reveal>
              </div>
            </div>
          </section>

          {/* ---- Plans ---- */}
          <section id="plans" className={cn(section, "bg-muted/40 border-border border-y")}>
            <div className={container}>
              <SectionHead
                eyebrow={copy.plans.caption}
                title={copy.plans.title}
                intro={copy.plans.intro}
                center
              />
              <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" step={0.1}>
                {copy.plans.items.map((plan, index) => {
                  const featured = index === 1;
                  return (
                    <StaggerItem
                      key={plan.name}
                      whileHover={hoverLift}
                      className={cn(
                        "relative flex flex-col rounded-lg border p-6 transition-shadow duration-300 hover:shadow-lg",
                        featured
                          ? "bg-carbon text-sidebar-foreground border-sidebar-primary/50 shadow-[0_24px_60px_-24px_color-mix(in_oklch,var(--sidebar-primary)_45%,transparent)]"
                          : "border-border bg-card shadow-xs",
                      )}
                    >
                      {featured ? (
                        <span className="bg-gold text-brand-foreground absolute start-6 -top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold">
                          <SparklesIcon className="size-3" />
                          {copy.plans.popular}
                        </span>
                      ) : null}
                      <h3 className="text-xl font-semibold">{plan.name}</h3>
                      <p
                        className={cn(
                          "mt-1 text-sm lg:min-h-10",
                          featured ? "text-sidebar-foreground/65" : "text-muted-foreground",
                        )}
                      >
                        {plan.desc}
                      </p>
                      <dl
                        className={cn(
                          "mt-6 grid grid-cols-2 gap-3 border-y py-5",
                          featured ? "border-sidebar-border" : "border-border",
                        )}
                      >
                        {(
                          [
                            [copy.plans.users, plan.users],
                            [copy.plans.branches, plan.branches],
                            [copy.plans.vehicles, plan.vehicles],
                            [copy.plans.storage, plan.storage],
                          ] as const
                        ).map(([name, value]) => (
                          <div key={name}>
                            <dt
                              className={cn(
                                "text-xs",
                                featured ? "text-sidebar-foreground/55" : "text-muted-foreground",
                              )}
                            >
                              {name}
                            </dt>
                            <dd
                              className={cn(
                                "font-heading mt-0.5 font-semibold",
                                !value && "text-brand-strong dark:text-brand",
                                featured && !value && "text-sidebar-primary",
                              )}
                              dir={value ? "ltr" : undefined}
                            >
                              {value || copy.plans.unlimited}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <ul className="mt-5 grid flex-1 content-start gap-2.5 text-sm">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2">
                            <CheckIcon
                              className={cn(
                                "mt-0.5 size-4 shrink-0",
                                featured
                                  ? "text-sidebar-primary"
                                  : "text-brand-strong dark:text-brand",
                              )}
                            />
                            {feature}
                          </li>
                        ))}
                      </ul>
                      <a
                        href="#demo"
                        className={cn(
                          buttonVariants({ variant: featured ? "brand" : "outline", size: "lg" }),
                          "mt-6 w-full",
                          featured && "sheen",
                        )}
                      >
                        {copy.plans.cta}
                      </a>
                    </StaggerItem>
                  );
                })}
              </Stagger>
            </div>
          </section>

          {/* ---- Questions ---- */}
          <section id="faq" className={section}>
            <div
              className={cn(
                container,
                "grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16",
              )}
            >
              <div className="lg:sticky lg:top-28 lg:self-start">
                <SectionHead eyebrow={copy.faq.caption} title={copy.faq.title} />
              </div>
              <FaqList items={copy.faq.items} />
            </div>
          </section>

          {/* ---- Book a demo ---- */}
          <section id="demo" className="scroll-mt-20 px-3 pb-20 sm:px-4 sm:pb-28">
            <div className="bg-carbon text-sidebar-foreground relative isolate mx-auto max-w-6xl overflow-hidden rounded-lg px-5 py-14 sm:px-10 sm:py-16 lg:px-14">
              <div
                className="landing-glow text-sidebar-primary/30 animate-drift absolute -end-48 -top-48 -z-10 size-[36rem]"
                aria-hidden
              />
              <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
                <div>
                  <Reveal>
                    <Eyebrow className="text-sidebar-primary! dark:text-sidebar-primary!">
                      {copy.demo.caption}
                    </Eyebrow>
                    <h2 className="text-gold mt-4 pb-1 text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
                      {copy.demo.title}
                    </h2>
                    <p className="text-sidebar-foreground/70 mt-4 text-base text-pretty sm:text-lg">
                      {copy.demo.body}
                    </p>
                  </Reveal>
                  <Reveal delay={0.1}>
                    <p className="text-sidebar-foreground/50 mt-10 text-xs font-semibold tracking-[0.14em] uppercase">
                      {copy.demo.nextTitle}
                    </p>
                  </Reveal>
                  <Stagger as="ol" className="mt-4 grid gap-4" step={0.12}>
                    {copy.demo.next.map((step, index) => (
                      <StaggerItem as="li" key={step.title} className="flex gap-4">
                        <span className="border-sidebar-primary/40 text-sidebar-primary font-heading flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold">
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-semibold">{step.title}</p>
                          <p className="text-sidebar-foreground/60 text-sm">{step.text}</p>
                        </div>
                      </StaggerItem>
                    ))}
                  </Stagger>
                  <Reveal delay={0.2} className="text-sidebar-foreground/60 mt-10 text-sm">
                    {copy.demo.account}{" "}
                    <Link
                      href="/login"
                      className="text-sidebar-primary font-medium underline-offset-4 hover:underline"
                    >
                      {copy.demo.signIn}
                    </Link>
                  </Reveal>
                </div>
                <Reveal delay={0.1}>
                  <div className="bg-card text-card-foreground relative rounded-lg p-5 shadow-lg sm:p-7">
                    <DemoForm copy={copy.demo} />
                  </div>
                </Reveal>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-border border-t">
          <div
            className={cn(
              container,
              "grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]",
            )}
          >
            <div>
              <BrandMark className="[&_img]:h-10" />
              <p className="text-muted-foreground mt-3 max-w-xs text-sm">{copy.footer.tagline}</p>
            </div>
            <FooterColumn title={copy.footer.product}>
              {[
                { href: "#features", text: copy.nav.features },
                { href: "#how", text: copy.nav.how },
                { href: "#profit", text: copy.nav.profit },
                { href: "#plans", text: copy.nav.plans },
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.text}
                </a>
              ))}
            </FooterColumn>
            <FooterColumn title={copy.footer.account}>
              <Link
                href="/login"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {copy.footer.signIn}
              </Link>
              <a
                href="#demo"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {copy.nav.demo}
              </a>
            </FooterColumn>
            <FooterColumn title={copy.footer.language}>
              <Link
                href="/"
                locale={otherLocale}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {copy.nav.otherLanguage}
              </Link>
            </FooterColumn>
          </div>
          <div className="border-border border-t">
            <div
              className={cn(
                container,
                "text-muted-foreground flex flex-wrap justify-between gap-2 py-6 text-xs",
              )}
            >
              <p>{copy.footer.rights}</p>
              <p>{copy.footer.made}</p>
            </div>
          </div>
        </footer>
      </div>
    </LandingMotionConfig>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-2.5 text-sm">
      <p className="text-foreground text-xs font-semibold tracking-[0.14em] uppercase">{title}</p>
      {children}
    </div>
  );
}
