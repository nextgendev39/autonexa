"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CarFrontIcon,
  CircleDotIcon,
  EyeIcon,
  EyeOffIcon,
  FileTextIcon,
  GlobeIcon,
  HourglassIcon,
  PencilIcon,
  RotateCcwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { FormField } from "@/components/forms/form-field";
import { NativeSelect } from "@/components/inventory/native-select";
import { ActionDialog, platformRequest } from "@/components/platform/platform-ui";
import { useAction } from "@/components/storefront/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { AppLocale } from "@/config/app";
import { useRouter } from "@/lib/i18n/navigation";
import type { ManagedVehicle } from "@/lib/storefront/manage";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/utils/currency";

const API = "/api/dealership-storefront";

const STATUS_LABELS = new Set([
  "ready_for_sale",
  "reserved",
  "acquired",
  "under_inspection",
  "inspection_failed",
  "under_repair",
  "returned",
]);

type Visibility = "all" | "live" | "waiting" | "hidden";
type Stage = "all" | "ready_for_sale" | "reserved" | "preparing";
type Details = "all" | "with" | "without";
type Sort = "newest" | "oldest" | "price_desc" | "price_asc" | "name";

const visibilityOf = (vehicle: ManagedVehicle): Exclude<Visibility, "all"> =>
  vehicle.live ? "live" : vehicle.published ? "waiting" : "hidden";

function ListingDetailsDialog({ vehicle }: { vehicle: ManagedVehicle }) {
  const t = useTranslations("storefrontAdmin");
  const { run, pending, error } = useAction();
  const [description, setDescription] = useState(vehicle.description ?? "");
  const [features, setFeatures] = useState(vehicle.features.join("\n"));
  return (
    <ActionDialog
      trigger={
        <Button size="sm" variant="outline">
          <PencilIcon aria-hidden />
          {t("vehicles.edit")}
        </Button>
      }
      title={t("vehicles.editTitle", { title: vehicle.title })}
      submitLabel={t("vehicles.save")}
      error={error}
      pending={pending}
      onSubmit={() =>
        run(`${API}/vehicles/${vehicle.id}`, "POST", {
          description: description.trim() || null,
          features: features
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 40),
        })
      }
    >
      <FormField
        label={t("vehicles.publicDescription")}
        htmlFor={`d-${vehicle.id}`}
        hint={t("vehicles.publicDescriptionHint")}
      >
        <Textarea
          id={`d-${vehicle.id}`}
          rows={6}
          maxLength={4000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormField>
      <FormField
        label={t("vehicles.features")}
        htmlFor={`f-${vehicle.id}`}
        hint={t("vehicles.featuresHint")}
      >
        <Textarea
          id={`f-${vehicle.id}`}
          rows={6}
          value={features}
          onChange={(e) => setFeatures(e.target.value)}
        />
      </FormField>
    </ActionDialog>
  );
}

function VisibilityBadge({ vehicle }: { vehicle: ManagedVehicle }) {
  const t = useTranslations("storefrontAdmin");
  const state = visibilityOf(vehicle);
  const styles = {
    live: "bg-emerald-600/10 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-300",
    waiting: "bg-amber-600/12 text-amber-700 dark:bg-amber-400/12 dark:text-amber-300",
    hidden: "bg-muted text-muted-foreground",
  }[state];
  const Icon = { live: GlobeIcon, waiting: HourglassIcon, hidden: EyeOffIcon }[state];
  const label = {
    live: t("vehicles.liveNow"),
    waiting: t("vehicles.waiting"),
    hidden: t("vehicles.hidden"),
  }[state];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        styles,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

/**
 * Every car in stock with its "show on website" switch: filter, search, sort, and switch many
 * at once. Each change goes through the same endpoint and database check as a single switch.
 */
export function VehiclesPanel({
  vehicles,
  currency,
  detailsReady,
}: {
  vehicles: ManagedVehicle[];
  currency: string;
  detailsReady: boolean;
}) {
  const t = useTranslations("storefrontAdmin");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("all");
  const [stage, setStage] = useState<Stage>("all");
  const [details, setDetails] = useState<Details>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  // Shown at once while the server confirms, then replaced by the refreshed list.
  const [optimistic, setOptimistic] = useState<Map<string, boolean>>(new Map());

  const rows = useMemo(
    () =>
      vehicles.map((vehicle) => {
        const published = optimistic.get(vehicle.id) ?? vehicle.published;
        return {
          ...vehicle,
          published,
          live: published && (vehicle.status === "ready_for_sale" || vehicle.status === "reserved"),
        };
      }),
    [optimistic, vehicles],
  );

  const counts = useMemo(() => {
    const result = { all: rows.length, live: 0, waiting: 0, hidden: 0 };
    for (const row of rows) result[visibilityOf(row)] += 1;
    return result;
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (visibility !== "all" && visibilityOf(row) !== visibility) return false;
      if (stage === "preparing" && (row.status === "ready_for_sale" || row.status === "reserved"))
        return false;
      if (stage !== "all" && stage !== "preparing" && row.status !== stage) return false;
      const hasDetails = Boolean(row.description || row.features.length);
      if (details === "with" && !hasDetails) return false;
      if (details === "without" && hasDetails) return false;
      if (needle && !`${row.title} ${row.stockNumber}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    const byPrice = (a: ManagedVehicle, b: ManagedVehicle, direction: 1 | -1) =>
      a.price === null ? 1 : b.price === null ? -1 : (a.price - b.price) * direction;
    return list.sort((a, b) =>
      sort === "price_asc"
        ? byPrice(a, b, 1)
        : sort === "price_desc"
          ? byPrice(a, b, -1)
          : sort === "name"
            ? a.title.localeCompare(b.title)
            : sort === "oldest"
              ? a.createdAt.localeCompare(b.createdAt)
              : b.createdAt.localeCompare(a.createdAt),
    );
  }, [details, query, rows, sort, stage, visibility]);

  const filtering = query !== "" || visibility !== "all" || stage !== "all" || details !== "all";
  const reset = () => {
    setQuery("");
    setVisibility("all");
    setStage("all");
    setDetails("all");
  };

  const visibleIds = filtered.map((row) => row.id);
  const selectedVisible = visibleIds.filter((id) => selected.has(id));
  const allSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;

  async function apply(ids: string[], published: boolean) {
    const changing = ids.filter((id) => rows.find((row) => row.id === id)?.published !== published);
    if (changing.length === 0) return;
    setBusy((current) => new Set([...current, ...changing]));
    setOptimistic(
      (current) => new Map([...current, ...changing.map((id) => [id, published] as const)]),
    );
    let failed = 0;
    // A few at a time, so a long list doesn't flood the server.
    for (let index = 0; index < changing.length; index += 5) {
      const batch = changing.slice(index, index + 5);
      const outcomes = await Promise.all(
        batch.map((id) => platformRequest(`${API}/vehicles/${id}`, "POST", { published })),
      );
      outcomes.forEach((outcome, position) => {
        if (outcome.ok) return;
        failed += 1;
        setOptimistic((current) => {
          const next = new Map(current);
          next.delete(batch[position]);
          return next;
        });
      });
    }
    setBusy((current) => new Set([...current].filter((id) => !changing.includes(id))));
    if (failed) toast.error(t("vehicles.bulkFailed", { count: failed }));
    else
      toast.success(
        t(published ? "vehicles.bulkShown" : "vehicles.bulkHidden", { count: changing.length }),
      );
    setSelected(new Set());
    router.refresh();
  }

  const segments: { key: Visibility; label: string; icon: typeof GlobeIcon }[] = [
    { key: "all", label: t("vehicles.filters.all"), icon: CarFrontIcon },
    { key: "live", label: t("vehicles.filters.live"), icon: GlobeIcon },
    { key: "waiting", label: t("vehicles.filters.waiting"), icon: HourglassIcon },
    { key: "hidden", label: t("vehicles.filters.hidden"), icon: EyeOffIcon },
  ];

  const price = (row: ManagedVehicle) =>
    row.price !== null ? formatCurrency(row.price, locale, currency) : t("vehicles.noPrice");
  const stageLabel = (row: ManagedVehicle) =>
    t(`vehicles.statuses.${STATUS_LABELS.has(row.status) ? row.status : "other"}`);
  const toggle = (row: ManagedVehicle) => (
    <Switch
      checked={row.published}
      disabled={busy.has(row.id)}
      aria-label={t("vehicles.listAria", { title: row.title })}
      onCheckedChange={(checked) => void apply([row.id], checked)}
    />
  );
  const detailsCell = (row: ManagedVehicle) =>
    detailsReady ? (
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "hidden items-center gap-1 text-xs xl:inline-flex",
            row.description || row.features.length ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <FileTextIcon className="size-3.5" aria-hidden />
          {row.description || row.features.length
            ? t("vehicles.hasDetails")
            : t("vehicles.noDetails")}
        </span>
        <ListingDetailsDialog vehicle={row} />
      </div>
    ) : (
      <span className="text-muted-foreground text-xs">{t("vehicles.detailsPending")}</span>
    );
  const pick = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("vehicles.title")}</CardTitle>
        <CardDescription>{t("vehicles.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {/* Which cars: one tap per state, with how many are in it. */}
        <div
          role="tablist"
          aria-label={t("vehicles.filters.visibility")}
          className="flex flex-wrap gap-2"
        >
          {segments.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={visibility === key}
              onClick={() => setVisibility(key)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors",
                visibility === key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-muted",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  visibility === key ? "bg-primary-foreground/20" : "bg-muted",
                )}
              >
                {formatNumber(counts[key], locale)}
              </span>
            </button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
          <div className="relative">
            <SearchIcon
              className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("vehicles.filters.search")}
              aria-label={t("vehicles.filters.search")}
              className="h-11 ps-9 md:h-10"
            />
          </div>
          <NativeSelect
            value={stage}
            onChange={(e) => setStage(e.target.value as Stage)}
            aria-label={t("vehicles.filters.stage")}
          >
            <option value="all">{t("vehicles.filters.anyStage")}</option>
            <option value="ready_for_sale">{t("vehicles.statuses.ready_for_sale")}</option>
            <option value="reserved">{t("vehicles.statuses.reserved")}</option>
            <option value="preparing">{t("vehicles.filters.preparing")}</option>
          </NativeSelect>
          <NativeSelect
            value={details}
            onChange={(e) => setDetails(e.target.value as Details)}
            aria-label={t("vehicles.filters.details")}
            disabled={!detailsReady}
          >
            <option value="all">{t("vehicles.filters.anyDetails")}</option>
            <option value="with">{t("vehicles.hasDetails")}</option>
            <option value="without">{t("vehicles.noDetails")}</option>
          </NativeSelect>
          <NativeSelect
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label={t("vehicles.filters.sort")}
          >
            <option value="newest">{t("vehicles.filters.newest")}</option>
            <option value="oldest">{t("vehicles.filters.oldest")}</option>
            <option value="price_desc">{t("vehicles.filters.priceDesc")}</option>
            <option value="price_asc">{t("vehicles.filters.priceAsc")}</option>
            <option value="name">{t("vehicles.filters.name")}</option>
          </NativeSelect>
        </div>

        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm" role="status">
            {t("vehicles.filters.showing", { shown: filtered.length, total: rows.length })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {filtering ? (
              <Button variant="ghost" size="sm" onClick={reset}>
                <RotateCcwIcon aria-hidden />
                {t("vehicles.filters.reset")}
              </Button>
            ) : null}
            {selectedVisible.length ? (
              <>
                <span className="text-sm font-medium">
                  {t("vehicles.selected", { count: selectedVisible.length })}
                </span>
                <Button
                  size="sm"
                  onClick={() => void apply(selectedVisible, true)}
                  disabled={busy.size > 0}
                >
                  <EyeIcon aria-hidden />
                  {t("vehicles.showSelected")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void apply(selectedVisible, false)}
                  disabled={busy.size > 0}
                >
                  <EyeOffIcon aria-hidden />
                  {t("vehicles.hideSelected")}
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("vehicles.clearSelection")}
                  onClick={() => setSelected(new Set())}
                >
                  <XIcon aria-hidden />
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState title={t("vehicles.none")} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={t("vehicles.filters.none")}
            action={
              <Button variant="outline" onClick={reset}>
                <RotateCcwIcon aria-hidden />
                {t("vehicles.filters.reset")}
              </Button>
            }
          />
        ) : (
          <>
            {/* Wide screens: a table. */}
            <div className="border-border hidden overflow-x-auto rounded-lg border md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs">
                  <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:text-start [&>th]:font-medium">
                    <th className="w-10">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={!allSelected && selectedVisible.length > 0}
                        aria-label={t("vehicles.selectAll")}
                        onCheckedChange={(on) =>
                          setSelected(
                            on
                              ? new Set([...selected, ...visibleIds])
                              : new Set([...selected].filter((id) => !visibleIds.includes(id))),
                          )
                        }
                      />
                    </th>
                    <th>{t("vehicles.car")}</th>
                    <th>{t("vehicles.price")}</th>
                    <th>{t("vehicles.status")}</th>
                    <th>{t("vehicles.details")}</th>
                    <th className="text-end">{t("vehicles.listed")}</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {filtered.map((row) => (
                    <tr
                      key={row.id}
                      className={cn(
                        "transition-colors [&>td]:px-3 [&>td]:py-3",
                        selected.has(row.id) ? "bg-brand-soft" : "hover:bg-muted/40",
                      )}
                    >
                      <td>
                        <Checkbox
                          checked={selected.has(row.id)}
                          aria-label={t("vehicles.selectOne", { title: row.title })}
                          onCheckedChange={(on) => pick(row.id, Boolean(on))}
                        />
                      </td>
                      <td>
                        <p className="font-medium">{row.title}</p>
                        <p className="text-muted-foreground text-xs" dir="ltr">
                          {row.stockNumber}
                        </p>
                      </td>
                      <td className="font-medium whitespace-nowrap tabular-nums">{price(row)}</td>
                      <td>
                        <div className="grid gap-1">
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <CircleDotIcon className="text-muted-foreground size-3" aria-hidden />
                            {stageLabel(row)}
                          </span>
                          <VisibilityBadge vehicle={row} />
                        </div>
                      </td>
                      <td>{detailsCell(row)}</td>
                      <td className="text-end">{toggle(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phones: one card per car. */}
            <ul className="grid gap-3 md:hidden">
              {filtered.map((row) => (
                <li
                  key={row.id}
                  className={cn(
                    "border-border grid gap-3 rounded-lg border p-3.5",
                    selected.has(row.id) && "bg-brand-soft",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      className="mt-1"
                      checked={selected.has(row.id)}
                      aria-label={t("vehicles.selectOne", { title: row.title })}
                      onCheckedChange={(on) => pick(row.id, Boolean(on))}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{row.title}</p>
                      <p className="text-muted-foreground text-xs">
                        <span dir="ltr">{row.stockNumber}</span> · {stageLabel(row)}
                      </p>
                      <p className="mt-1 text-sm font-semibold tabular-nums">{price(row)}</p>
                    </div>
                    {toggle(row)}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <VisibilityBadge vehicle={row} />
                    {detailsCell(row)}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
