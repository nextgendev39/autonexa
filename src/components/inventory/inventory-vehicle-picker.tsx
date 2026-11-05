"use client";

import { CheckIcon, ChevronsUpDownIcon, Loader2Icon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, useDeferredValue } from "react";

import { VehicleStatusBadge } from "@/components/inventory/vehicle-status-badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useVehicleList } from "@/hooks/use-vehicles";
import { cn } from "@/lib/utils";
import type { VehicleListItem, VehicleStatus } from "@/types/vehicle";

export type InventoryVehiclePickerProps = {
  id?: string;
  value: string | null;
  selected?: VehicleListItem | null;
  branchId?: string | null;
  /** Single status → server filter. Multiple → client filter after fetch. */
  statuses?: readonly VehicleStatus[];
  disabled?: boolean;
  onSelect: (vehicle: VehicleListItem) => void;
  onClear?: () => void;
  "aria-invalid"?: boolean | "true" | "false";
  /** i18n namespace prefix, e.g. "acquisitions.vehiclePicker" or "workshop.vehiclePicker" */
  labelsKey?: string;
};

function vehicleTitle(vehicle: VehicleListItem) {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
}

export function InventoryVehiclePicker({
  id,
  value,
  selected,
  branchId,
  statuses,
  disabled,
  onSelect,
  onClear,
  "aria-invalid": ariaInvalid,
  labelsKey = "inventory.vehiclePicker",
}: InventoryVehiclePickerProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());

  const singleStatus = statuses?.length === 1 ? statuses[0] : undefined;
  const statusSet = useMemo(
    () => (statuses && statuses.length > 1 ? new Set(statuses) : null),
    [statuses],
  );

  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("pageSize", statusSet ? "50" : "25");
  params.set("sort", "updated_at");
  params.set("order", "desc");
  if (singleStatus) params.set("status", singleStatus);
  if (deferredSearch) params.set("q", deferredSearch);
  if (branchId) params.set("branchId", branchId);

  const query = useVehicleList(params.toString(), { enabled: open || Boolean(selected) });
  const items = useMemo(() => {
    const rows = query.data?.items ?? [];
    if (!statusSet) return rows;
    return rows.filter((vehicle) => statusSet.has(vehicle.status));
  }, [query.data?.items, statusSet]);

  const showLoading = open && (query.isPending || query.isFetching);
  const showError = open && query.isError && !showLoading;

  return (
    <div className="grid gap-2">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-invalid={ariaInvalid}
              disabled={disabled}
              className={cn(
                "h-auto min-h-11 w-full justify-between gap-2 px-3 py-2 text-start font-normal md:min-h-10",
                !selected && "text-muted-foreground",
              )}
            />
          }
        >
          {selected ? (
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate font-medium">{vehicleTitle(selected)}</span>
              <span className="text-muted-foreground truncate text-xs">
                {selected.stockNumber}
                {selected.vin ? ` · ${selected.vin}` : ""}
              </span>
            </span>
          ) : (
            <span>{t(`${labelsKey}.placeholder`)}</span>
          )}
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" aria-hidden />
        </PopoverTrigger>
        <PopoverContent className="w-(--anchor-width) min-w-72 p-0" align="start" sideOffset={4}>
          <Command shouldFilter={false}>
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder={t(`${labelsKey}.searchPlaceholder`)}
            />
            <CommandList>
              {showLoading ? (
                <div className="text-muted-foreground flex items-center gap-2 px-3 py-6 text-sm">
                  <Loader2Icon className="size-4 animate-spin" aria-hidden />
                  {t("common.loading")}
                </div>
              ) : null}
              {showError ? (
                <div className="text-destructive px-3 py-6 text-center text-sm">
                  {query.error instanceof Error
                    ? query.error.message
                    : t(`${labelsKey}.loadFailed`)}
                </div>
              ) : null}
              {!showLoading && !showError ? (
                items.length === 0 ? (
                  <div className="text-muted-foreground px-3 py-6 text-center text-sm">
                    {deferredSearch
                      ? t(`${labelsKey}.empty`)
                      : t(`${labelsKey}.emptyHint`)}
                  </div>
                ) : (
                  <CommandGroup>
                    {items.map((vehicle) => {
                      const active = vehicle.id === value;
                      return (
                        <CommandItem
                          key={vehicle.id}
                          value={`${vehicle.stockNumber} ${vehicle.make} ${vehicle.model} ${vehicle.vin ?? ""} ${vehicle.id}`}
                          data-checked={active || undefined}
                          onSelect={() => {
                            onSelect(vehicle);
                            setOpen(false);
                          }}
                          className="items-start gap-2 py-2.5"
                        >
                          <CheckIcon
                            className={cn(
                              "mt-0.5 size-4 shrink-0",
                              active ? "opacity-100" : "opacity-0",
                            )}
                            aria-hidden
                          />
                          <span className="grid min-w-0 flex-1 gap-1">
                            <span className="truncate font-medium">{vehicleTitle(vehicle)}</span>
                            <span className="text-muted-foreground text-xs">
                              {t(`${labelsKey}.stock`, { stock: vehicle.stockNumber })}
                              {vehicle.vin
                                ? ` · ${t(`${labelsKey}.vin`, { vin: vehicle.vin })}`
                                : ""}
                            </span>
                            <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                              <span>
                                {t(`${labelsKey}.branch`, {
                                  branch: vehicle.branchName ?? "—",
                                })}
                              </span>
                              <VehicleStatusBadge status={vehicle.status} />
                            </span>
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected && onClear ? (
        <div className="bg-muted/40 flex flex-wrap items-start justify-between gap-2 rounded-xl border p-3">
          <div className="grid min-w-0 gap-1">
            <p className="text-sm font-medium">{vehicleTitle(selected)}</p>
            <p className="text-muted-foreground text-xs">
              {selected.stockNumber}
              {selected.vin ? ` · ${selected.vin}` : ""}
              {selected.branchName ? ` · ${selected.branchName}` : ""}
            </p>
            <div className="pt-0.5">
              <VehicleStatusBadge status={selected.status} />
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            disabled={disabled}
            onClick={onClear}
          >
            <XIcon aria-hidden />
            {t(`${labelsKey}.clear`)}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
