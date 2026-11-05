"use client";

import { CheckIcon, PipetteIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { VEHICLE_COLORS, resolveColorHex } from "@/lib/vehicles/colors";

export type VehicleColorFieldProps = {
  id: string;
  value?: string | null;
  onValueChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
};

const LIGHT_COLORS = new Set([
  "White",
  "Pearl White",
  "Ivory",
  "Cream",
  "Silver",
  "Yellow",
  "Light Blue",
]);

function ColorSwatch({
  hex,
  className,
  size = "md",
}: {
  hex: string | null;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "border-border inline-block shrink-0 rounded-full border shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]",
        size === "sm" ? "size-4" : "size-5",
        !hex && "bg-muted",
        className,
      )}
      style={hex ? { backgroundColor: hex } : undefined}
    />
  );
}

export function VehicleColorField({
  id,
  value,
  onValueChange,
  onBlur,
  placeholder,
  disabled,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: VehicleColorFieldProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  const selected = value?.trim() || "";
  const selectedHex = resolveColorHex(selected);
  const emptyLabel = placeholder ?? t("inventory.fields.selectPlaceholder");

  function pick(name: string) {
    onValueChange(name);
    setCustom("");
    setOpen(false);
  }

  function clear(event: React.MouseEvent | React.PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    onValueChange("");
    setCustom("");
  }

  function applyCustom() {
    const next = custom.trim();
    if (!next) return;
    onValueChange(next);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setCustom(selected && !resolveColorHex(selected) ? selected : "");
        if (!next) onBlur?.();
      }}
    >
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedBy}
            aria-expanded={open}
            className={cn(
              "border-input h-11 w-full justify-between gap-2 px-2.5 font-normal md:h-10",
              !selected && "text-muted-foreground",
            )}
          />
        }
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 text-start">
          <ColorSwatch hex={selectedHex} />
          <span className="truncate">{selected || emptyLabel}</span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          {selected ? (
            <span
              role="button"
              tabIndex={-1}
              className="text-muted-foreground hover:text-foreground rounded p-0.5"
              aria-label={t("common.clear")}
              onPointerDown={clear}
              onClick={clear}
            >
              <XIcon className="size-3.5" />
            </span>
          ) : (
            <PipetteIcon className="text-muted-foreground size-4 opacity-70" aria-hidden />
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-72 p-3">
        <div className="grid grid-cols-6 gap-2">
          {VEHICLE_COLORS.map((color) => {
            const checked = selected.toLowerCase() === color.name.toLowerCase();
            return (
              <button
                key={color.name}
                type="button"
                title={color.name}
                aria-label={color.name}
                aria-pressed={checked}
                className={cn(
                  "relative flex size-9 items-center justify-center rounded-lg border transition-shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  checked
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border hover:border-foreground/30",
                )}
                style={{ backgroundColor: color.hex }}
                onPointerDown={(event) => {
                  // Commit before the popover dismisses on pointer-up/click.
                  event.preventDefault();
                  pick(color.name);
                }}
              >
                {checked ? (
                  <CheckIcon
                    className={cn(
                      "size-4 drop-shadow-sm",
                      LIGHT_COLORS.has(color.name) ? "text-foreground" : "text-white",
                    )}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            value={custom}
            placeholder={t("inventory.fields.customColor")}
            className="h-9"
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyCustom();
              }
            }}
          />
          <Button
            type="button"
            variant="secondary"
            className="h-9 shrink-0"
            onPointerDown={(event) => {
              event.preventDefault();
              applyCustom();
            }}
          >
            {t("common.save")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function VehicleColorDisplay({ value }: { value: string | null | undefined }) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <ColorSwatch hex={resolveColorHex(trimmed)} size="sm" />
      {trimmed}
    </span>
  );
}
