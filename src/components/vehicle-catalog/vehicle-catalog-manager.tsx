"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import {
  CalendarIcon,
  CarFrontIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LayersIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { usePermission } from "@/hooks/use-permission";
import { cn } from "@/lib/utils";
import type { CatalogMake, CatalogModel, CatalogModelYear, CatalogVariant } from "@/types/vehicle";

type CatalogPayload = {
  makes: CatalogMake[];
  models: CatalogModel[];
  years: CatalogModelYear[];
  variants: CatalogVariant[];
};

type CatalogTable = "vehicle_makes" | "vehicle_models" | "vehicle_model_years" | "vehicle_variants";
type Translate = ReturnType<typeof useTranslations<"settings.catalog">>;

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\+/g, "-plus")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type CatalogParams = { makeId: string; modelId: string; modelYearId: string };

/** The lists plus the selection they were loaded for, so each column knows if it's current. */
async function fetchCatalog(params: CatalogParams): Promise<CatalogPayload & { params: CatalogParams }> {
  const search = new URLSearchParams();
  if (params.makeId) search.set("makeId", params.makeId);
  if (params.modelId) search.set("modelId", params.modelId);
  if (params.modelYearId) search.set("modelYearId", params.modelYearId);
  const response = await fetch(`/api/settings/catalog?${search}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const json = (await response.json()) as {
    status: string;
    data?: CatalogPayload;
    message?: string;
  };
  if (json.status !== "success" || !json.data) {
    throw new Error(json.message ?? "Failed to load catalog");
  }
  return { ...json.data, params };
}

async function postCatalog(body: Record<string, unknown>) {
  const response = await fetch("/api/settings/catalog", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as { status: string; message?: string };
  if (json.status !== "success") {
    throw new Error(json.message ?? "Catalog update failed");
  }
}

type EditValues = { name?: string; nameAr?: string | null; year?: number };

type Item = {
  id: string;
  label: string;
  /** Arabic name, shown under brands. */
  sub?: string | null;
  isActive: boolean;
  value: string;
  valueAr?: string | null;
};

type Level = 0 | 1 | 2 | 3;

/**
 * Brands → Models → Years → Variants as side-by-side columns: picking an entry opens the
 * next column, each with its own search and quick add. Phones show one column at a time.
 */
export function VehicleCatalogManager() {
  const t = useTranslations("settings.catalog");
  const queryClient = useQueryClient();
  const { user } = usePermission();
  const isSuperAdmin = user?.roles.includes("super_admin") ?? false;

  const [makeId, setMakeId] = useState("");
  const [modelId, setModelId] = useState("");
  const [modelYearId, setModelYearId] = useState("");
  /** The column shown on phones. */
  const [level, setLevel] = useState<Level>(0);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["settings-catalog", makeId, modelId, modelYearId],
    queryFn: () => fetchCatalog({ makeId, modelId, modelYearId }),
    placeholderData: keepPreviousData,
  });

  const mutation = useMutation({
    mutationFn: postCatalog,
    onSuccess: async () => {
      setError(null);
      for (const key of [
        "settings-catalog",
        "vehicle-brands",
        "vehicle-models",
        "vehicle-years",
        "vehicle-variants",
      ]) {
        await queryClient.invalidateQueries({ queryKey: [key] });
      }
      await queryClient.invalidateQueries({ queryKey: ["inventory", "meta"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  // While a new selection loads, the previous lists stay on screen. A column shows a
  // skeleton only while the lists on screen belong to a different parent than the one
  // now selected, so picking a model doesn't blank the Models column.
  const shown = query.data?.params;
  const waiting = (selected: string, loadedFor: string | undefined) =>
    !!selected && selected !== loadedFor && !query.isError;
  const modelsLoading = waiting(makeId, shown?.makeId);
  const yearsLoading = waiting(modelId, shown?.modelId);
  const variantsLoading = waiting(modelYearId, shown?.modelYearId);
  const makes = query.data?.makes ?? [];
  const models = query.data?.models ?? [];
  const years = query.data?.years ?? [];
  const variants = query.data?.variants ?? [];

  const make = makes.find((m) => m.id === makeId) ?? null;
  const model = models.find((m) => m.id === modelId) ?? null;
  const year = years.find((y) => y.id === modelYearId) ?? null;

  function selectMake(next: string) {
    setMakeId(next);
    setModelId("");
    setModelYearId("");
    if (next) setLevel(1);
  }
  function selectModel(next: string) {
    setModelId(next);
    setModelYearId("");
    if (next) setLevel(2);
  }
  function selectYear(next: string) {
    setModelYearId(next);
    if (next) setLevel(3);
  }

  function actions(table: CatalogTable) {
    return {
      onToggle: (item: Item) =>
        mutation.mutate({ action: "setActive", table, id: item.id, isActive: !item.isActive }),
      onUpdate: isSuperAdmin
        ? (id: string, values: EditValues, done: () => void) =>
            mutation.mutate(
              { action: "update", table, id, ...values },
              {
                onSuccess: () => {
                  toast.success(t("saved"));
                  done();
                },
              },
            )
        : undefined,
      onDelete: isSuperAdmin
        ? (item: Item) => {
            if (table === "vehicle_makes" && item.id === makeId) selectMake("");
            if (table === "vehicle_models" && item.id === modelId) selectModel("");
            if (table === "vehicle_model_years" && item.id === modelYearId) selectYear("");
            mutation.mutate(
              { action: "delete", table, id: item.id },
              { onSuccess: () => toast.success(t("deleted", { name: item.label })) },
            );
          }
        : undefined,
      busy: mutation.isPending,
    };
  }

  function add(body: Record<string, unknown>, name: string, done: () => void) {
    mutation.mutate(body, {
      onSuccess: () => {
        toast.success(t("added", { name }));
        done();
      },
    });
  }

  const path: { label: string; level: Level }[] = [
    { label: t("allBrands"), level: 0 },
    ...(make ? [{ label: make.name, level: 1 as Level }] : []),
    ...(model ? [{ label: model.name, level: 2 as Level }] : []),
    ...(year ? [{ label: String(year.year), level: 3 as Level }] : []),
  ];

  function goTo(target: Level) {
    if (target === 0) selectMake("");
    else if (target === 1) selectModel("");
    else if (target === 2) selectYear("");
    setLevel(target);
  }

  const columnClass = (index: Level) => cn(level === index ? "flex" : "hidden", "lg:flex");

  return (
    <div className="flex flex-col gap-4">
      {error || query.error ? (
        <Alert variant="destructive">
          <AlertDescription>{error ?? query.error?.message}</AlertDescription>
        </Alert>
      ) : null}

      {/* Where you are; each step jumps back to that level. */}
      <nav
        aria-label={t("title")}
        className="bg-card flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl border px-2 py-1.5 shadow-xs"
      >
        {path.map((step, index) => {
          const last = index === path.length - 1;
          return (
            <span key={step.level} className="flex shrink-0 items-center gap-1">
              {index > 0 ? (
                <ChevronRightIcon
                  className="text-muted-foreground size-4 rtl:rotate-180"
                  aria-hidden
                />
              ) : null}
              <button
                type="button"
                onClick={() => goTo(step.level)}
                aria-current={last ? "location" : undefined}
                className={cn(
                  "rounded-md px-2 py-1 text-sm transition-colors",
                  last
                    ? "bg-brand-soft text-brand-strong dark:text-brand font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {step.label}
              </button>
            </span>
          );
        })}
      </nav>

      <div className="grid gap-3 lg:grid-cols-4">
        <Column
          className={columnClass(0)}
          icon={CarFrontIcon}
          title={t("brands")}
          items={makes.map((m) => ({
            id: m.id,
            label: m.name,
            sub: m.nameAr,
            isActive: m.isActive,
            value: m.name,
            valueAr: m.nameAr,
          }))}
          loading={query.isPending}
          selectedId={makeId}
          onSelect={selectMake}
          editKind="brand"
          add={{
            placeholder: t("newBrand"),
            withArabic: true,
            submit: (name, nameAr, done) =>
              add(
                { action: "upsertMake", name, nameAr: nameAr || null, slug: slugify(name) },
                name,
                done,
              ),
          }}
          t={t}
          {...actions("vehicle_makes")}
        />
        <Column
          className={columnClass(1)}
          icon={LayersIcon}
          title={t("models")}
          context={make?.name}
          items={
            makeId
              ? models.map((m) => ({
                  id: m.id,
                  label: m.name,
                  isActive: m.isActive,
                  value: m.name,
                }))
              : null
          }
          loading={modelsLoading}
          pickText={t("pickBrand")}
          selectedId={modelId}
          onSelect={selectModel}
          onBack={() => goTo(0)}
          editKind="name"
          add={
            make
              ? {
                  placeholder: t("newModel", { brand: make.name }),
                  submit: (name, _ar, done) =>
                    add({ action: "upsertModel", makeId, name, slug: slugify(name) }, name, done),
                }
              : undefined
          }
          t={t}
          {...actions("vehicle_models")}
        />
        <Column
          className={columnClass(2)}
          icon={CalendarIcon}
          title={t("years")}
          context={make && model ? `${make.name} ${model.name}` : undefined}
          items={
            modelId
              ? years.map((y) => ({
                  id: y.id,
                  label: String(y.year),
                  sub: y.market,
                  isActive: y.isActive,
                  value: String(y.year),
                }))
              : null
          }
          loading={yearsLoading}
          pickText={t("pickModel")}
          selectedId={modelYearId}
          onSelect={selectYear}
          onBack={() => goTo(1)}
          editKind="year"
          add={
            model
              ? {
                  placeholder: t("newYear"),
                  numeric: true,
                  submit: (value, _ar, done) =>
                    add(
                      { action: "upsertYear", modelId, year: Number(value), market: "UAE" },
                      value,
                      done,
                    ),
                }
              : undefined
          }
          t={t}
          {...actions("vehicle_model_years")}
        />
        <Column
          className={columnClass(3)}
          icon={LayersIcon}
          title={t("variants")}
          context={model && year ? `${model.name} ${year.year}` : undefined}
          items={
            modelYearId
              ? variants.map((v) => ({
                  id: v.id,
                  label: v.name,
                  isActive: v.isActive,
                  value: v.name,
                }))
              : null
          }
          loading={variantsLoading}
          pickText={t("pickYear")}
          onBack={() => goTo(2)}
          editKind="name"
          add={
            year
              ? {
                  placeholder: t("newVariant", {
                    year: `${model?.name ?? ""} ${year.year}`.trim(),
                  }),
                  submit: (name, _ar, done) =>
                    add(
                      { action: "upsertVariant", modelYearId, name, slug: slugify(name) },
                      name,
                      done,
                    ),
                }
              : undefined
          }
          t={t}
          {...actions("vehicle_variants")}
        />
      </div>
    </div>
  );
}

type AddConfig = {
  placeholder: string;
  withArabic?: boolean;
  numeric?: boolean;
  submit: (value: string, valueAr: string, done: () => void) => void;
};

function Column({
  className,
  icon: Icon,
  title,
  context,
  items,
  loading = false,
  pickText,
  selectedId,
  onSelect,
  onBack,
  add,
  editKind,
  onToggle,
  onUpdate,
  onDelete,
  busy,
  t,
}: {
  className?: string;
  icon: LucideIcon;
  title: string;
  /** What this column belongs to, e.g. the brand for Models. */
  context?: string;
  /** null until the previous column has a selection. */
  items: Item[] | null;
  loading?: boolean;
  pickText?: string;
  selectedId?: string;
  onSelect?: (id: string) => void;
  onBack?: () => void;
  add?: AddConfig;
  editKind: "brand" | "name" | "year";
  onToggle: (item: Item) => void;
  onUpdate?: (id: string, values: EditValues, done: () => void) => void;
  onDelete?: (item: Item) => void;
  busy: boolean;
  t: Translate;
}) {
  const [search, setSearch] = useState("");
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!items || !term) return items;
    return items.filter((item) => `${item.label} ${item.sub ?? ""}`.toLowerCase().includes(term));
  }, [items, search]);
  const locked = items === null;

  return (
    <section
      className={cn(
        "bg-card ring-foreground/[0.07] h-[max(26rem,calc(100svh-19rem))] min-w-0 flex-col overflow-hidden rounded-xl shadow-xs ring-1",
        locked && "lg:bg-muted/30",
        className,
      )}
      aria-label={title}
    >
      <header className="grid gap-3 border-b p-3">
        <div className="flex items-center gap-2.5">
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              onClick={onBack}
              aria-label={t("back")}
            >
              <ChevronLeftIcon className="rtl:rotate-180" />
            </Button>
          ) : null}
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              locked ? "bg-muted text-muted-foreground" : "bg-brand-soft text-brand",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
          <div className="grid min-w-0 flex-1">
            <h2 className="font-heading truncate text-sm font-semibold">{title}</h2>
            <p className="text-muted-foreground truncate text-xs">
              {items && !loading ? t("count", { count: items.length }) : (context ?? " ")}
              {items && !loading && context ? ` · ${context}` : null}
            </p>
          </div>
        </div>
        {!locked ? (
          <InputGroup className="h-8">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("searchIn", { list: title.toLowerCase() })}
              aria-label={t("searchIn", { list: title.toLowerCase() })}
            />
            {search ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  onClick={() => setSearch("")}
                  aria-label={t("cancel")}
                >
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="grid gap-1 p-2" aria-busy="true">
            {Array.from({ length: 7 }, (_, index) => (
              <Skeleton key={index} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : locked ? (
          <div className="text-muted-foreground grid h-full place-items-center p-6 text-center text-sm">
            <div className="grid justify-items-center gap-2">
              <Icon className="size-8 opacity-30" aria-hidden />
              {pickText}
            </div>
          </div>
        ) : visible && visible.length > 0 ? (
          <ul className="grid gap-0.5 p-2">
            {visible.map((item) => (
              <Row
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                onSelect={onSelect}
                editKind={editKind}
                onToggle={onToggle}
                onUpdate={onUpdate}
                onDelete={onDelete}
                busy={busy}
                t={t}
              />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground p-6 text-center text-sm">
            {search ? t("noMatches") : t("empty")}
          </p>
        )}
      </div>

      {add ? <AddBar config={add} busy={busy} t={t} /> : null}
    </section>
  );
}

/** Quick add at the bottom of a column: type and press Enter. */
function AddBar({ config, busy, t }: { config: AddConfig; busy: boolean; t: Translate }) {
  const [value, setValue] = useState("");
  const [valueAr, setValueAr] = useState("");
  const valid = config.numeric ? /^\d{4}$/.test(value) : value.trim().length > 0;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    config.submit(value.trim(), valueAr.trim(), () => {
      setValue("");
      setValueAr("");
    });
  }

  return (
    <form onSubmit={submit} className="bg-muted/30 grid gap-2 border-t p-2">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={config.placeholder}
          aria-label={config.placeholder}
          type={config.numeric ? "number" : "text"}
          inputMode={config.numeric ? "numeric" : undefined}
          min={config.numeric ? 1980 : undefined}
          max={config.numeric ? 2100 : undefined}
          className="bg-card h-9 min-w-0 flex-1"
        />
        <Button
          type="submit"
          variant="brand"
          size="sm"
          className="h-9 shrink-0"
          disabled={!valid || busy}
        >
          <PlusIcon />
          <span className="sr-only sm:not-sr-only">{t("add")}</span>
        </Button>
      </div>
      {/* The Arabic name only appears once a brand name is typed. */}
      {config.withArabic && value.trim() ? (
        <Input
          value={valueAr}
          onChange={(event) => setValueAr(event.target.value)}
          placeholder={t("newBrandAr")}
          aria-label={t("newBrandAr")}
          dir="rtl"
          className="bg-card animate-rise h-9"
        />
      ) : null}
    </form>
  );
}

function Row({
  item,
  selected,
  onSelect,
  editKind,
  onToggle,
  onUpdate,
  onDelete,
  busy,
  t,
}: {
  item: Item;
  selected: boolean;
  onSelect?: (id: string) => void;
  editKind: "brand" | "name" | "year";
  onToggle: (item: Item) => void;
  onUpdate?: (id: string, values: EditValues, done: () => void) => void;
  onDelete?: (item: Item) => void;
  busy: boolean;
  t: Translate;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [draft, setDraft] = useState(item.value);
  const [draftAr, setDraftAr] = useState(item.valueAr ?? "");
  const draftValid = editKind === "year" ? /^\d{4}$/.test(draft) : draft.trim().length > 0;

  if (mode === "edit" && onUpdate) {
    return (
      <li className="bg-brand-soft/50 ring-brand/30 rounded-lg p-2 ring-1">
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draftValid) return;
            const values: EditValues =
              editKind === "year"
                ? { year: Number(draft) }
                : editKind === "brand"
                  ? { name: draft.trim(), nameAr: draftAr.trim() || null }
                  : { name: draft.trim() };
            onUpdate(item.id, values, () => setMode("view"));
          }}
        >
          <Input
            autoFocus
            aria-label={editKind === "year" ? t("year") : t("name")}
            type={editKind === "year" ? "number" : "text"}
            inputMode={editKind === "year" ? "numeric" : undefined}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="bg-card h-8"
          />
          {editKind === "brand" ? (
            <Input
              aria-label={t("nameAr")}
              placeholder={t("nameAr")}
              dir="rtl"
              value={draftAr}
              onChange={(event) => setDraftAr(event.target.value)}
              className="bg-card h-8"
            />
          ) : null}
          <div className="flex justify-end gap-1.5">
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("view")}>
              {t("cancel")}
            </Button>
            <Button type="submit" size="sm" variant="brand" disabled={busy || !draftValid}>
              <CheckIcon />
              {t("save")}
            </Button>
          </div>
        </form>
      </li>
    );
  }

  if (mode === "delete" && onDelete) {
    return (
      <li className="bg-destructive/8 ring-destructive/30 grid gap-2 rounded-lg p-2.5 ring-1">
        <p className="text-sm font-medium">{t("deleteConfirm", { name: item.label })}</p>
        <div className="flex justify-end gap-1.5">
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode("view")}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => {
              onDelete(item);
              setMode("view");
            }}
          >
            <Trash2Icon />
            {t("delete")}
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "group/row relative flex items-center gap-1 rounded-lg transition-colors",
        selected ? "bg-brand-soft ring-brand/40 ring-1" : "hover:bg-muted/70",
      )}
    >
      {selected ? (
        <span className="bg-gold absolute inset-y-1.5 start-0 w-0.5 rounded-full" aria-hidden />
      ) : null}
      <button
        type="button"
        disabled={!onSelect}
        onClick={() => onSelect?.(item.id)}
        aria-pressed={onSelect ? selected : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-start disabled:cursor-default"
      >
        <span className="grid min-w-0 flex-1">
          <span
            className={cn(
              "truncate text-sm",
              selected && "font-semibold",
              !item.isActive && "text-muted-foreground",
            )}
          >
            {item.label}
          </span>
          {item.sub ? (
            <span className="text-muted-foreground truncate text-xs" dir="auto">
              {item.sub}
            </span>
          ) : null}
        </span>
        {!item.isActive ? (
          <span
            className="bg-muted text-muted-foreground shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            title={t("inactiveHint")}
          >
            {t("inactive")}
          </span>
        ) : null}
      </button>

      <div className="flex shrink-0 items-center gap-0.5 pe-1.5">
        <Switch
          size="sm"
          checked={item.isActive}
          disabled={busy}
          onCheckedChange={() => onToggle(item)}
          aria-label={t("toggleActive", { name: item.label })}
          title={item.isActive ? t("deactivate") : t("activate")}
        />
        {onUpdate || onDelete ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground opacity-100 lg:opacity-0 lg:group-hover/row:opacity-100 lg:focus-visible:opacity-100 lg:data-popup-open:opacity-100"
                  aria-label={t("more", { name: item.label })}
                />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-36">
              {onUpdate ? (
                <DropdownMenuItem
                  onClick={() => {
                    setDraft(item.value);
                    setDraftAr(item.valueAr ?? "");
                    setMode("edit");
                  }}
                >
                  <PencilIcon />
                  {t("edit")}
                </DropdownMenuItem>
              ) : null}
              {onDelete ? (
                <DropdownMenuItem variant="destructive" onClick={() => setMode("delete")}>
                  <Trash2Icon />
                  {t("delete")}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {onSelect ? (
          <ChevronRightIcon
            className={cn(
              "size-4 shrink-0 rtl:rotate-180",
              selected ? "text-brand" : "text-muted-foreground/50",
            )}
            aria-hidden
          />
        ) : null}
      </div>
    </li>
  );
}
