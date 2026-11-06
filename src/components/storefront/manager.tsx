"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BarChart3Icon,
  CarFrontIcon,
  CopyIcon,
  GlobeIcon,
  HourglassIcon,
  InboxIcon,
  PaletteIcon,
  UsersIcon,
  ExternalLinkIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";

import { KpiCard } from "@/components/cards/kpi-card";
import { FormField } from "@/components/forms/form-field";
import { PageHeader } from "@/components/layout/page-header";
import { ActionDialog, SimpleSelect } from "@/components/platform/platform-ui";
import { DataTableClient } from "@/components/storefront/data-table-client";
import { useAction } from "@/components/storefront/use-action";
import { VehiclesPanel } from "@/components/storefront/vehicles-panel";
import { LoadingButton } from "@/components/shared/loading-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { AppLocale } from "@/config/app";
import { Link, useRouter } from "@/lib/i18n/navigation";
import {
  assetUrl,
  MAX_PROMOS,
  SECTION_KEYS,
  SOCIAL_KEYS,
  type SectionKey,
  type StorefrontConfig,
} from "@/lib/storefront/config";
import { verificationRecordName, verificationValue } from "@/lib/storefront/domain-rules";
import type {
  Analytics,
  ManagedDomain,
  ManagedEnquiry,
  ManagedVehicle,
} from "@/lib/storefront/manage";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";

const API = "/api/dealership-storefront";

type Props = {
  status: "draft" | "published" | "unpublished";
  publishedAt: string | null;
  platformDisabled: boolean;
  platformDisabledReason: string | null;
  draft: StorefrontConfig;
  address: string | null;
  cnameTarget: string | null;
  currency: string;
  vehicles: ManagedVehicle[];
  /** False until migration 00085 adds listing text to the database. */
  detailsReady: boolean;
  domains: ManagedDomain[];
  enquiries: ManagedEnquiry[];
  analytics: Analytics | null;
  salespeople: { id: string; name: string }[];
  canCustomDomain: boolean;
  canBooking: boolean;
  canAnalytics: boolean;
};

export function StorefrontManager(props: Props) {
  const t = useTranslations("storefrontAdmin");
  const publishing = useAction();
  const newEnquiries = props.enquiries.filter((e) => e.status === "new").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            {/* Its own tab, so the preview shows the website alone, without the dashboard around it. */}
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/storefront-preview" target="_blank" rel="noopener" />}
            >
              {t("preview")}
              <ExternalLinkIcon aria-hidden />
            </Button>
            {props.status === "published" ? (
              <Button
                variant="outline"
                disabled={publishing.pending}
                onClick={() =>
                  void publishing.run(`${API}/publish`, "POST", { action: "unpublish" })
                }
              >
                {t("unpublish")}
              </Button>
            ) : null}
            <LoadingButton
              loading={publishing.pending}
              disabled={props.platformDisabled}
              onClick={() => void publishing.run(`${API}/publish`, "POST", { action: "publish" })}
            >
              {t(props.status === "published" ? "publishChanges" : "publish")}
            </LoadingButton>
          </>
        }
      />

      <SiteOverview {...props} newEnquiries={newEnquiries} />

      {props.platformDisabled ? (
        <Alert variant="destructive">
          <AlertDescription>
            {t("platformDisabled")}
            {props.platformDisabledReason ? ` ${props.platformDisabledReason}` : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="design">
        {/* One row that scrolls sideways on phones, rather than wrapping into two. */}
        <div className="-mx-4 [scrollbar-width:none] overflow-x-auto px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <TabsList className="h-auto w-max">
            <TabsTrigger value="design">
              <PaletteIcon aria-hidden />
              {t("tabs.design")}
            </TabsTrigger>
            <TabsTrigger value="vehicles">
              <CarFrontIcon aria-hidden />
              {t("tabs.vehicles")}
              <TabCount value={props.vehicles.filter((v) => v.live).length} />
            </TabsTrigger>
            <TabsTrigger value="enquiries">
              <InboxIcon aria-hidden />
              {t("tabs.enquiries")}
              <TabCount value={newEnquiries} highlight />
            </TabsTrigger>
            <TabsTrigger value="domains">
              <GlobeIcon aria-hidden />
              {t("tabs.domains")}
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3Icon aria-hidden />
              {t("tabs.analytics")}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="design" className="pt-4">
          <DesignTab draft={props.draft} vehicles={props.vehicles} />
        </TabsContent>
        <TabsContent value="vehicles" className="pt-4">
          <VehiclesPanel
            vehicles={props.vehicles}
            currency={props.currency}
            detailsReady={props.detailsReady}
          />
        </TabsContent>
        <TabsContent value="enquiries" className="pt-4">
          <EnquiriesTab
            enquiries={props.enquiries}
            salespeople={props.salespeople}
            canBooking={props.canBooking}
          />
        </TabsContent>
        <TabsContent value="domains" className="pt-4">
          <DomainsTab
            domains={props.domains}
            canCustomDomain={props.canCustomDomain}
            cnameTarget={props.cnameTarget}
          />
        </TabsContent>
        <TabsContent value="analytics" className="pt-4">
          <AnalyticsTab analytics={props.analytics} canAnalytics={props.canAnalytics} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TabCount({ value, highlight = false }: { value: number; highlight?: boolean }) {
  if (!value) return null;
  return (
    <span
      className={cn(
        "rounded-full px-1.5 text-[11px] leading-5 font-semibold tabular-nums",
        highlight ? "bg-gold text-brand-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {value}
    </span>
  );
}

/** Where the site stands at a glance: live or not, its address, and the numbers that matter. */
function SiteOverview(props: Props & { newEnquiries: number }) {
  const t = useTranslations("storefrontAdmin");
  const locale = useLocale() as AppLocale;
  const live = props.status === "published" && !props.platformDisabled;
  const onSite = props.vehicles.filter((v) => v.live).length;
  const waiting = props.vehicles.filter((v) => v.published && !v.live).length;
  const url = props.address ? `https://${props.address}` : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)]">
      <div className="bg-carbon text-sidebar-foreground relative isolate overflow-hidden rounded-lg p-5">
        <div
          className={cn(
            "absolute -end-16 -top-16 -z-10 size-48 rounded-full blur-3xl",
            live ? "bg-sidebar-primary/30" : "bg-chrome/15",
          )}
          aria-hidden
        />
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="relative flex size-2.5">
            {live ? (
              <span className="animate-ping-soft absolute inline-flex size-full rounded-full bg-emerald-400" />
            ) : null}
            <span
              className={cn(
                "relative inline-flex size-2.5 rounded-full",
                live ? "bg-emerald-400" : "bg-sidebar-foreground/40",
              )}
            />
          </span>
          {props.platformDisabled ? t("overview.offline") : t(`status.${props.status}`)}
        </div>
        <p className="text-sidebar-foreground/60 mt-1 text-xs">
          {live && props.publishedAt
            ? t("overview.publishedOn", { date: formatDate(props.publishedAt, locale) })
            : t("overview.notLive")}
        </p>
        <div className="border-sidebar-border bg-sidebar-accent/60 mt-5 flex items-center gap-2 rounded-md border p-2 ps-3">
          <GlobeIcon className="text-sidebar-primary size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm" dir="ltr">
            {props.address ?? t("noBaseDomain")}
          </span>
          {url ? (
            <>
              <Button
                size="icon-sm"
                variant="ghost"
                className="hover:bg-sidebar-accent text-sidebar-foreground"
                aria-label={t("overview.copy")}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(url)
                    .then(() => toast.success(t("overview.copied")));
                }}
              >
                <CopyIcon aria-hidden />
              </Button>
              {live ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="hover:bg-sidebar-accent text-sidebar-foreground"
                  aria-label={t("overview.open")}
                  nativeButton={false}
                  render={<a href={url} target="_blank" rel="noopener noreferrer" />}
                >
                  <ExternalLinkIcon aria-hidden />
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard
          label={t("overview.onSite")}
          value={formatNumber(onSite, locale)}
          icon={GlobeIcon}
          tone="success"
        />
        <KpiCard
          label={t("overview.waiting")}
          value={formatNumber(waiting, locale)}
          icon={HourglassIcon}
          tone="warning"
        />
        <KpiCard
          label={t("overview.newEnquiries")}
          value={formatNumber(props.newEnquiries, locale)}
          icon={InboxIcon}
          tone="brand"
        />
        <KpiCard
          label={t("overview.visitors")}
          value={props.analytics ? formatNumber(props.analytics.visitors, locale) : "—"}
          icon={UsersIcon}
          tone="info"
          hint={props.analytics ? undefined : t("overview.visitorsLocked")}
        />
      </div>
    </div>
  );
}

function ImageField({
  kind,
  label,
  path,
  onChange,
}: {
  kind: "logo" | "banner";
  label: string;
  path: string | null;
  onChange: (path: string | null) => void;
}) {
  const t = useTranslations("storefrontAdmin");
  const [pending, setPending] = useState(false);
  const url = assetUrl(path);
  async function upload(file: File) {
    setPending(true);
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    const response = await fetch(`${API}/assets`, {
      method: "POST",
      body: form,
      credentials: "same-origin",
    });
    const json = await response.json().catch(() => null);
    setPending(false);
    if (response.ok && json?.data?.path) onChange(json.data.path);
    else toast.error(json?.message ?? t("failed"));
  }
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- the dealership's own public image
        <img src={url} alt="" className="bg-muted h-24 w-full rounded-md object-contain" />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <label className="border-input hover:bg-muted inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm">
          <UploadIcon className="size-4" aria-hidden />
          {pending ? t("uploading") : t("upload")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={pending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
        </label>
        {path ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            {t("remove")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function DesignTab({ draft, vehicles }: { draft: StorefrontConfig; vehicles: ManagedVehicle[] }) {
  const t = useTranslations("storefrontAdmin");
  const router = useRouter();
  const [config, setConfig] = useState(draft);
  const [pending, setPending] = useState(false);
  const set = <K extends keyof StorefrontConfig>(key: K, value: StorefrontConfig[K]) =>
    setConfig((current) => ({ ...current, [key]: value }));

  // Every section appears, in the saved order, with any new ones at the end.
  const sections = useMemo(() => {
    const saved = config.sections.filter((s) => SECTION_KEYS.includes(s.key));
    const missing = SECTION_KEYS.filter((key) => !saved.some((s) => s.key === key)).map((key) => ({
      key,
      enabled: false,
    }));
    return [...saved, ...missing];
  }, [config.sections]);
  const move = (index: number, by: number) => {
    const next = [...sections];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    set("sections", next);
  };
  const toggleSection = (key: SectionKey, enabled: boolean) =>
    set(
      "sections",
      sections.map((s) => (s.key === key ? { ...s, enabled } : s)),
    );
  const listed = vehicles.filter((v) => v.live);

  async function save() {
    setPending(true);
    const response = await fetch(API, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    const json = await response.json().catch(() => null);
    setPending(false);
    if (response.ok) {
      toast.success(t("draftSaved"));
      router.refresh();
    } else {
      toast.error(json?.message ?? t("failed"));
    }
  }

  const localized = (field: "headline" | "tagline" | "about", label: string, multiline = false) => {
    const Control = multiline ? Textarea : Input;
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {(["en", "ar"] as const).map((language) => (
          <FormField
            key={language}
            label={`${label} (${t(`languages.${language}`)})`}
            htmlFor={`${field}-${language}`}
          >
            <Control
              id={`${field}-${language}`}
              dir={language === "ar" ? "rtl" : "ltr"}
              value={config[field][language] ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                set(field, { ...config[field], [language]: e.target.value })
              }
            />
          </FormField>
        ))}
      </div>
    );
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("design.branding")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ImageField
            kind="logo"
            label={t("design.logo")}
            path={config.logoPath}
            onChange={(path) => set("logoPath", path)}
          />
          <ImageField
            kind="banner"
            label={t("design.banner")}
            path={config.bannerPath}
            onChange={(path) => set("bannerPath", path)}
          />
          <FormField label={t("design.primaryColor")} htmlFor="c-primary">
            <Input
              id="c-primary"
              type="color"
              value={config.primaryColor}
              onChange={(e) => set("primaryColor", e.target.value)}
            />
          </FormField>
          <FormField label={t("design.accentColor")} htmlFor="c-accent">
            <Input
              id="c-accent"
              type="color"
              value={config.accentColor}
              onChange={(e) => set("accentColor", e.target.value)}
            />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("design.content")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {localized("headline", t("design.headline"))}
          {localized("tagline", t("design.tagline"))}
          {localized("about", t("design.about"), true)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("design.sections")}</CardTitle>
          <CardDescription>{t("design.sectionsHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2">
            {sections.map((section, index) => (
              <li key={section.key} className="flex items-center gap-3 text-sm">
                <Switch
                  checked={section.enabled}
                  onCheckedChange={(checked) => toggleSection(section.key, checked)}
                  aria-label={t(`design.section.${section.key}`)}
                />
                <span className="flex-1">{t(`design.section.${section.key}`)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === 0}
                  aria-label={t("design.moveUp")}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === sections.length - 1}
                  aria-label={t("design.moveDown")}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDownIcon />
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("design.featured")}</CardTitle>
          <CardDescription>{t("design.featuredHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {listed.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("design.noListed")}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {listed.map((vehicle) => (
                <li key={vehicle.id}>
                  <label className="flex items-center gap-3 text-sm">
                    <Switch
                      checked={config.featuredStockNumbers.includes(vehicle.stockNumber)}
                      disabled={
                        !config.featuredStockNumbers.includes(vehicle.stockNumber) &&
                        config.featuredStockNumbers.length >= 12
                      }
                      onCheckedChange={(checked) =>
                        set(
                          "featuredStockNumbers",
                          checked
                            ? [...config.featuredStockNumbers, vehicle.stockNumber]
                            : config.featuredStockNumbers.filter(
                                (stock) => stock !== vehicle.stockNumber,
                              ),
                        )
                      }
                    />
                    {vehicle.title} · {vehicle.stockNumber}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("design.promos")}</CardTitle>
          <CardDescription>{t("design.promosHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {config.promos.map((promo, index) => {
            const update = (next: Partial<(typeof config.promos)[number]>) =>
              set(
                "promos",
                config.promos.map((item, position) =>
                  position === index ? { ...item, ...next } : item,
                ),
              );
            return (
              <fieldset
                key={index}
                className="border-border grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
              >
                <legend className="px-1 text-sm font-semibold">
                  {t("design.promoNumber", { number: index + 1 })}
                </legend>
                {(["en", "ar"] as const).map((language) => (
                  <div key={language} className="grid gap-4">
                    <FormField
                      label={`${t("design.promoTitle")} (${t(`languages.${language}`)})`}
                      htmlFor={`p-t-${index}-${language}`}
                    >
                      <Input
                        id={`p-t-${index}-${language}`}
                        dir={language === "ar" ? "rtl" : "ltr"}
                        maxLength={80}
                        value={promo.title[language] ?? ""}
                        onChange={(e) =>
                          update({ title: { ...promo.title, [language]: e.target.value } })
                        }
                      />
                    </FormField>
                    <FormField
                      label={`${t("design.promoText")} (${t(`languages.${language}`)})`}
                      htmlFor={`p-x-${index}-${language}`}
                    >
                      <Textarea
                        id={`p-x-${index}-${language}`}
                        dir={language === "ar" ? "rtl" : "ltr"}
                        rows={2}
                        maxLength={200}
                        value={promo.text[language] ?? ""}
                        onChange={(e) =>
                          update({ text: { ...promo.text, [language]: e.target.value } })
                        }
                      />
                    </FormField>
                  </div>
                ))}
                <FormField
                  label={t("design.promoLink")}
                  htmlFor={`p-l-${index}`}
                  hint={t("design.promoLinkHint")}
                >
                  <Input
                    id={`p-l-${index}`}
                    dir="ltr"
                    placeholder="/vehicles?body=suv"
                    value={promo.href ?? ""}
                    onChange={(e) => update({ href: e.target.value })}
                  />
                </FormField>
                <div className="flex items-end justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      set(
                        "promos",
                        config.promos.filter((_, position) => position !== index),
                      )
                    }
                  >
                    <Trash2Icon aria-hidden />
                    {t("design.removePromo")}
                  </Button>
                </div>
              </fieldset>
            );
          })}
          {config.promos.length < MAX_PROMOS ? (
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() => set("promos", [...config.promos, { title: {}, text: {}, href: "" }])}
            >
              <PlusIcon aria-hidden />
              {t("design.addPromo")}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("design.contact")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("design.phone")} htmlFor="c-phone">
            <Input
              id="c-phone"
              dir="ltr"
              value={config.contact.phone ?? ""}
              onChange={(e) => set("contact", { ...config.contact, phone: e.target.value })}
            />
          </FormField>
          <FormField label={t("design.whatsapp")} htmlFor="c-whatsapp">
            <Input
              id="c-whatsapp"
              dir="ltr"
              value={config.contact.whatsapp ?? ""}
              onChange={(e) => set("contact", { ...config.contact, whatsapp: e.target.value })}
            />
          </FormField>
          <FormField label={t("design.email")} htmlFor="c-email">
            <Input
              id="c-email"
              type="email"
              value={config.contact.email ?? ""}
              onChange={(e) => set("contact", { ...config.contact, email: e.target.value })}
            />
          </FormField>
          <FormField label={t("design.address")} htmlFor="c-address">
            <Input
              id="c-address"
              value={config.contact.address?.en ?? ""}
              onChange={(e) =>
                set("contact", {
                  ...config.contact,
                  address: { ...config.contact.address, en: e.target.value },
                })
              }
            />
          </FormField>
          <FormField label={t("design.addressAr")} htmlFor="c-address-ar">
            <Input
              id="c-address-ar"
              dir="rtl"
              value={config.contact.address?.ar ?? ""}
              onChange={(e) =>
                set("contact", {
                  ...config.contact,
                  address: { ...config.contact.address, ar: e.target.value },
                })
              }
            />
          </FormField>
          <FormField label={t("design.hours")} htmlFor="c-hours" hint={t("design.hoursHint")}>
            <Textarea
              id="c-hours"
              rows={2}
              maxLength={200}
              value={config.contact.hours?.en ?? ""}
              onChange={(e) =>
                set("contact", {
                  ...config.contact,
                  hours: { ...config.contact.hours, en: e.target.value },
                })
              }
            />
          </FormField>
          <FormField label={t("design.hoursAr")} htmlFor="c-hours-ar">
            <Textarea
              id="c-hours-ar"
              dir="rtl"
              rows={2}
              maxLength={200}
              value={config.contact.hours?.ar ?? ""}
              onChange={(e) =>
                set("contact", {
                  ...config.contact,
                  hours: { ...config.contact.hours, ar: e.target.value },
                })
              }
            />
          </FormField>
          <FormField label={t("design.mapUrl")} htmlFor="c-map" hint={t("design.mapHint")}>
            <Input
              id="c-map"
              type="url"
              dir="ltr"
              value={config.contact.mapUrl ?? ""}
              onChange={(e) => set("contact", { ...config.contact, mapUrl: e.target.value })}
            />
          </FormField>
          {SOCIAL_KEYS.map((key) => (
            <FormField
              key={key}
              label={t(`design.social.${key}`)}
              htmlFor={`s-${key}`}
              hint={key === "instagram" ? t("design.socialHint") : undefined}
            >
              <Input
                id={`s-${key}`}
                type="url"
                dir="ltr"
                value={config.social[key] ?? ""}
                onChange={(e) => set("social", { ...config.social, [key]: e.target.value })}
              />
            </FormField>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("design.seo")}</CardTitle>
          <CardDescription>{t("design.seoHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {(["en", "ar"] as const).map((language) => (
            <div key={language} className="grid gap-4">
              <FormField
                label={`${t("design.seoTitle")} (${t(`languages.${language}`)})`}
                htmlFor={`seo-t-${language}`}
              >
                <Input
                  id={`seo-t-${language}`}
                  dir={language === "ar" ? "rtl" : "ltr"}
                  maxLength={70}
                  value={config.seo.title?.[language] ?? ""}
                  onChange={(e) =>
                    set("seo", {
                      ...config.seo,
                      title: { ...config.seo.title, [language]: e.target.value },
                    })
                  }
                />
              </FormField>
              <FormField
                label={`${t("design.seoDescription")} (${t(`languages.${language}`)})`}
                htmlFor={`seo-d-${language}`}
              >
                <Textarea
                  id={`seo-d-${language}`}
                  dir={language === "ar" ? "rtl" : "ltr"}
                  maxLength={170}
                  value={config.seo.description?.[language] ?? ""}
                  onChange={(e) =>
                    set("seo", {
                      ...config.seo,
                      description: { ...config.seo.description, [language]: e.target.value },
                    })
                  }
                />
              </FormField>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <LoadingButton loading={pending} onClick={() => void save()}>
          {t("saveDraft")}
        </LoadingButton>
      </div>
    </div>
  );
}

function ConfirmBookingDialog({
  enquiry,
  salespeople,
}: {
  enquiry: ManagedEnquiry;
  salespeople: { id: string; name: string }[];
}) {
  const t = useTranslations("storefrontAdmin");
  const { run, pending, error } = useAction();
  const [sellingPrice, setPrice] = useState(String(enquiry.quoted_price ?? ""));
  const [deposit, setDeposit] = useState("0");
  const [salespersonId, setSalesperson] = useState(salespeople[0]?.id ?? "");
  return (
    <ActionDialog
      trigger={<Button size="sm">{t("enquiries.confirm")}</Button>}
      title={t("enquiries.confirm")}
      description={t("enquiries.confirmHint")}
      submitLabel={t("enquiries.confirm")}
      error={error}
      pending={pending}
      onSubmit={() =>
        run(`${API}/enquiries/${enquiry.id}/booking`, "POST", {
          sellingPrice: Number(sellingPrice),
          deposit: Number(deposit),
          salespersonId: salespersonId || undefined,
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("enquiries.sellingPrice")} htmlFor="b-price" required>
          <Input
            id="b-price"
            type="number"
            min="0"
            step="0.01"
            required
            value={sellingPrice}
            onChange={(e) => setPrice(e.target.value)}
          />
        </FormField>
        <FormField label={t("enquiries.deposit")} htmlFor="b-deposit">
          <Input
            id="b-deposit"
            type="number"
            min="0"
            step="0.01"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
          />
        </FormField>
      </div>
      {salespeople.length > 0 ? (
        <FormField label={t("enquiries.salesperson")} htmlFor="b-person" required>
          <SimpleSelect
            id="b-person"
            value={salespersonId}
            onChange={setSalesperson}
            options={salespeople.map((p) => ({ value: p.id, label: p.name }))}
          />
        </FormField>
      ) : null}
    </ActionDialog>
  );
}

function EnquiriesTab({
  enquiries,
  salespeople,
  canBooking,
}: {
  enquiries: ManagedEnquiry[];
  salespeople: { id: string; name: string }[];
  canBooking: boolean;
}) {
  const t = useTranslations("storefrontAdmin");
  const locale = useLocale() as AppLocale;
  const { run } = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("enquiries.title")}</CardTitle>
        <CardDescription>{t("enquiries.hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTableClient
          empty={t("enquiries.none")}
          headers={[
            t("enquiries.when"),
            t("enquiries.who"),
            t("enquiries.car"),
            t("enquiries.kind"),
            t("enquiries.message"),
            t("enquiries.status"),
            "",
          ]}
          rows={enquiries.map((enquiry) => ({
            key: enquiry.id,
            cells: [
              formatDate(enquiry.created_at, locale),
              <div key="w" className="grid">
                <span className="font-medium">
                  {enquiry.first_name} {enquiry.last_name}
                </span>
                <a
                  href={`tel:${enquiry.phone}`}
                  dir="ltr"
                  className="text-muted-foreground text-start hover:underline"
                >
                  {enquiry.phone}
                </a>
                {enquiry.email ? (
                  <a
                    href={`mailto:${enquiry.email}`}
                    className="text-muted-foreground hover:underline"
                  >
                    {enquiry.email}
                  </a>
                ) : null}
              </div>,
              enquiry.vehicles
                ? `${enquiry.vehicles.year} ${enquiry.vehicles.make} ${enquiry.vehicles.model}`
                : t("enquiries.general"),
              t(`enquiries.kinds.${enquiry.kind}`),
              <span key="m" className="block max-w-64 whitespace-pre-line">
                {enquiry.message ?? "—"}
              </span>,
              enquiry.status === "converted" ? (
                t("enquiries.statuses.converted")
              ) : (
                <SimpleSelect
                  key="st"
                  id={`status-${enquiry.id}`}
                  value={enquiry.status}
                  onChange={(status) =>
                    void run(`${API}/enquiries/${enquiry.id}`, "PATCH", { status })
                  }
                  options={(["new", "contacted", "closed"] as const).map((value) => ({
                    value,
                    label: t(`enquiries.statuses.${value}`),
                  }))}
                />
              ),
              enquiry.kind === "booking_request" && enquiry.status !== "converted" && canBooking ? (
                <ConfirmBookingDialog key="c" enquiry={enquiry} salespeople={salespeople} />
              ) : null,
            ],
          }))}
        />
      </CardContent>
    </Card>
  );
}

function DomainsTab({
  domains,
  canCustomDomain,
  cnameTarget,
}: {
  domains: ManagedDomain[];
  canCustomDomain: boolean;
  cnameTarget: string | null;
}) {
  const t = useTranslations("storefrontAdmin");
  const { run, pending, error } = useAction();
  const [domain, setDomain] = useState("");
  const copy = (value: string) =>
    void navigator.clipboard?.writeText(value).then(() => toast.success(t("domains.copied")));

  if (!canCustomDomain) {
    return (
      <Alert>
        <AlertDescription>{t("domains.notOnPlan")}</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("domains.title")}</CardTitle>
          <CardDescription>{t("domains.hint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await run(`${API}/domains`, "POST", { domain })) setDomain("");
            }}
          >
            <FormField label={t("domains.domain")} htmlFor="d-new">
              <Input
                id="d-new"
                dir="ltr"
                required
                placeholder="cars.example.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
            </FormField>
            <LoadingButton type="submit" loading={pending}>
              {t("domains.add")}
            </LoadingButton>
          </form>
          {error ? <p className="text-destructive mt-2 text-sm">{error}</p> : null}
        </CardContent>
      </Card>
      {domains.map((row) => (
        <Card key={row.id}>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle dir="ltr">{row.domain}</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                status={
                  row.verification_status === "verified"
                    ? "approved"
                    : row.verification_status === "failed"
                      ? "rejected"
                      : "draft"
                }
                label={t(`domains.verification.${row.verification_status}`)}
              />
              <StatusBadge
                status={
                  row.ssl_status === "active"
                    ? "approved"
                    : row.ssl_status === "failed"
                      ? "rejected"
                      : "draft"
                }
                label={t(`domains.ssl.${row.ssl_status}`)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => void run(`${API}/domains/${row.id}`, "POST")}
              >
                <RefreshCwIcon />
                {t("domains.check")}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("domains.remove")}
                onClick={() => void run(`${API}/domains/${row.id}`, "DELETE")}
              >
                <Trash2Icon />
              </Button>
            </div>
          </CardHeader>
          {row.verification_status === "verified" ? null : (
            <CardContent className="grid gap-3 text-sm">
              {row.last_error ? (
                <p className="text-destructive">
                  {t(
                    `domains.errors.${row.last_error === "claimed_by_another" ? "claimed" : "missing"}`,
                  )}
                </p>
              ) : null}
              <p>{t("domains.instructions")}</p>
              <dl className="grid gap-2" dir="ltr">
                {[
                  [
                    "TXT",
                    verificationRecordName(row.domain),
                    verificationValue(row.verification_token),
                  ],
                  ...(cnameTarget ? [["CNAME", row.domain, cnameTarget]] : []),
                ].map(([type, name, value]) => (
                  <div
                    key={type}
                    className="bg-muted flex flex-wrap items-center gap-2 rounded-md p-2 font-mono text-xs"
                  >
                    <span className="font-semibold">{type}</span>
                    <span className="break-all">{name}</span>
                    <span className="break-all">{value}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="ms-auto size-7"
                      aria-label={t("domains.copy")}
                      onClick={() => copy(value)}
                    >
                      <CopyIcon />
                    </Button>
                  </div>
                ))}
              </dl>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

function AnalyticsTab({
  analytics,
  canAnalytics,
}: {
  analytics: Analytics | null;
  canAnalytics: boolean;
}) {
  const t = useTranslations("storefrontAdmin");
  const locale = useLocale() as AppLocale;
  if (!canAnalytics || !analytics) {
    return (
      <Alert>
        <AlertDescription>{t("analytics.notOnPlan")}</AlertDescription>
      </Alert>
    );
  }
  const n = (value: number) => formatNumber(Number(value), locale);
  const asked = Number(analytics.enquiries) + Number(analytics.bookingRequests);
  const rate =
    Number(analytics.visitors) > 0
      ? Math.round((asked / Number(analytics.visitors)) * 1000) / 10
      : 0;
  return (
    <div className="grid gap-6">
      <p className="text-muted-foreground text-sm">{t("analytics.period")}</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label={t("analytics.visitors")} value={n(analytics.visitors)} />
        <KpiCard label={t("analytics.pageViews")} value={n(analytics.pageViews)} />
        <KpiCard label={t("analytics.vehicleViews")} value={n(analytics.vehicleViews)} />
        <KpiCard
          label={t("analytics.enquiries")}
          value={n(analytics.enquiries)}
          hint={t("analytics.rate", { rate })}
        />
        <KpiCard label={t("analytics.bookingRequests")} value={n(analytics.bookingRequests)} />
        <KpiCard
          label={t("analytics.conversions")}
          value={n(analytics.conversions)}
          hint={t("analytics.conversionsHint")}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("analytics.topVehicles")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTableClient
            empty={t("analytics.none")}
            headers={[t("vehicles.car"), t("vehicles.reference"), t("analytics.vehicleViews")]}
            rows={analytics.topVehicles.map((row) => ({
              key: row.stockNumber,
              cells: [row.title, row.stockNumber, n(row.views)],
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
